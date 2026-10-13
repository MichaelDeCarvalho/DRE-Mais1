export type RecipeCandidate = {
  productCode:string;
  productName:string;
  quantitySold:number;
  status:string;
};

const normalize=(input:string)=>input.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');

export function findRecipeCandidates<T extends RecipeCandidate>(products:readonly T[],search:string,limit=12):T[]{
  const term=normalize(search.trim());
  if(!Number.isInteger(limit)||limit<1)return [];
  return products
    .filter(p=>p.status!=='SEM_CADASTRO' && (term===''||normalize(`${p.productCode} ${p.productName}`).includes(term)))
    .sort((a,b)=>{
      const priority=(p:T)=>p.status==='FICHA_APROVADA'?2:p.status==='FICHA_PARCIAL_NAO_HOMOLOGADA'?1:0;
      return priority(a)-priority(b) || b.quantitySold-a.quantitySold || a.productName.localeCompare(b.productName,'pt-BR');
    })
    .slice(0,limit);
}

export function recipeStatusLabel(status:string):string{
  switch(status){
    case 'FICHA_APROVADA':return 'Ficha aprovada — somente consulta';
    case 'FICHA_PARCIAL_NAO_HOMOLOGADA':return 'Ficha parcial — precisa conferência';
    case 'SEM_CADASTRO':return 'Produto sem mapeamento';
    default:return 'Sem ficha ou custo validado';
  }
}
