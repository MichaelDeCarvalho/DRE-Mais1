/**
 * Web adapter / bridge for Tauri runtime in AI Studio browser environment.
 * Implements window.__TAURI_INTERNALS__.invoke to support all DRE Mais1 desktop features in web mode.
 */

import type {
  ImportSummary,
  CatalogStatus,
  UnmappedProduct,
} from './types';

interface StoredIngredient {
  code: string;
  name: string;
  baseUnit: string;
  quantityBase: number;
  purchaseCents: number;
  supplier: string;
  freightCents: number;
  stCents: number;
  totalCents: number;
  origin: string;
}

interface StoredRecipeLine {
  ingredientCode: string;
  quantityMilliBase: number;
}

interface StoredExpense {
  id: number;
  period: string;
  expenseKind: string;
  category: string;
  description: string;
  amountCents: number;
  reference: string;
}

interface StoredFinancialRule {
  code: string;
  name: string;
  category: string;
  calculationBase: string;
  effectiveFrom: string | null;
  basisPoints: number | null;
  source: string | null;
}

interface DreWorkbookSource {
  period: string;
  filename: string;
  sha256: string;
  sourceMonthLabel: string;
  revenueCents: number;
  confirmation: string;
  rows: Array<{
    sourceRow: number;
    label: string;
    rawAuxiliary: string;
    rawValue: string;
    valueCents: number | null;
    valueKind: string;
  }>;
}

// Initial sample unmapped products based on September 2026 sales report
const INITIAL_PRODUCTS: UnmappedProduct[] = [
  { externalCode: '101', name: 'Café Espresso Tradicional 50ml', category: 'Cafés Clássicos', quantity: 240, salesCents: 168000 },
  { externalCode: '102', name: 'Café Espresso Duplo 100ml', category: 'Cafés Clássicos', quantity: 180, salesCents: 162000 },
  { externalCode: '103', name: 'Cappuccino Italiano 200ml', category: 'Cafés Especiais', quantity: 310, salesCents: 434000 },
  { externalCode: '104', name: 'Caramel Macchiato 300ml', category: 'Cafés Especiais', quantity: 195, salesCents: 351000 },
  { externalCode: '105', name: 'Mocha Chocolate Belga', category: 'Cafés Especiais', quantity: 140, salesCents: 266000 },
  { externalCode: '106', name: 'Iced Coffee Caramelo 400ml', category: 'Bebidas Geladas', quantity: 165, salesCents: 297000 },
  { externalCode: '107', name: 'Cold Brew Tradicional', category: 'Bebidas Geladas', quantity: 85, salesCents: 136000 },
  { externalCode: '108', name: 'Frappé de Doce de Leite', category: 'Frappés', quantity: 110, salesCents: 242000 },
  { externalCode: '109', name: 'Pão de Queijo Mineiro (3 un)', category: 'Salgados', quantity: 290, salesCents: 348000 },
  { externalCode: '110', name: 'Croissant Manteiga Artesanal', category: 'Salgados', quantity: 130, salesCents: 208000 },
  { externalCode: '111', name: 'Cookie Choco Chips 80g', category: 'Doces e Sobremesas', quantity: 175, salesCents: 210000 },
  { externalCode: '112', name: 'Bolo de Cenoura com Brigadeiro', category: 'Doces e Sobremesas', quantity: 95, salesCents: 152000 },
];

const DEFAULT_FINANCIAL_RULES: StoredFinancialRule[] = [
  { code: 'ROYALTIES', name: 'Royalties da franquia', category: 'ROYALTIES', calculationBase: 'NET_REVENUE', effectiveFrom: '2026-09', basisPoints: 700, source: 'Confirmação do operador' },
  { code: 'CREDITO', name: 'Cartão de crédito', category: 'PAYMENT_FEE', calculationBase: 'PAYMENT_METHOD', effectiveFrom: '2026-09', basisPoints: 200, source: 'Confirmação do operador' },
  { code: 'DEBITO', name: 'Cartão de débito', category: 'PAYMENT_FEE', calculationBase: 'PAYMENT_METHOD', effectiveFrom: '2026-09', basisPoints: 100, source: 'Confirmação do operador' },
  { code: 'PIX', name: 'PIX', category: 'PAYMENT_FEE', calculationBase: 'PAYMENT_METHOD', effectiveFrom: '2026-09', basisPoints: 100, source: 'Confirmação do operador' },
  { code: 'CARTEIRA_DIGITAL', name: 'Carteira digital', category: 'PAYMENT_FEE', calculationBase: 'PAYMENT_METHOD', effectiveFrom: '2026-09', basisPoints: 300, source: 'Confirmação do operador' },
  { code: 'PICPAY', name: 'PicPay', category: 'PAYMENT_FEE', calculationBase: 'PAYMENT_METHOD', effectiveFrom: '2026-09', basisPoints: 300, source: 'Confirmação do operador' },
  { code: 'VALE_REFEICAO', name: 'Vale-refeição', category: 'PAYMENT_FEE', calculationBase: 'PAYMENT_METHOD', effectiveFrom: '2026-09', basisPoints: 400, source: 'Confirmação do operador' },
];

const INITIAL_INGREDIENTS: StoredIngredient[] = [
  { code: 'CAFE_GRAO', name: 'Café Especial Grãos Mais1', baseUnit: 'G', quantityBase: 1000, purchaseCents: 4800, supplier: 'Mais1 Distribuidora', freightCents: 200, stCents: 0, totalCents: 5000, origin: 'LOCAL' },
  { code: 'LEITE_INT', name: 'Leite Integral Pasteurizado', baseUnit: 'ML', quantityBase: 1000, purchaseCents: 520, supplier: 'Laticínios Local', freightCents: 0, stCents: 0, totalCents: 520, origin: 'LOCAL' },
  { code: 'XAROPE_CARAM', name: 'Xarope Francês de Caramelo 1L', baseUnit: 'ML', quantityBase: 1000, purchaseCents: 4500, supplier: 'Distribuidor Monin', freightCents: 300, stCents: 0, totalCents: 4800, origin: 'LOCAL' },
  { code: 'XAROPE_BAUN', name: 'Xarope de Baunilha 1L', baseUnit: 'ML', quantityBase: 1000, purchaseCents: 4500, supplier: 'Distribuidor Monin', freightCents: 300, stCents: 0, totalCents: 4800, origin: 'LOCAL' },
  { code: 'COPO_300ML', name: 'Copo Térmico Personalizado 300ml', baseUnit: 'UN', quantityBase: 100, purchaseCents: 3500, supplier: 'Mais1 Embalagens', freightCents: 300, stCents: 0, totalCents: 3800, origin: 'LOCAL' },
  { code: 'COPO_400ML', name: 'Copo Transparente PET 400ml', baseUnit: 'UN', quantityBase: 100, purchaseCents: 4000, supplier: 'Mais1 Embalagens', freightCents: 300, stCents: 0, totalCents: 4300, origin: 'LOCAL' },
  { code: 'COOKIE_CHOC', name: 'Cookie de Chocolate Congelado', baseUnit: 'UN', quantityBase: 50, purchaseCents: 9000, supplier: 'Fornecedor Homologado', freightCents: 500, stCents: 0, totalCents: 9500, origin: 'LOCAL' },
  { code: 'PAO_QUEIJO', name: 'Pão de Queijo Tradicional Congelado', baseUnit: 'UN', quantityBase: 100, purchaseCents: 8500, supplier: 'Fornecedor Homologado', freightCents: 500, stCents: 0, totalCents: 9000, origin: 'LOCAL' },
];

class WebDatabase {
  catalogStatus: CatalogStatus = {
    loaded: true,
    filename: 'base-dre-set-2026.xlsx',
    validCodes: 29,
    skippedRows: 2,
  };

  summaries: Map<string, ImportSummary> = new Map();
  ingredients: Map<string, StoredIngredient[]> = new Map();
  recipes: Map<string, Map<string, StoredRecipeLine[]>> = new Map();
  approvedRecipes: Map<string, Set<string>> = new Map();
  salePrices: Map<string, Map<string, number>> = new Map();
  expenses: Map<string, StoredExpense[]> = new Map();
  financialRules: StoredFinancialRule[] = [...DEFAULT_FINANCIAL_RULES];
  dreWorkbooks: Map<string, DreWorkbookSource> = new Map();
  unmappedProducts: Map<string, UnmappedProduct[]> = new Map();
  mappedCodes: Map<string, Set<string>> = new Map();

  constructor() {
    this.initDefaultSeptember2026();
  }

  private initDefaultSeptember2026() {
    const period = '2026-09';
    // Seed default import summary for 2026-09 (matching fixtures test suite)
    this.summaries.set(period, {
      period,
      paymentReportPeriod: period,
      productsReportHasIndependentPeriod: false,
      productsTotalCents: 2494463,
      paymentsTotalCents: 2494463,
      differenceCents: 0,
      reconciled: true,
      positiveSalesCents: 2837070,
      adjustmentsCents: -342607,
      productRows: 122,
      paymentRows: 9,
      soldProductCodes: 120,
      mappedProductCodes: 29,
      unmappedProducts: [...INITIAL_PRODUCTS],
      paymentMethods: [
        { code: 'CREDITO', label: 'Crédito', totalCents: 1137349 },
        { code: 'DEBITO', label: 'Débito', totalCents: 648785 },
        { code: 'PIX', label: 'PIX', totalCents: 500959 },
        { code: 'CARTEIRA_DIGITAL', label: 'Carteira Digital', totalCents: 118392 },
        { code: 'OUTRO', label: 'Outro', totalCents: 47115 },
        { code: 'DINHEIRO', label: 'Dinheiro', totalCents: 35790 },
        { code: 'VOUCHER', label: 'Voucher', totalCents: 6073 },
      ],
      warnings: [],
    });

    this.unmappedProducts.set(period, [...INITIAL_PRODUCTS]);
    this.ingredients.set(period, [...INITIAL_INGREDIENTS]);

    // Seed some recipes and approved state
    const periodRecipes = new Map<string, StoredRecipeLine[]>();
    periodRecipes.set('101', [
      { ingredientCode: 'CAFE_GRAO', quantityMilliBase: 9000 }, // 9g
    ]);
    periodRecipes.set('103', [
      { ingredientCode: 'CAFE_GRAO', quantityMilliBase: 18000 }, // 18g
      { ingredientCode: 'LEITE_INT', quantityMilliBase: 150000 }, // 150ml
      { ingredientCode: 'COPO_300ML', quantityMilliBase: 1000 }, // 1 un
    ]);
    periodRecipes.set('104', [
      { ingredientCode: 'CAFE_GRAO', quantityMilliBase: 18000 }, // 18g
      { ingredientCode: 'LEITE_INT', quantityMilliBase: 180000 }, // 180ml
      { ingredientCode: 'XAROPE_CARAM', quantityMilliBase: 25000 }, // 25ml
      { ingredientCode: 'COPO_300ML', quantityMilliBase: 1000 }, // 1 un
    ]);
    periodRecipes.set('111', [
      { ingredientCode: 'COOKIE_CHOC', quantityMilliBase: 1000 }, // 1 un
    ]);
    this.recipes.set(period, periodRecipes);

    const periodApproved = new Set<string>();
    periodApproved.add('101');
    periodApproved.add('103');
    this.approvedRecipes.set(period, periodApproved);

    // Seed sale prices
    const periodPrices = new Map<string, number>();
    periodPrices.set('101', 700);
    periodPrices.set('102', 900);
    periodPrices.set('103', 1400);
    periodPrices.set('104', 1800);
    periodPrices.set('105', 1900);
    periodPrices.set('106', 1800);
    periodPrices.set('109', 1200);
    periodPrices.set('111', 1200);
    this.salePrices.set(period, periodPrices);

    // Seed sample expenses
    this.expenses.set(period, [
      { id: 1, period, expenseKind: 'FIXA', category: 'Aluguel', description: 'Aluguel do ponto comercial', amountCents: 450000, reference: 'Contrato locação' },
      { id: 2, period, expenseKind: 'FIXA', category: 'Condomínio', description: 'Condomínio e IPTU mensal', amountCents: 120000, reference: 'Boleto adm' },
      { id: 3, period, expenseKind: 'FIXA', category: 'Energia', description: 'Conta de energia elétrica comercial', amountCents: 185000, reference: 'Enel' },
      { id: 4, period, expenseKind: 'FIXA', category: 'Água e Esgoto', description: 'Fornecimento de água', amountCents: 45000, reference: 'Sabesp' },
      { id: 5, period, expenseKind: 'VARIAVEL', category: 'Embalagens', description: 'Sacolas e guardanapos adicionais', amountCents: 38000, reference: 'NF 4432' },
      { id: 6, period, expenseKind: 'TRIBUTO', category: 'Simples Nacional', description: 'DAS apurado sobre faturamento', amountCents: 99778, reference: 'DAS 09/2026' },
    ]);

    // Seed official reference workbook
    this.dreWorkbooks.set(period, {
      period,
      filename: 'base-dre-set-2026.xlsx',
      sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      sourceMonthLabel: 'Setembro 2026',
      revenueCents: 2494463,
      confirmation: 'Auditoria contábil conferida',
      rows: [
        { sourceRow: 7, label: 'Receita Total', rawAuxiliary: '', rawValue: '24944.63', valueCents: 2494463, valueKind: 'MONETARIO' },
        { sourceRow: 13, label: 'DESCONTOS', rawAuxiliary: '', rawValue: '-3426.07', valueCents: 342607, valueKind: 'MONETARIO' },
        { sourceRow: 15, label: 'Despesas Variáveis', rawAuxiliary: '', rawValue: '4100.00', valueCents: 410000, valueKind: 'MONETARIO' },
        { sourceRow: 33, label: 'Alíquota Simples Nacional', rawAuxiliary: '', rawValue: '1000.00', valueCents: 100000, valueKind: 'MONETARIO' },
        { sourceRow: 34, label: 'Royalties', rawAuxiliary: '', rawValue: '1746.12', valueCents: 174612, valueKind: 'MONETARIO' },
        { sourceRow: 52, label: 'Despesas Fixas', rawAuxiliary: '', rawValue: '8500.00', valueCents: 850000, valueKind: 'MONETARIO' },
        { sourceRow: 75, label: 'Folha de Pagamento', rawAuxiliary: '', rawValue: '4500.00', valueCents: 450000, valueKind: 'MONETARIO' },
        { sourceRow: 105, label: 'Resultado', rawAuxiliary: '', rawValue: '1672.44', valueCents: 167244, valueKind: 'MONETARIO' },
      ],
    });
  }
}

const db = new WebDatabase();

/**
 * Handle custom file selection in web browser.
 */
async function handleWebDialogOpen(options: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> {
  return new Promise((resolve) => {
    const title = options?.title || 'Selecionar Arquivo';
    let fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls';
    fileInput.style.display = 'none';

    // Create a styled dialog for web selection that also offers quick selection of fixtures
    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
    backdrop.style.zIndex = '99999';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    backdrop.style.padding = '16px';
    backdrop.style.backdropFilter = 'blur(4px)';

    const modal = document.createElement('div');
    modal.style.background = '#1a2634';
    modal.style.color = '#f0f4f8';
    modal.style.borderRadius = '12px';
    modal.style.padding = '24px';
    modal.style.maxWidth = '520px';
    modal.style.width = '100%';
    modal.style.boxShadow = '0 20px 40px rgba(0,0,0,0.4)';
    modal.style.border = '1px solid #2d3f54';

    const h3 = document.createElement('h3');
    h3.textContent = title;
    h3.style.margin = '0 0 12px 0';
    h3.style.fontSize = '18px';
    h3.style.fontWeight = '600';

    const desc = document.createElement('p');
    desc.textContent = 'Você pode selecionar um arquivo Excel da sua máquina ou usar uma das planilhas de referência integradas:';
    desc.style.color = '#94a3b8';
    desc.style.fontSize = '13px';
    desc.style.lineHeight = '1.5';
    desc.style.margin = '0 0 18px 0';

    const listDiv = document.createElement('div');
    listDiv.style.display = 'flex';
    listDiv.style.flexDirection = 'column';
    listDiv.style.gap = '8px';
    listDiv.style.marginBottom = '20px';

    const fixtures = [
      { name: 'produtos-set-2026.xlsx', desc: 'Relatório mensal de vendas por produto (Set/2026)' },
      { name: 'pagamentos-set-2026.xlsx', desc: 'Relatório mensal de recebimentos e formas (Set/2026)' },
      { name: 'base-dre-set-2026.xlsx', desc: 'Planilha consolidada com catálogo e DRE de referência' },
    ];

    fixtures.forEach((f) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.textAlign = 'left';
      btn.style.padding = '10px 14px';
      btn.style.background = '#223347';
      btn.style.border = '1px solid #334b65';
      btn.style.borderRadius = '8px';
      btn.style.color = '#e2e8f0';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'all 0.15s ease';
      btn.innerHTML = `<strong style="display:block;font-size:13px;color:#38bdf8;">${f.name}</strong><span style="font-size:11px;color:#94a3b8;">${f.desc}</span>`;
      btn.onmouseenter = () => { btn.style.background = '#2a415a'; btn.style.borderColor = '#38bdf8'; };
      btn.onmouseleave = () => { btn.style.background = '#223347'; btn.style.borderColor = '#334b65'; };
      btn.onclick = () => {
        cleanup();
        resolve(f.name);
      };
      listDiv.appendChild(btn);
    });

    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.alignItems = 'center';
    footer.style.borderTop = '1px solid #2d3f54';
    footer.style.paddingTop = '16px';

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.textContent = '📁 Escolher outro arquivo do computador';
    uploadBtn.style.padding = '9px 14px';
    uploadBtn.style.background = '#1e293b';
    uploadBtn.style.color = '#cbd5e1';
    uploadBtn.style.border = '1px solid #475569';
    uploadBtn.style.borderRadius = '6px';
    uploadBtn.style.fontSize = '12px';
    uploadBtn.style.fontWeight = '500';
    uploadBtn.style.cursor = 'pointer';
    uploadBtn.onclick = () => fileInput.click();

    fileInput.onchange = () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        cleanup();
        resolve(file.name);
      }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.style.padding = '9px 16px';
    cancelBtn.style.background = 'transparent';
    cancelBtn.style.color = '#94a3b8';
    cancelBtn.style.border = '0';
    cancelBtn.style.borderRadius = '6px';
    cancelBtn.style.fontSize = '13px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };

    function cleanup() {
      if (backdrop.parentNode) document.body.removeChild(backdrop);
    }

    footer.appendChild(uploadBtn);
    footer.appendChild(cancelBtn);
    modal.appendChild(h3);
    modal.appendChild(desc);
    modal.appendChild(listDiv);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  });
}

/**
 * Handle Tauri invoke calls in browser.
 */
export async function tauriInvokeHandler(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  // Plugin dialog call
  if (cmd === 'plugin:dialog|open') {
    const opts = (args.options || {}) as { title?: string; filters?: Array<{ name: string; extensions: string[] }> };
    return handleWebDialogOpen(opts);
  }

  // Catalog status
  if (cmd === 'get_catalog_status') {
    return db.catalogStatus;
  }

  // Import legacy catalog
  if (cmd === 'import_legacy_catalog') {
    const catalogPath = String(args.catalogPath || 'base-dre-set-2026.xlsx');
    const filename = catalogPath.replaceAll('\\', '/').split('/').at(-1) || catalogPath;
    db.catalogStatus = {
      loaded: true,
      filename,
      validCodes: 29,
      skippedRows: 2,
    };
    return {
      filename,
      mappedCodesImported: 29,
      skippedRows: 2,
      warning: '',
    };
  }

  // Review mappings
  if (cmd === 'review_mappings') {
    const period = String(args.period || '2026-09');
    const unmapped = db.unmappedProducts.get(period) || [...INITIAL_PRODUCTS];
    return {
      soldProductCodes: 120,
      mappedProductCodes: db.catalogStatus.loaded ? 29 : 0,
      unmappedProducts: unmapped,
    };
  }

  // Register sold product
  if (cmd === 'register_sold_product') {
    const period = String(args.period || '2026-09');
    const externalCode = String(args.externalCode || '');
    const currentUnmapped = db.unmappedProducts.get(period) || [...INITIAL_PRODUCTS];
    const updated = currentUnmapped.filter((p) => p.externalCode !== externalCode);
    db.unmappedProducts.set(period, updated);

    return {
      soldProductCodes: 120,
      mappedProductCodes: 120 - updated.length,
      unmappedProducts: updated,
    };
  }

  // Load period summary
  if (cmd === 'load_period_summary') {
    const period = String(args.period || '2026-09');
    const found = db.summaries.get(period);
    if (!found) {
      throw new Error(`Nenhum relatório importado para a competência ${period}.`);
    }
    return found;
  }

  // Import reports
  if (cmd === 'import_reports') {
    const period = String(args.period);
    const productsPath = String(args.productsPath);
    const paymentsPath = String(args.paymentsPath);
    if (productsPath === paymentsPath) {
      throw new Error('Escolha dois arquivos diferentes, um para produtos e outro para pagamentos.');
    }
    const summary: ImportSummary = {
      period,
      paymentReportPeriod: period,
      productsReportHasIndependentPeriod: false,
      productsTotalCents: 2494463,
      paymentsTotalCents: 2494463,
      differenceCents: 0,
      reconciled: true,
      positiveSalesCents: 2837070,
      adjustmentsCents: -342607,
      productRows: 122,
      paymentRows: 9,
      soldProductCodes: 120,
      mappedProductCodes: db.catalogStatus.loaded ? 29 : 0,
      unmappedProducts: db.unmappedProducts.get(period) || [...INITIAL_PRODUCTS],
      paymentMethods: [
        { code: 'CREDITO', label: 'Crédito', totalCents: 1137349 },
        { code: 'DEBITO', label: 'Débito', totalCents: 648785 },
        { code: 'PIX', label: 'PIX', totalCents: 500959 },
        { code: 'CARTEIRA_DIGITAL', label: 'Carteira Digital', totalCents: 118392 },
        { code: 'OUTRO', label: 'Outro', totalCents: 47115 },
        { code: 'DINHEIRO', label: 'Dinheiro', totalCents: 35790 },
        { code: 'VOUCHER', label: 'Voucher', totalCents: 6073 },
      ],
      warnings: [],
    };
    db.summaries.set(period, summary);
    return summary;
  }

  // List ingredients
  if (cmd === 'list_ingredients') {
    const period = String(args.period || '2026-09');
    return db.ingredients.get(period) || [...INITIAL_INGREDIENTS];
  }

  // Register ingredient
  if (cmd === 'register_ingredient') {
    const period = String(args.period || '2026-09');
    const code = String(args.code || '').trim().toUpperCase();
    const name = String(args.name || '').trim();
    const baseUnit = String(args.baseUnit || 'G');
    const quantityBase = Number(args.quantityBase || 0);
    const purchaseCents = Number(args.purchaseCents || 0);
    const supplier = String(args.supplier || '');
    const freightCents = Number(args.freightCents || 0);
    const stCents = Number(args.stCents || 0);
    const totalCents = purchaseCents + freightCents + stCents;

    const list = db.ingredients.get(period) || [...INITIAL_INGREDIENTS];
    const existingIndex = list.findIndex((i) => i.code === code);
    const item: StoredIngredient = {
      code,
      name,
      baseUnit,
      quantityBase,
      purchaseCents,
      supplier,
      freightCents,
      stCents,
      totalCents,
      origin: 'LOCAL',
    };
    if (existingIndex >= 0) {
      list[existingIndex] = item;
    } else {
      list.push(item);
    }
    db.ingredients.set(period, list);
    return;
  }

  // Import ingredients excel
  if (cmd === 'import_ingredients_excel') {
    const period = String(args.period || '2026-09');
    const path = String(args.path || 'insumos.xlsx');
    const filename = path.replaceAll('\\', '/').split('/').at(-1) || path;
    db.ingredients.set(period, [...INITIAL_INGREDIENTS]);
    return {
      imported: INITIAL_INGREDIENTS.length,
      filename,
    };
  }

  // Recipe line
  if (cmd === 'set_recipe_line') {
    const period = String(args.period || '2026-09');
    const productCode = String(args.productCode || '').trim();
    const ingredientCode = String(args.ingredientCode || '').trim().toUpperCase();
    const quantityMilliBase = Number(args.quantityMilliBase || 0);

    let periodMap = db.recipes.get(period);
    if (!periodMap) {
      periodMap = new Map();
      db.recipes.set(period, periodMap);
    }
    const lines = periodMap.get(productCode) || [];
    const idx = lines.findIndex((l) => l.ingredientCode === ingredientCode);
    if (idx >= 0) {
      lines[idx].quantityMilliBase = quantityMilliBase;
    } else {
      lines.push({ ingredientCode, quantityMilliBase });
    }
    periodMap.set(productCode, lines);

    // Compute cost
    const ingList = db.ingredients.get(period) || INITIAL_INGREDIENTS;
    let total = 0;
    for (const line of lines) {
      const ing = ingList.find((i) => i.code === line.ingredientCode);
      if (ing && ing.quantityBase > 0) {
        total += (line.quantityMilliBase * ing.totalCents) / (ing.quantityBase * 1000);
      }
    }
    return {
      productCode,
      period,
      totalCostCents: total,
      ingredientCount: lines.length,
    };
  }

  // Get recipe cost
  if (cmd === 'get_recipe_cost') {
    const period = String(args.period || '2026-09');
    const productCode = String(args.productCode || '').trim();
    const periodMap = db.recipes.get(period);
    const lines = periodMap?.get(productCode) || [];
    const ingList = db.ingredients.get(period) || INITIAL_INGREDIENTS;
    let total = 0;
    for (const line of lines) {
      const ing = ingList.find((i) => i.code === line.ingredientCode);
      if (ing && ing.quantityBase > 0) {
        total += (line.quantityMilliBase * ing.totalCents) / (ing.quantityBase * 1000);
      }
    }
    return {
      productCode,
      period,
      totalCostCents: total,
      ingredientCount: lines.length,
    };
  }

  // Get recipe detail
  if (cmd === 'get_recipe_detail') {
    const period = String(args.period || '2026-09');
    const productCode = String(args.productCode || '').trim();
    const periodMap = db.recipes.get(period);
    const lines = periodMap?.get(productCode) || [];
    const ingList = db.ingredients.get(period) || INITIAL_INGREDIENTS;
    const prod = INITIAL_PRODUCTS.find((p) => p.externalCode === productCode);

    const detailedLines = lines.map((l) => {
      const ing = ingList.find((i) => i.code === l.ingredientCode);
      const cost = ing && ing.quantityBase > 0 ? (l.quantityMilliBase * ing.totalCents) / (ing.quantityBase * 1000) : 0;
      return {
        ingredientCode: l.ingredientCode,
        ingredientName: ing ? ing.name : l.ingredientCode,
        unit: ing ? ing.baseUnit : 'G',
        quantityUsed: l.quantityMilliBase / 1000,
        quantityPurchased: ing ? ing.quantityBase : 1000,
        purchaseTotalCents: ing ? ing.totalCents : 0,
        costUsedCents: cost,
      };
    });

    const total = detailedLines.reduce((acc, l) => acc + l.costUsedCents, 0);
    return {
      productCode,
      productName: prod ? prod.name : `Produto ${productCode}`,
      period,
      lines: detailedLines,
      totalCostCents: total,
    };
  }

  // Approve recipe
  if (cmd === 'approve_recipe') {
    const period = String(args.period || '2026-09');
    const productCode = String(args.productCode || '').trim();
    let set = db.approvedRecipes.get(period);
    if (!set) {
      set = new Set();
      db.approvedRecipes.set(period, set);
    }
    set.add(productCode);
    return;
  }

  // Monthly cost overview
  if (cmd === 'monthly_cost_overview') {
    const period = String(args.period || '2026-09');
    const prices = db.salePrices.get(period) || new Map();
    const approved = db.approvedRecipes.get(period) || new Set();
    const recipes = db.recipes.get(period) || new Map();
    const ingList = db.ingredients.get(period) || INITIAL_INGREDIENTS;

    return INITIAL_PRODUCTS.map((prod) => {
      const code = prod.externalCode;
      const price = prices.get(code) || null;
      const lines = recipes.get(code);

      if (!lines || lines.length === 0) {
        return {
          productCode: code,
          productName: prod.name,
          quantitySold: prod.quantity,
          salesCents: prod.salesCents,
          unitCostCents: null,
          totalTheoreticalCents: null,
          status: 'SEM_FICHA_OU_CUSTO',
          salePriceCents: price,
          cmvPercent: null,
        };
      }

      let unitCost = 0;
      for (const line of lines) {
        const ing = ingList.find((i) => i.code === line.ingredientCode);
        if (ing && ing.quantityBase > 0) {
          unitCost += (line.quantityMilliBase * ing.totalCents) / (ing.quantityBase * 1000);
        }
      }
      const totalCost = unitCost * prod.quantity;
      const isAppr = approved.has(code);
      const cmvPct = price && price > 0 ? (100 * unitCost) / price : null;

      return {
        productCode: code,
        productName: prod.name,
        quantitySold: prod.quantity,
        salesCents: prod.salesCents,
        unitCostCents: unitCost,
        totalTheoreticalCents: totalCost,
        status: isAppr ? 'FICHA_APROVADA' : 'FICHA_PARCIAL_NAO_HOMOLOGADA',
        salePriceCents: price,
        cmvPercent: cmvPct,
      };
    });
  }

  // Monthly CMV summary
  if (cmd === 'monthly_cmv_summary') {
    const period = String(args.period || '2026-09');
    const approved = db.approvedRecipes.get(period) || new Set();
    const recipes = db.recipes.get(period) || new Map();
    const ingList = db.ingredients.get(period) || INITIAL_INGREDIENTS;

    let approvedCost = 0;
    let approvedQty = 0;
    let approvedCount = 0;

    for (const prod of INITIAL_PRODUCTS) {
      if (approved.has(prod.externalCode)) {
        approvedCount++;
        approvedQty += prod.quantity;
        const lines = recipes.get(prod.externalCode) || [];
        let unitCost = 0;
        for (const line of lines) {
          const ing = ingList.find((i) => i.code === line.ingredientCode);
          if (ing && ing.quantityBase > 0) {
            unitCost += (line.quantityMilliBase * ing.totalCents) / (ing.quantityBase * 1000);
          }
        }
        approvedCost += unitCost * prod.quantity;
      }
    }

    const totalCodes = INITIAL_PRODUCTS.length;
    return {
      period,
      productCodes: totalCodes,
      approvedCodes: approvedCount,
      pendingCodes: totalCodes - approvedCount,
      approvedQuantity: approvedQty,
      approvedCostCents: approvedCost,
      complete: approvedCount === totalCodes,
    };
  }

  // Register sale price
  if (cmd === 'register_sale_price') {
    const period = String(args.period || '2026-09');
    const productCode = String(args.productCode || '').trim();
    const priceCents = Number(args.priceCents || 0);
    let periodPrices = db.salePrices.get(period);
    if (!periodPrices) {
      periodPrices = new Map();
      db.salePrices.set(period, periodPrices);
    }
    periodPrices.set(productCode, priceCents);
    return { period, productCode, priceCents };
  }

  // List expenses
  if (cmd === 'list_expenses') {
    const period = String(args.period || '2026-09');
    return db.expenses.get(period) || [];
  }

  // Register expense
  if (cmd === 'register_expense') {
    const period = String(args.period || '2026-09');
    const expenseKind = String(args.expenseKind || 'FIXA');
    const category = String(args.category || '');
    const description = String(args.description || '');
    const amountCents = Number(args.amountCents || 0);
    const reference = String(args.reference || '');

    const list = db.expenses.get(period) || [];
    const newId = list.length + 1;
    list.push({ id: newId, period, expenseKind, category, description, amountCents, reference });
    db.expenses.set(period, list);
    return;
  }

  // DRE Preview
  if (cmd === 'get_dre_preview') {
    const period = String(args.period || '2026-09');
    const summary = db.summaries.get(period);
    const rev = summary ? summary.productsTotalCents : 2494463;
    const payments = summary ? summary.paymentsTotalCents : 2494463;
    const expList = db.expenses.get(period) || [];

    let variable = 0;
    let fixed = 0;
    let tax = 0;
    for (const exp of expList) {
      if (exp.expenseKind === 'VARIAVEL') variable += exp.amountCents;
      else if (exp.expenseKind === 'FIXA') fixed += exp.amountCents;
      else if (exp.expenseKind === 'TRIBUTO') tax += exp.amountCents;
    }

    const royalties = Math.round((rev * 700) / 10000); // 7%

    const fees = [
      { code: 'CREDITO', label: 'Crédito', baseCents: 1137349, rateBasisPoints: 200, estimatedFeeCents: 22747, status: 'CALCULADO' },
      { code: 'DEBITO', label: 'Débito', baseCents: 648785, rateBasisPoints: 100, estimatedFeeCents: 6488, status: 'CALCULADO' },
      { code: 'PIX', label: 'PIX', baseCents: 500959, rateBasisPoints: 100, estimatedFeeCents: 5010, status: 'CALCULADO' },
      { code: 'CARTEIRA_DIGITAL', label: 'Carteira Digital', baseCents: 118392, rateBasisPoints: 300, estimatedFeeCents: 3552, status: 'CALCULADO' },
    ];

    const approved = db.approvedRecipes.get(period) || new Set();
    const approvedCodes = approved.size;
    const pendingCodes = INITIAL_PRODUCTS.length - approvedCodes;

    return {
      period,
      revenueCents: rev,
      paymentsCents: payments,
      differenceCents: 0,
      reconciled: true,
      approvedCmvCents: null,
      contributionBeforeOtherExpensesCents: null,
      pendingProductCodes: pendingCodes,
      approvedProductCodes: approvedCodes,
      status: 'CMV_INCOMPLETO',
      unregisteredComponents: [
        'Despesas variáveis e taxas',
        'Tributos',
        'Despesas fixas',
        'Estoque físico e CMV contábil',
      ],
      recordedVariableCents: variable,
      recordedFixedCents: fixed,
      recordedTaxCents: tax,
      recordedExpenseCount: expList.length,
      estimatedRoyaltiesCents: royalties,
      estimatedPaymentFees: fees,
    };
  }

  // Financial parameters
  if (cmd === 'list_financial_parameters') {
    return db.financialRules;
  }

  // Register financial parameter
  if (cmd === 'register_financial_parameter') {
    const code = String(args.code || '').trim().toUpperCase();
    const name = String(args.name || '').trim();
    const category = String(args.category || 'PAYMENT_FEE');
    const base = String(args.base || 'PAYMENT_METHOD');
    const period = String(args.period || '2026-09');
    const basisPoints = Number(args.basisPoints || 0);
    const source = String(args.source || 'Operador');

    const idx = db.financialRules.findIndex((r) => r.code === code);
    const updatedRule: StoredFinancialRule = {
      code,
      name,
      category,
      calculationBase: base,
      effectiveFrom: period,
      basisPoints,
      source,
    };
    if (idx >= 0) {
      db.financialRules[idx] = updatedRule;
    } else {
      db.financialRules.push(updatedRule);
    }
    return;
  }

  // Validated DRE workbook
  if (cmd === 'import_validated_dre_workbook') {
    const period = String(args.period || '2026-09');
    const path = String(args.path || 'base-dre-set-2026.xlsx');
    const filename = path.replaceAll('\\', '/').split('/').at(-1) || path;
    const item: DreWorkbookSource = {
      period,
      filename,
      sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      sourceMonthLabel: 'Setembro 2026',
      revenueCents: 2494463,
      confirmation: 'Auditoria contábil conferida',
      rows: [
        { sourceRow: 7, label: 'Receita Total', rawAuxiliary: '', rawValue: '24944.63', valueCents: 2494463, valueKind: 'MONETARIO' },
        { sourceRow: 13, label: 'DESCONTOS', rawAuxiliary: '', rawValue: '-3426.07', valueCents: 342607, valueKind: 'MONETARIO' },
        { sourceRow: 15, label: 'Despesas Variáveis', rawAuxiliary: '', rawValue: '4100.00', valueCents: 410000, valueKind: 'MONETARIO' },
        { sourceRow: 33, label: 'Alíquota Simples Nacional', rawAuxiliary: '', rawValue: '1000.00', valueCents: 100000, valueKind: 'MONETARIO' },
        { sourceRow: 34, label: 'Royalties', rawAuxiliary: '', rawValue: '1746.12', valueCents: 174612, valueKind: 'MONETARIO' },
        { sourceRow: 52, label: 'Despesas Fixas', rawAuxiliary: '', rawValue: '8500.00', valueCents: 850000, valueKind: 'MONETARIO' },
        { sourceRow: 75, label: 'Folha de Pagamento', rawAuxiliary: '', rawValue: '4500.00', valueCents: 450000, valueKind: 'MONETARIO' },
        { sourceRow: 105, label: 'Resultado', rawAuxiliary: '', rawValue: '1672.44', valueCents: 167244, valueKind: 'MONETARIO' },
      ],
    };
    db.dreWorkbooks.set(period, item);
    return item;
  }

  if (cmd === 'get_validated_dre_workbook') {
    const period = String(args.period || '2026-09');
    return db.dreWorkbooks.get(period) || null;
  }

  console.warn(`[Tauri Web Bridge] Unhandled command: ${cmd}`, args);
  return null;
}

/**
 * Initialize Tauri bridge for web environment.
 */
export function initWebTauriBridge(): void {
  if (typeof window === 'undefined') return;

  const currentInternals = (window as unknown as { __TAURI_INTERNALS__?: { invoke: unknown } }).__TAURI_INTERNALS__;
  if (!currentInternals || typeof currentInternals.invoke !== 'function') {
    (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof tauriInvokeHandler } }).__TAURI_INTERNALS__ = {
      invoke: tauriInvokeHandler,
    };
    console.log('[Tauri Web Bridge] Initialized browser mock IPC bridge for AI Studio web environment.');
  }
}
