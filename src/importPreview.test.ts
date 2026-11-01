import { describe, expect, it } from 'vitest';
import { moneyCents, previewParsedSheets, type SheetData } from './importPreview';

const products: SheetData[] = [{
  sheet: 'Vendas',
  data: [
    ['Index', 'ID', 'Produto', 'Categoria', 'Quantidade', 'Valor'],
    [1, 1001, 'Café', 'Bebidas', 2, 20.25],
    [2, 1002, 'Pão', 'Salgados', 1, 5.50],
    [3, 0, 'Vendas Lançadas Manualmente', 'Manual', 0, 0],
    [4, 0, 'Total de Descontos e Taxas', 'Ajustes', 0, -2.25]
  ]
}];
const payments: SheetData[] = [{
  sheet: 'Formas',
  data: [
    ['Metodo de Pagamento', 'Total'],
    ['09/2026 - Crédito', 12.5],
    ['09/2026 - PIX', 11]
  ]
}];

describe('pré-validação XLSX — relatórios mensais', () => {
  it('concilia valores em centavos e agrupa métodos sem presumir mapeamento', () => {
    const result = previewParsedSheets(products, payments, '2026-09');
    expect(result).toMatchObject({
      period: '2026-09', productRows: 4, paymentRows: 2, soldProductCodes: 2,
      positiveSalesCents: 2575, adjustmentsCents: -225,
      productsTotalCents: 2350, paymentsTotalCents: 2350,
      differenceCents: 0, reconciled: true
    });
  });

  it('aponta divergência financeira sem substituir valor original', () => {
    const changed = [{ sheet: 'Formas', data: [['Metodo de Pagamento', 'Total'], ['09/2026 - PIX', 23]] }];
    expect(previewParsedSheets(products, changed, '2026-09')).toMatchObject({
      productsTotalCents: 2350, paymentsTotalCents: 2300, differenceCents: 50, reconciled: false
    });
  });

  it('rejeita competência incompatível', () => {
    expect(() => previewParsedSheets(products, payments, '2026-10')).toThrow('Competência do pagamento divergente');
  });

  it('rejeita métodos desconhecidos sem recategorizar como Outro', () => {
    const changed = [{ sheet: 'Formas', data: [['Metodo de Pagamento', 'Total'], ['09/2026 - Criptomoeda', 23.5]] }];
    expect(() => previewParsedSheets(products, changed, '2026-09')).toThrow('não reconhecido');
  });

  it('rejeita múltiplas tabelas e cabeçalhos duplicados', () => {
    expect(() => previewParsedSheets(products.concat(products), payments, '2026-09')).toThrow('múltiplas tabelas');
    const duplicated = [{sheet:'dup',data:[['ID','Produto','Categoria','Quantidade','Valor','Valor']]}];
    expect(() => previewParsedSheets(duplicated, payments, '2026-09')).toThrow('duplicado');
  });

  it('rejeita ajuste inesperado e código especial não reconhecido', () => {
    const changed = [{sheet:'Vendas',data:[['ID','Produto','Categoria','Quantidade','Valor'],[0,'Outro ajuste','X',0,-1]]}];
    expect(() => previewParsedSheets(changed, payments, '2026-09')).toThrow('ID=0');
  });

  it('não arredonda silenciosamente valores com precisão maior que 2 casas', () => {
    expect(() => moneyCents('1,234', 'teste')).toThrow();
    expect(() => moneyCents(1.234, 'teste')).toThrow();
    expect(moneyCents('1.234,56', 'teste')).toBe(123456);
    expect(moneyCents('-3.426,07', 'teste')).toBe(-342607);
  });

  it('rejeita valor em branco e quantidade fracionária', () => {
    expect(() => moneyCents(null, 'teste')).toThrow();
    const changed = [{sheet:'Vendas',data:[['ID','Produto','Categoria','Quantidade','Valor'],[10,'Teste','X',0.5,1]]}];
    expect(() => previewParsedSheets(changed, payments, '2026-09')).toThrow('Inteiro inválido');
  });
});

it('reconcilia os dois arquivos XLSX de fixture do repositório (integração do parser)', async () => {
  const { default: readExcelFile } = await import('read-excel-file/node');
  const [productSheets, paymentSheets] = await Promise.all([
    readExcelFile('tests/fixtures/produtos-set-2026.xlsx'),
    readExcelFile('tests/fixtures/pagamentos-set-2026.xlsx')
  ]);
  const result = previewParsedSheets(
    productSheets as SheetData[],
    paymentSheets as SheetData[],
    '2026-09'
  );
  expect(result).toMatchObject({
    productRows: 122, paymentRows: 9,
    soldProductCodes: 120,
    positiveSalesCents: 2837070,
    adjustmentsCents: -342607,
    productsTotalCents: 2494463,
    paymentsTotalCents: 2494463,
    differenceCents: 0,
    reconciled: true
  });
});
