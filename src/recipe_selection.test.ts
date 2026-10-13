import {describe,it,expect} from 'vitest';
import {findRecipeCandidates,recipeStatusLabel} from './recipe_selection';

const rows=[
 {productCode:'100',productName:'Café com leite',quantitySold:14,status:'SEM_FICHA_OU_CUSTO'},
 {productCode:'101',productName:'Capuccino',quantitySold:8,status:'FICHA_PARCIAL_NAO_HOMOLOGADA'},
 {productCode:'102',productName:'Café Gelado',quantitySold:20,status:'FICHA_APROVADA'},
 {productCode:'103',productName:'Outro sem cadastro',quantitySold:25,status:'SEM_CADASTRO'},
 {productCode:'104',productName:'Cafe Mocha',quantitySold:3,status:'SEM_FICHA_OU_CUSTO'},
];
describe('busca de produtos para ficha por competência',()=>{
 it('encontra nome sem acento e código, ignorando produto nao mapeado',()=>{
   expect(findRecipeCandidates(rows,'CAFE').map(r=>r.productCode)).toEqual(['100','104','102']);
   expect(findRecipeCandidates(rows,'101').map(r=>r.productName)).toEqual(['Capuccino']);
   expect(findRecipeCandidates(rows,'103')).toEqual([]);
 });
 it('prioriza pendências e restringe resultados sem alterar o catálogo',()=>{
   expect(findRecipeCandidates(rows,'',2).map(r=>r.productCode)).toEqual(['100','104']);
   expect(rows.map(r=>r.productCode)).toEqual(['100','101','102','103','104']);
   expect(findRecipeCandidates(rows,'',0)).toEqual([]);
 });
 it('mostra alerta para ficha aprovada antes de editar',()=>{
   expect(recipeStatusLabel('FICHA_APROVADA')).toContain('somente consulta');
 });
});
