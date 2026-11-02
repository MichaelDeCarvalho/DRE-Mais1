/**
 * Fluxo de commit somente pela Edge autenticada, sem escrita direta pelo browser.
 * UI: VITE_ENABLE_FINANCIAL_COMMIT; servidor: FINANCIAL_COMMIT_ENABLED.
 * Ambos desativados por padrão. Não contém chave service_role.
 */
import {isSupabaseConfigured,supabase} from '../supabase/client';
import {archiveObjectPath,type ArchiveBatchResult} from './reportArchives';
import type {ServerArchiveValidation} from './archiveValidation';

export interface MonthlyCommitResult {
  state:'IMPORTED'|'ALREADY_IMPORTED';
  periodId:string;
  productImportId:string;
  paymentImportId:string;
  productsTotalCents:number;
  paymentsTotalCents:number;
  differenceCents:number;
  productRows:number;
  paymentRows:number;
  reconciled:boolean;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_NAME=/^[^/\\]{1,250}\.xlsx$/i;
function check(v:unknown,required:unknown,label:string):void {
  if(v!==required)throw new Error(
    'Retorno financeiro do backend inconsistente ('+label+'). Confirme no histórico antes de repetir.'
  );
}
export async function commitValidatedMonthlyArchive(
  archive:ArchiveBatchResult,
  validated:ServerArchiveValidation
):Promise<MonthlyCommitResult> {
  if(!isSupabaseConfigured||!supabase)throw new Error('Supabase não configurado.');
  if(archive.state!=='FILES_STAGED_NOT_IMPORTED'||
     validated.state!=='VALIDATED_NOT_IMPORTED'||!validated.reconciled ||
     validated.differenceCents!==0 ||
     !UUID.test(archive.storeId)||!UUID.test(archive.periodId)) {
    throw new Error('Importação não autorizada: arquivo ou conciliação sem validação.');
  }
  const products=archive.files.find(f=>f.kind==='PRODUCTS');
  const payments=archive.files.find(f=>f.kind==='PAYMENTS');
  if(!products||!payments||!FILE_NAME.test(products.fileName)||!FILE_NAME.test(payments.fileName)||
    products.size<1||products.size>20*1024*1024||
    payments.size<1||payments.size>20*1024*1024) {
    throw new Error('Metadados XLSX incompletos.');
  }
  if(archiveObjectPath(archive.storeId,archive.periodId,'PRODUCTS',products.sha256)!==products.path||
     archiveObjectPath(archive.storeId,archive.periodId,'PAYMENTS',payments.sha256)!==payments.path||
     products.sha256!==validated.productsSha256||
     payments.sha256!==validated.paymentsSha256) {
    throw new Error('SHA-256 dos XLSX não corresponde à validação autoritativa.');
  }

  const {data,error}=await supabase.functions.invoke('commit-monthly-reports',{
    body:{
      storeId:archive.storeId,periodId:archive.periodId,
      productsPath:products.path,paymentsPath:payments.path,
      productsFilename:products.fileName,paymentsFilename:payments.fileName
    }
  });
  if(error||!data||typeof data!=='object') {
    throw new Error('A importação não pôde ser confirmada. Consulte o histórico antes de repetir.');
  }
  const got=data as Record<string,unknown>;
  if(got.state!=='IMPORTED'&&got.state!=='ALREADY_IMPORTED') {
    throw new Error('Importação não confirmada pelo servidor; verifique o histórico.');
  }
  check(got.periodId,archive.periodId,'competência');
  check(got.productRows,validated.productRows,'linhas de produtos');
  check(got.paymentRows,validated.paymentRows,'linhas de pagamentos');
  check(got.productsTotalCents,validated.productsTotalCents,'receita');
  check(got.paymentsTotalCents,validated.paymentsTotalCents,'pagamentos');
  check(got.differenceCents,0,'diferença');
  check(got.reconciled,true,'conciliação');
  if(typeof got.productImportId!=='string'||!UUID.test(got.productImportId)||
     typeof got.paymentImportId!=='string'||!UUID.test(got.paymentImportId)) {
    throw new Error('IDs de importação ausentes; consulte o histórico.');
  }
  return got as unknown as MonthlyCommitResult;
}

/**
 * Prova HTTP negativa usando o JWT da sessão atual, sem arquivos reais.
 * Identificadores e SHA sintéticos impedem escrita mesmo se o gate for
 * acidentalmente liberado. PASS exige resposta 423 após validação do JWT.
 */
export async function verifyFinancialCommitBlocked():Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase não configurado.');
  }
  const storeId='00000000-0000-4000-8000-000000000000';
  const periodId='00000000-0000-4000-8000-000000000001';
  const productsPath=archiveObjectPath(storeId,periodId,'PRODUCTS','0'.repeat(64));
  const paymentsPath=archiveObjectPath(storeId,periodId,'PAYMENTS','1'.repeat(64));
  const {data,error}=await supabase.functions.invoke('commit-monthly-reports',{
    body:{
      storeId,periodId,productsPath,paymentsPath,
      productsFilename:'probe-products.xlsx',
      paymentsFilename:'probe-payments.xlsx'
    }
  });
  // Não confundir um HTTP 401/403/500 ou 200 com bloqueio comprovado.
  const response=error?.context;
  if(!(response instanceof Response) || response.status!==423 || data) {
    throw new Error('Bloqueio HTTP 423 não comprovado. Não liberar importação financeira.');
  }
  let payload:unknown;
  try {
    payload=await response.clone().json();
  } catch {
    throw new Error('Resposta HTTP 423 inválida. Não liberar importação financeira.');
  }
  if(!payload || typeof payload!=='object' ||
     (payload as {error?:unknown}).error!=='Importação financeira ainda não ativada.') {
    throw new Error('Resposta do bloqueio inesperada. Não liberar importação financeira.');
  }
}
