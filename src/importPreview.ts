/**
 * Pré-validação de relatórios de produtos e pagamentos no navegador.
 * Esta etapa NÃO grava dados em PostgreSQL nem armazena os arquivos.
 * Um backend transacional será necessário antes da importação definitiva.
 */
export type CellValue = string | number | boolean | Date | null;
export type SheetData = { sheet: string; data: CellValue[][] };
export interface MonthlyImportPreview {
  period: string;
  productRows: number;
  paymentRows: number;
  soldProductCodes: number;
  positiveSalesCents: number;
  adjustmentsCents: number;
  productsTotalCents: number;
  paymentsTotalCents: number;
  differenceCents: number;
  reconciled: boolean;
  methods: Array<{ label: string; totalCents: number }>;
}

const MAX_BYTES = 20 * 1024 * 1024;
const PERIOD_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

function normalized(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function asText(value: CellValue, context: string): string {
  if (value == null || value instanceof Date || typeof value === 'boolean') {
    throw new Error(`Campo obrigatório inválido: ${context}.`);
  }
  const text = String(value).trim();
  if (!text || /^#(N\/A|VALUE!|REF!|DIV\/0!|NUM!)/i.test(text)) {
    throw new Error(`Campo obrigatório inválido: ${context}.`);
  }
  return text;
}

function asInteger(value: CellValue, context: string): number {
  const raw = asText(value, context);
  if (!/^\d+$/.test(raw)) throw new Error(`Inteiro inválido em ${context}.`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) throw new Error(`Número fora do limite em ${context}.`);
  return n;
}

export function moneyCents(value: CellValue, context: string): number {
  const raw = asText(value, context);
  let clean: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Valor monetário inválido em ${context}.`);
    clean = String(value);
  } else if (/^-?\d+(?:\.\d{1,2})?$/.test(raw)) {
    clean = raw;
  } else if (/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw) && raw.includes(',')) {
    clean = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+(?:,\d{1,2})?$/.test(raw)) {
    clean = raw.replace(',', '.');
  } else {
    throw new Error(`Valor monetário ambíguo ou inválido em ${context}.`);
  }
  const n = Number(clean);
  const cents = Math.round(n * 100);
  if (!Number.isSafeInteger(cents) || !Number.isFinite(n) || Math.abs(n * 100 - cents) > 1e-6) {
    throw new Error(`Valor monetário com precisão inválida em ${context}.`);
  }
  return cents;
}

function safeSum(a: number, b: number): number {
  const total = a + b;
  if (!Number.isSafeInteger(total)) throw new Error('Total monetário ultrapassou o limite seguro.');
  return total;
}

function findTable(sheets: SheetData[], fields: string[], label: string) {
  const matches: Array<{ sheet: string; rows: CellValue[][]; headerRow: number; columns: Record<string, number> }> = [];
  for (const sheet of sheets) {
    for (let rowIndex = 0; rowIndex < Math.min(sheet.data.length, 50); rowIndex++) {
      const headers = sheet.data[rowIndex].map(normalized);
      if (!fields.every(key => headers.includes(normalized(key)))) continue;
      const columns: Record<string, number> = {};
      for (const field of fields) {
        const key = normalized(field);
        if (headers.filter(h => h === key).length !== 1) {
          throw new Error(`Cabeçalho duplicado no relatório de ${label}: ${field}.`);
        }
        columns[field] = headers.indexOf(key);
      }
      matches.push({ sheet: sheet.sheet, rows: sheet.data, headerRow: rowIndex, columns });
    }
  }
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? `Não foi encontrado cabeçalho válido no relatório de ${label}.`
      : `Há múltiplas tabelas compatíveis no relatório de ${label}.`);
  }
  return matches[0];
}

function dataRows(table: ReturnType<typeof findTable>) {
  return table.rows.map((cells, idx) => ({ cells, sourceRow: idx + 1 }))
    .slice(table.headerRow + 1)
    .filter(item => item.cells.some(value => value !== null && value !== ''));
}

function cell(table: ReturnType<typeof findTable>, row: CellValue[], key: string) {
  return row[table.columns[key]] ?? null;
}

export function previewParsedSheets(products: SheetData[], payments: SheetData[], period: string): MonthlyImportPreview {
  if (!PERIOD_RE.test(period)) throw new Error('Competência inválida; informe AAAA-MM.');

  const prod = findTable(products, ['ID', 'Produto', 'Categoria', 'Quantidade', 'Valor'], 'produtos');
  const pay = findTable(payments, ['Metodo de Pagamento', 'Total'], 'pagamentos');
  const pRows = dataRows(prod);
  const fRows = dataRows(pay);
  if (!pRows.length || !fRows.length) throw new Error('Os dois relatórios devem conter linhas.');

  let positiveSalesCents = 0, adjustmentsCents = 0, productsTotalCents = 0, paymentsTotalCents = 0;
  const codes = new Set<string>();
  const methodTotals = new Map<string, number>();
  const known = new Map<string, string>([
    ['credito', 'Crédito'], ['credito manual', 'Crédito'], ['debito', 'Débito'],
    ['debito manual', 'Débito'], ['pix', 'PIX'], ['carteira digital', 'Carteira Digital'],
    ['outro', 'Outro'], ['dinheiro', 'Dinheiro'], ['voucher', 'Voucher']
  ]);
  for (const { cells, sourceRow } of pRows) {
    const row = `${prod.sheet}!L${sourceRow}`;
    const id = asInteger(cell(prod, cells, 'ID'), row + '/ID');
    const name = asText(cell(prod, cells, 'Produto'), row + '/Produto');
    asText(cell(prod, cells, 'Categoria'), row + '/Categoria');
    const qty = asInteger(cell(prod, cells, 'Quantidade'), row + '/Quantidade');
    const amount = moneyCents(cell(prod, cells, 'Valor'), row + '/Valor');
    if (id === 0) {
      const category = normalized(name);
      if (category === 'total de descontos e taxas') {
        if (amount > 0 || qty !== 0) throw new Error(`Ajuste inválido em ${row}.`);
        adjustmentsCents = safeSum(adjustmentsCents, amount);
      } else if (category === 'vendas lancadas manualmente') {
        if (amount !== 0 || qty !== 0) throw new Error(`Venda manual sem detalhamento em ${row}.`);
      } else throw new Error(`Linha ID=0 não reconhecida em ${row}.`);
    } else {
      if (amount < 0) throw new Error(`Venda negativa não classificada em ${row}.`);
      codes.add(String(id));
      positiveSalesCents = safeSum(positiveSalesCents, amount);
    }
    productsTotalCents = safeSum(productsTotalCents, amount);
  }

  for (const { cells, sourceRow } of fRows) {
    const row = `${pay.sheet}!L${sourceRow}`;
    const raw = asText(cell(pay, cells, 'Metodo de Pagamento'), row + '/Método');
    const match = /^(0[1-9]|1[0-2])\/(20\d{2})\s*-\s*(.+)$/.exec(raw);
    if (!match || `${match[2]}-${match[1]}` !== period) {
      throw new Error(`Competência do pagamento divergente em ${row}.`);
    }
    const method = known.get(normalized(match[3]));
    if (!method) throw new Error(`Método de pagamento não reconhecido em ${row}: ${match[3]}.`);
    const amount = moneyCents(cell(pay, cells, 'Total'), row + '/Total');
    if (amount < 0) throw new Error(`Pagamento negativo não previsto em ${row}.`);
    paymentsTotalCents = safeSum(paymentsTotalCents, amount);
    methodTotals.set(method, safeSum(methodTotals.get(method) || 0, amount));
  }

  const differenceCents = safeSum(productsTotalCents, -paymentsTotalCents);
  return {
    period, productRows: pRows.length, paymentRows: fRows.length,
    soldProductCodes: codes.size, positiveSalesCents, adjustmentsCents,
    productsTotalCents, paymentsTotalCents, differenceCents,
    reconciled: differenceCents === 0,
    methods: [...methodTotals].map(([label, totalCents]) => ({ label, totalCents }))
  };
}

export async function previewXlsxFiles(products: File, payments: File, period: string): Promise<MonthlyImportPreview> {
  for (const file of [products, payments]) {
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Nesta primeira etapa, selecione arquivos .xlsx. Arquivos .xls devem ser convertidos.');
    if (file.size < 1 || file.size > MAX_BYTES) throw new Error(`Arquivo vazio ou superior a 20 MiB: ${file.name}.`);
  }
  // Importação dinâmica adia o processamento de planilhas até a ação do operador.
  const { default: readExcelFile } = await import('read-excel-file/browser');
  const [pSheets, fSheets] = await Promise.all([readExcelFile(products), readExcelFile(payments)]);
  return previewParsedSheets(pSheets as SheetData[], fSheets as SheetData[], period);
}
