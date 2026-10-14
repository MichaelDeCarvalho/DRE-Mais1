import { describe,expect,it } from 'vitest';
import { validatedDreMetrics } from './dre_reference';
const sources=[
 [7,'Receita Total',2494463],[13,'DESCONTOS',-342607],
 [15,'Despesas Variáveis',1151286],[33,'Alíquota Simples Nacional',199557],
 [34,'Royalties',174612],[52,'Despesas Fixas',928876],
 [75,'Folha de Pagamento',387376],[105,'Resultado ',414302]
] as const;
describe('resumo documental da DRE',()=>{
 it('usa valores de origem, inclusive negativos, sem somar subtotais ou custos',()=>{
   const rows=sources.map(([sourceRow,label,valueCents])=>({sourceRow,label,valueCents,valueKind:'MONETARIO'}));
   const result=validatedDreMetrics(rows);
   expect(result).toHaveLength(8);
   expect(result.find(m=>m.key==='descontos')?.valueCents).toBe(-342607);
   expect(result.find(m=>m.key==='resultado')?.valueCents).toBe(414302);
   expect(result.every(m=>m.status==='INFORMADO')).toBe(true);
 });
 it('nao cria zero falso para campo ausente nem aceita linha com rotulo divergente',()=>{
   const rows=[{sourceRow:7,label:'Receita Total',valueCents:100,valueKind:'MONETARIO'},
    {sourceRow:105,label:'Outro resultado',valueCents:900,valueKind:'MONETARIO'}];
   const result=validatedDreMetrics(rows);
   expect(result.find(m=>m.key==='resultado')).toMatchObject({valueCents:null,status:'DIVERGENTE'});
   expect(result.find(m=>m.key==='fixas')).toMatchObject({valueCents:null,status:'DIVERGENTE'});
 });
});
