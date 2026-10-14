/** Resumo documental: le valores ja informados na planilha; nao recalcula nem soma rubricas. */
export type SourceAmountRow={
  sourceRow:number;
  label:string;
  valueCents:number|null;
  valueKind:string;
};
export type DreReferenceMetric={
  key:string;
  label:string;
  sourceRow:number;
  valueCents:number|null;
  status:'INFORMADO'|'AUSENTE'|'DIVERGENTE';
};
const definitions=[
 {key:'receita',label:'Receita total',sourceRow:7,expected:'Receita Total'},
 {key:'descontos',label:'Descontos',sourceRow:13,expected:'DESCONTOS'},
 {key:'variaveis',label:'Despesas variáveis informadas',sourceRow:15,expected:'Despesas Variáveis'},
 {key:'tributos',label:'Simples Nacional informado',sourceRow:33,expected:'Alíquota Simples Nacional'},
 {key:'royalties',label:'Royalties informados',sourceRow:34,expected:'Royalties'},
 {key:'fixas',label:'Despesas fixas informadas',sourceRow:52,expected:'Despesas Fixas'},
 {key:'folha',label:'Folha de pagamento informada',sourceRow:75,expected:'Folha de Pagamento'},
 {key:'resultado',label:'Resultado informado na DRE',sourceRow:105,expected:'Resultado'},
] as const;
function normalized(value:string){return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');}
export function validatedDreMetrics(rows:readonly SourceAmountRow[]):DreReferenceMetric[]{
 return definitions.map(def=>{
   const row=rows.find(r=>r.sourceRow===def.sourceRow);
   const matches=row&&normalized(row.label)===normalized(def.expected);
   return {
     key:def.key,label:def.label,sourceRow:def.sourceRow,
     valueCents:matches&&row?.valueKind==='MONETARIO'?row.valueCents:null,
     status:!matches?'DIVERGENTE':row?.valueKind!=='MONETARIO'||row?.valueCents===null?'AUSENTE':'INFORMADO',
   };
 });
}
