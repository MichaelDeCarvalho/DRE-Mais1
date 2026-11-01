/**
 * Homologação E2E sob identidade REAL, sem persistência financeira.
 * Executar SOMENTE quando um usuário gerencial de testes estiver configurado.
 * NUNCA colocar email/senha/JWT nos logs, argumentos CLI ou no GitHub.
 * Armazena XLSX reais no bucket privado: não apaga objetos de forma automática.
 */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const PROJECT='https://mgtovbvnbkzrdytudynf.supabase.co';
const STORE='a90a2118-6f5e-4dc2-8548-32de70ce3c20';
const PERIOD='a01f4767-6cc4-4eff-8170-0c23f6c77c4c';
const BUCKET='dre-mais1-report-archives';
const env=name=>{
  const v=process.env[name];
  if(!v)throw new Error('Variável obrigatória não configurada: '+name);
  return v;
};
if(process.env.DRE_E2E_CONFIRM_UPLOAD!=='YES_SJP_2026_09') {
  throw new Error('Operação de Storage NÃO autorizada: falta DRE_E2E_CONFIRM_UPLOAD=YES_SJP_2026_09.');
}
const client=createClient(PROJECT,env('DRE_E2E_PUBLISHABLE_KEY'),{
  auth:{persistSession:false,autoRefreshToken:false}
});
let signedIn=false;
try {
  const {data:auth,error:loginError}=await client.auth.signInWithPassword({
    email:env('DRE_E2E_EMAIL'),password:env('DRE_E2E_PASSWORD')
  });
  if(loginError||!auth.user||!auth.session)throw new Error('Falha de autenticação do usuário de teste.');
  signedIn=true;
  const {data:period,error:periodError}=await client.from('periods')
    .select('id,store_id,year_month,status').eq('id',PERIOD).eq('store_id',STORE).single();
  if(periodError||!period||period.status!=='DRAFT'||period.year_month!=='2026-09'){
    throw new Error('Competência real de setembro não está visível em DRAFT; nenhum upload efetuado.');
  }
  const artifacts=[
    {kind:'PRODUCTS',name:'produtos-set-2026.xlsx',path:'tests/fixtures/produtos-set-2026.xlsx'},
    {kind:'PAYMENTS',name:'pagamentos-set-2026.xlsx',path:'tests/fixtures/pagamentos-set-2026.xlsx'}
  ];
  const staged=[];
  for(const input of artifacts) {
    const bytes=await readFile(input.path);
    if(bytes.length<1 || bytes.length>20*1024*1024)throw new Error('XLSX fora do limite de Storage.');
    const sha256=createHash('sha256').update(bytes).digest('hex');
    const path=STORE+'/'+PERIOD+'/'+input.kind+'/'+sha256+'.xlsx';
    const bucket=client.storage.from(BUCKET);
    const {error:uploadError}=await bucket.upload(path,bytes,{
      upsert:false,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    if(uploadError) {
      const {data:existing,error:downloadError}=await bucket.download(path);
      if(downloadError||!existing)throw new Error('Storage não permite upload/leitura autorizada '+input.kind);
      const original=Buffer.from(await existing.arrayBuffer());
      if(original.length!==bytes.length ||
         createHash('sha256').update(original).digest('hex')!==sha256) {
        throw new Error('Objeto existente não corresponde ao XLSX original '+input.kind);
      }
    }
    // O teste binário é obrigatório mesmo quando o upload acabou de concluir.
    const {data:stored,error:readError}=await bucket.download(path);
    if(readError||!stored)throw new Error('Download autenticado falhou '+input.kind);
    const remote=Buffer.from(await stored.arrayBuffer());
    if(remote.length!==bytes.length ||
       createHash('sha256').update(remote).digest('hex')!==sha256) {
      throw new Error('Integridade SHA-256 falhou no Storage '+input.kind);
    }
    staged.push({kind:input.kind,path,sha256,filename:input.name,sizeBytes:bytes.length});
  }
  const [p,f]=staged;
  const {data:result,error:invokeError}=await client.functions.invoke('validate-monthly-reports',{
    body:{storeId:STORE,periodId:PERIOD,productsPath:p.path,paymentsPath:f.path}
  });
  if(invokeError||!result)throw new Error('Validação HTTP autenticada falhou.');
  const expected={
    state:'VALIDATED_NOT_IMPORTED',productRows:122,paymentRows:9,
    soldProductCodes:120,productsTotalCents:2494463,
    paymentsTotalCents:2494463,differenceCents:0,reconciled:true
  };
  for(const [key,value] of Object.entries(expected)) {
    if(result[key]!==value)throw new Error('Validação de setembro divergente: '+key);
  }
  console.log('PASS: Storage upload/download com JWT + SHA + parser Edge Deno; 122/9 linhas, R$ 24.944,63; SEM importação financeira.');
} finally {
  if(signedIn)await client.auth.signOut();
}
