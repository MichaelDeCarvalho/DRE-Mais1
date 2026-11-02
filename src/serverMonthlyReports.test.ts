import {describe,expect,it} from 'vitest';
import {parseMonthlyReports,cents, type Worksheet} from '../supabase/functions/_shared/parseMonthlyReports';

function minimal(): [Worksheet[],Worksheet[]] {
  return [[{sheet:'Produtos',data:[
    ['ID','Produto','Categoria','Quantidade','Valor'],
    [111,'Café','BEBIDAS',1,12.50],
    [0,'Total de Descontos e Taxas','AJUSTES',0,-2.50]
  ]}],[{sheet:'Pagamentos',data:[
    ['Método de Pagamento','Total'],
    ['09/2026 - Crédito Manual',10]
  ]}]];
}
describe('parser autoritativo de XLSX (contrato backend)',()=>{
  it('lê fixtures XLSX reais e mantém cada linha de origem',async()=>{
    const {default:readExcelFile}=await import('read-excel-file/node');
    const [p,f]=await Promise.all([
      readExcelFile('tests/fixtures/produtos-set-2026.xlsx'),
      readExcelFile('tests/fixtures/pagamentos-set-2026.xlsx')
    ]);
    const result=parseMonthlyReports(p as Worksheet[],f as Worksheet[],'2026-09');
    expect(result).toMatchObject({
      period:'2026-09',soldProductCodes:120,
      positiveSalesCents:2837070,adjustmentsCents:-342607,
      productsTotalCents:2494463,paymentsTotalCents:2494463,
      differenceCents:0,reconciled:true
    });
    expect(result.productRows).toHaveLength(122);
    expect(result.paymentRows).toHaveLength(9);
    expect(result.productRows.every(r=>r.sourceRow>1 && r.rawCells.length>0)).toBe(true);
    expect(result.paymentRows.every(r=>r.detectedPeriod==='2026-09')).toBe(true);
    expect(result.paymentRows.find(r=>r.entryType==='MANUAL')?.methodNormalized).toMatch(/^(CREDIT|DEBIT)$/);
    expect(result.productRows.filter(r=>r.rowType==='ADJUSTMENT').reduce((a,r)=>a+r.valueCents,0)).toBe(-342607);
  });
  it('mantém forma manual distinta e não duplica ajustes',()=>{
    const [p,f]=minimal();
    const r=parseMonthlyReports(p,f,'2026-09');
    expect(r).toMatchObject({differenceCents:0,reconciled:true,soldProductCodes:1});
    expect(r.paymentRows[0]).toMatchObject({
      methodRaw:'09/2026 - Crédito Manual',methodNormalized:'CREDIT',entryType:'MANUAL',valueCents:1000
    });
    expect(r.productRows[1]).toMatchObject({rowType:'ADJUSTMENT',externalCode:null,valueCents:-250});
  });
  it('rejeita período incompatível, método desconhecido e célula monetária inválida',()=>{
    const [p,f]=minimal();
    expect(()=>parseMonthlyReports(p,f,'2026-10')).toThrow('Competência divergente');
    expect(()=>parseMonthlyReports(p,[{sheet:'x',data:[['Método de Pagamento','Total'],['09/2026 - Desconhecido',10]]}],'2026-09')).toThrow('Método desconhecido');
    expect(()=>cents('1.234','valor')).toThrow('Moeda');
    expect(()=>cents('1,234','valor')).toThrow('Moeda');
    expect(cents('-3.426,07','valor')).toBe(-342607);
  });
  it('rejeita cabeçalho duplicado e preserva diferenças sem chamar de conciliação',()=>{
    const [p,f]=minimal();
    expect(()=>parseMonthlyReports([{sheet:'dup',data:[['ID','Produto','Categoria','Quantidade','Valor','Valor']]}],f,'2026-09')).toThrow('duplicado');
    const divergent=[{sheet:'Pagamentos',data:[['Método de Pagamento','Total'],['09/2026 - PIX',9]]}];
    expect(parseMonthlyReports(p,divergent,'2026-09')).toMatchObject({
      productsTotalCents:1000,paymentsTotalCents:900,differenceCents:100,reconciled:false
    });
  });
});
