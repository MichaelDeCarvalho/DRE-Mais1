/**
 * Parser financeiro autoritativo, sem dependência de navegador ou banco.
 * Todos os valores monetários retornados são centavos inteiros.
 * Linhas e células originais são preservadas, sem corrigir silenciosamente erros.
 */
export type Cell = string | number | boolean | Date | null;
export interface Worksheet { sheet: string; data: Cell[][] }
export interface ProductRow {
  sourceSheet: string; sourceRow: number; rawCells: Cell[];
  externalCode: string | null; productName: string; categoryName: string;
  quantity: number; valueCents: number; rowType: 'SALE' | 'ADJUSTMENT' | 'PLACEHOLDER';
}
export interface PaymentRow {
  sourceSheet: string; sourceRow: number; rawCells: Cell[];
  methodRaw: string; methodNormalized: string;
  entryType: 'STANDARD' | 'MANUAL'; detectedPeriod: string; valueCents: number;
}
export interface ParsedReports {
  period: string;
  productRows: ProductRow[]; paymentRows: PaymentRow[];
  positiveSalesCents: number; adjustmentsCents: number;
  productsTotalCents: number; paymentsTotalCents: number;
  differenceCents: number; reconciled: boolean; soldProductCodes: number;
}
const PERIOD = /^20\d{2}-(0[1-9]|1[0-2])$/;
const normalize = (v: unknown) => String(v ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

function required(v: Cell, ctx: string): string {
  if (v === null || v === undefined || v instanceof Date || typeof v === 'boolean') {
    throw new Error('Valor obrigatório inválido: ' + ctx);
  }
  const s = String(v).trim();
  if (!s || /^#(N\/A|VALUE!|REF!|DIV\/0!|NUM!)/i.test(s)) {
    throw new Error('Valor obrigatório inválido: ' + ctx);
  }
  return s;
}
function integer(v: Cell, ctx: string): number {
  const s = required(v, ctx);
  if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s))) {
    throw new Error('Inteiro inválido: ' + ctx);
  }
  return Number(s);
}
export function cents(v: Cell, ctx: string): number {
  const s = required(v, ctx);
  let dec: string;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || !/^-?\d+(?:\.\d{1,2})?$/.test(String(v))) {
      throw new Error('Moeda inválida: ' + ctx);
    }
    dec = String(v);
  } else if (/^-?\d+(?:\.\d{1,2})?$/.test(s)) {
    dec = s;
  } else if (/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(s)) {
    dec = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+,\d{1,2}$/.test(s)) {
    dec = s.replace(',', '.');
  } else {
    throw new Error('Moeda ambígua ou inválida: ' + ctx);
  }
  const n = Number(dec);
  const amount = Math.round(n * 100);
  if (!Number.isFinite(n) || !Number.isSafeInteger(amount) || Math.abs(n * 100 - amount) > 1e-6) {
    throw new Error('Precisão monetária inválida: ' + ctx);
  }
  return amount;
}
function sum(a: number, b: number): number {
  const n = a + b;
  if (!Number.isSafeInteger(n)) throw new Error('Limite monetário excedido.');
  return n;
}
function table(sheets: Worksheet[], headers: string[], label: string) {
  const matches: Array<{ sheet: Worksheet; row: number; cols: Record<string, number> }> = [];
  if (sheets.length === 0 || sheets.length > 20) throw new Error('Abas XLSX inválidas.');
  for (const sheet of sheets) {
    if (!sheet.sheet || sheet.data.length > 50000) throw new Error('Planilha excessiva ou sem identificação.');
    for (let i = 0; i < Math.min(50, sheet.data.length); i++) {
      const names = sheet.data[i].map(normalize);
      if (!headers.every(h => names.includes(normalize(h)))) continue;
      const cols: Record<string, number> = {};
      for (const h of headers) {
        const positions = names.flatMap((n, at) => n === normalize(h) ? [at] : []);
        if (positions.length !== 1) throw new Error('Cabeçalho duplicado: ' + label + '/' + h);
        cols[h] = positions[0];
      }
      matches.push({ sheet, row: i, cols });
    }
  }
  if (matches.length !== 1) {
    throw new Error(matches.length ? 'Múltiplas tabelas: ' + label : 'Cabeçalho ausente: ' + label);
  }
  return matches[0];
}
const field = (row: Cell[], cols: Record<string,number>, key: string) => row[cols[key]] ?? null;
function body(t: ReturnType<typeof table>) {
  return t.sheet.data.slice(t.row + 1).map((cells, i) => ({
    cells, sourceRow: t.row + i + 2
  })).filter(r => r.cells.some(v => v !== null && v !== ''));
}
const METHODS: Record<string,string> = {
  'credito':'CREDIT', 'debito':'DEBIT', 'pix':'PIX',
  'carteira digital':'DIGITAL_WALLET', 'outro':'OTHER',
  'dinheiro':'CASH', 'voucher':'VOUCHER'
};

export function parseMonthlyReports(
  products: Worksheet[], payments: Worksheet[], period: string
): ParsedReports {
  if (!PERIOD.test(period)) throw new Error('Competência YYYY-MM inválida.');
  const p = table(products, ['ID','Produto','Categoria','Quantidade','Valor'], 'produtos');
  const f = table(payments, ['Metodo de Pagamento','Total'], 'pagamentos');
  const pr = body(p), fr = body(f);
  if (!pr.length || !fr.length) throw new Error('Relatórios vazios.');
  const productRows: ProductRow[] = [];
  const paymentRows: PaymentRow[] = [];
  const codes = new Set<string>();
  let positiveSalesCents = 0, adjustmentsCents = 0, productsTotalCents = 0, paymentsTotalCents = 0;

  for (const { cells, sourceRow } of pr) {
    const ctx = p.sheet.sheet + '!L' + sourceRow;
    const code = integer(field(cells,p.cols,'ID'),ctx+'/ID');
    const productName = required(field(cells,p.cols,'Produto'),ctx+'/Produto');
    const categoryName = required(field(cells,p.cols,'Categoria'),ctx+'/Categoria');
    const quantity = integer(field(cells,p.cols,'Quantidade'),ctx+'/Quantidade');
    const valueCents = cents(field(cells,p.cols,'Valor'),ctx+'/Valor');
    let rowType: ProductRow['rowType'] = 'SALE';
    if (code === 0) {
      if (normalize(productName) === 'total de descontos e taxas') {
        if (quantity !== 0 || valueCents > 0) throw new Error('Ajuste inválido: ' + ctx);
        rowType = 'ADJUSTMENT';
        adjustmentsCents = sum(adjustmentsCents,valueCents);
      } else if (normalize(productName) === 'vendas lancadas manualmente') {
        if (quantity !== 0 || valueCents !== 0) throw new Error('Venda manual não detalhada: ' + ctx);
        rowType = 'PLACEHOLDER';
      } else throw new Error('ID=0 desconhecido: ' + ctx);
    } else {
      if (valueCents < 0) throw new Error('Venda negativa não classificada: ' + ctx);
      if (quantity > 0) codes.add(String(code));
      positiveSalesCents = sum(positiveSalesCents,valueCents);
    }
    productsTotalCents = sum(productsTotalCents,valueCents);
    productRows.push({sourceSheet:p.sheet.sheet,sourceRow,rawCells:cells,
      externalCode:code ? String(code):null, productName,categoryName,
      quantity,valueCents,rowType});
  }

  for (const {cells,sourceRow} of fr) {
    const ctx = f.sheet.sheet + '!L' + sourceRow;
    const methodRaw = required(field(cells,f.cols,'Metodo de Pagamento'),ctx+'/Método');
    const parts = /^(0[1-9]|1[0-2])\/(20\d{2})\s*-\s*(.+)$/.exec(methodRaw);
    if (!parts || parts[2] + '-' + parts[1] !== period) throw new Error('Competência divergente: ' + ctx);
    const normalized = normalize(parts[3]);
    const entryType: PaymentRow['entryType'] = normalized.endsWith(' manual') ? 'MANUAL' : 'STANDARD';
    const base = entryType === 'MANUAL' ? normalized.slice(0,-7) : normalized;
    const methodNormalized = METHODS[base];
    if (!methodNormalized || (entryType === 'MANUAL' && !['CREDIT','DEBIT'].includes(methodNormalized))) {
      throw new Error('Método desconhecido: ' + ctx);
    }
    const valueCents = cents(field(cells,f.cols,'Total'),ctx+'/Total');
    if (valueCents < 0) throw new Error('Pagamento negativo: ' + ctx);
    paymentsTotalCents = sum(paymentsTotalCents,valueCents);
    paymentRows.push({sourceSheet:f.sheet.sheet,sourceRow,rawCells:cells,
      methodRaw,methodNormalized,entryType,detectedPeriod:period,valueCents});
  }
  return {period,productRows,paymentRows,positiveSalesCents,adjustmentsCents,
    productsTotalCents,paymentsTotalCents,
    differenceCents:sum(productsTotalCents,-paymentsTotalCents),
    reconciled:productsTotalCents===paymentsTotalCents,soldProductCodes:codes.size};
}
