import readExcelFile from 'npm:read-excel-file@9.3.14/browser';
import {parseMonthlyReports, type Worksheet} from './parseMonthlyReports.ts';

function equal(actual:unknown,expected:unknown,label:string){
  if(actual!==expected)throw new Error(label+': expected '+expected+', received '+actual);
}
async function xlsx(path:string):Promise<Worksheet[]> {
  const bytes=await Deno.readFile(path);
  const file=new File([bytes],path.split('/').at(-1)!,{
    type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  return await readExcelFile(file) as Worksheet[];
}
Deno.test('Edge Deno runtime parses September XLSX originals',async()=>{
  const [products,payments]=await Promise.all([
    xlsx('tests/fixtures/produtos-set-2026.xlsx'),
    xlsx('tests/fixtures/pagamentos-set-2026.xlsx')
  ]);
  const parsed=parseMonthlyReports(products,payments,'2026-09');
  equal(parsed.productRows.length,122,'product rows');
  equal(parsed.paymentRows.length,9,'payment rows');
  equal(parsed.soldProductCodes,120,'product codes');
  equal(parsed.positiveSalesCents,2837070,'positive sales');
  equal(parsed.adjustmentsCents,-342607,'adjustments');
  equal(parsed.productsTotalCents,2494463,'products total');
  equal(parsed.paymentsTotalCents,2494463,'payments total');
  equal(parsed.differenceCents,0,'difference');
  equal(parsed.reconciled,true,'reconciled');
});
Deno.test('Edge Deno runtime rejects wrong payment competence',async()=>{
  const [products,payments]=await Promise.all([
    xlsx('tests/fixtures/produtos-set-2026.xlsx'),
    xlsx('tests/fixtures/pagamentos-set-2026.xlsx')
  ]);
  let rejected=false;
  try{parseMonthlyReports(products,payments,'2026-10');}
  catch(e){rejected=e instanceof Error && e.message.includes('Competência divergente');}
  if(!rejected)throw new Error('Parser did not reject a different period');
});
