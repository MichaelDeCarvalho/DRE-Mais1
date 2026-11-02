/**
 * DRE Mais1: importação persistente no backend.
 * NÃO IMPLANTAR até homologação de HTTP Storage, Auth e transação SQL.
 * A única RPC de escrita recebe linhas de bytes validados pela própria Edge Function.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import readExcelFile from 'npm:read-excel-file@9.3.14/browser';
import {parseMonthlyReports, type Worksheet} from '../_shared/parseMonthlyReports.ts';
import {corsHeadersForOrigin} from '../_shared/cors.ts';

const BUCKET='dre-mais1-report-archives';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES=20*1024*1024;

function validPath(storeId:string,periodId:string,kind:'PRODUCTS'|'PAYMENTS',path:string):boolean {
  const prefix=storeId.toLowerCase()+'/'+periodId.toLowerCase()+'/'+kind+'/';
  return path.startsWith(prefix) &&
    /^[a-f0-9]{64}\.xlsx$/.test(path.slice(prefix.length)) &&
    path.split('/').length===4;
}
async function hashHex(bytes:ArrayBuffer):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
function env(key:string):string {
  const v=Deno.env.get(key);
  if(!v) throw new Error('Configuração server-side ausente: '+key);
  return v;
}

Deno.serve(async(req:Request):Promise<Response>=>{
  const CORS=corsHeadersForOrigin(req.headers.get('origin'));
  const json=(status:number, value:unknown):Response=>
    new Response(JSON.stringify(value),{
      status,headers:{...CORS,'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
    });
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
  if(req.method!=='POST') return json(405,{error:'Método não permitido.'});
  const tokenHeader=req.headers.get('authorization') || '';
  const match=/^Bearer ([^\s]+)$/.exec(tokenHeader);
  if(!match) return json(401,{error:'Autenticação obrigatória.'});
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json(415,{error:'É necessário application/json.'});
  }
  const bodyText=await req.text();
  if(bodyText.length>4096) return json(413,{error:'Solicitação excessiva.'});
  let data:Record<string,unknown>;
  try{
    const value=JSON.parse(bodyText);
    if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error();
    data=value as Record<string,unknown>;
  }catch{return json(400,{error:'JSON inválido.'});}
  const {storeId,periodId,productsPath,paymentsPath,productsFilename,paymentsFilename}=data;
  if(typeof storeId!=='string'||typeof periodId!=='string'||
     typeof productsPath!=='string'||typeof paymentsPath!=='string'||
     !UUID.test(storeId)||!UUID.test(periodId)||
     !validPath(storeId,periodId,'PRODUCTS',productsPath)||
     !validPath(storeId,periodId,'PAYMENTS',paymentsPath) ||
     typeof productsFilename!=='string'||typeof paymentsFilename!=='string'||
     !/^[^/\\]{1,250}\.xlsx$/i.test(productsFilename) ||
     !/^[^/\\]{1,250}\.xlsx$/i.test(paymentsFilename)) {
    return json(400,{error:'Identificadores ou caminhos inválidos.'});
  }

  try {
    const url=env('SUPABASE_URL');
    const key=Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||env('SUPABASE_ANON_KEY');
    // Não usar service_role: todas as leituras são feitas na identidade do usuário.
    const db=createClient(url,key,{
      global:{headers:{Authorization:tokenHeader}},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:userData,error:userError}=await db.auth.getUser(match[1]);
    if(userError||!userData.user) return json(401,{error:'Sessão inválida.'});
    // Ativação dupla: o deploy em homologação é inerte por padrão.
    // Somente uma configuração server-side explícita permite escrita pela RPC.
    if(Deno.env.get('FINANCIAL_COMMIT_ENABLED')!=='true') {
      return json(423,{error:'Importação financeira ainda não ativada.'});
    }

    const {data:store,error:storeError}=await db.from('stores')
      .select('id,organization_id').eq('id',storeId).single();
    if(storeError||!store) return json(403,{error:'Loja inacessível.'});
    const {data:membership,error:membershipError}=await db.from('store_memberships')
      .select('role,organization_id,store_id')
      .eq('user_id',userData.user.id)
      .eq('organization_id',store.organization_id);
    // Escopo de loja substitui (não soma) as permissões organizacionais.
    const scoped=membership?.find(m=>m.store_id===storeId);
    const orgWide=membership?.find(m=>m.store_id===null);
    const resolved=scoped??orgWide;
    if(membershipError || !resolved ||
      !['OWNER','ADMIN','MANAGER'].includes(resolved.role))
      return json(403,{error:'Perfil sem permissão gerencial.'});

    const {data:period,error:periodError}=await db.from('periods')
      .select('id,store_id,year_month,status').eq('id',periodId)
      .eq('store_id',storeId).single();
    if(periodError||!period||!['DRAFT','IMPORTADO','DIVERGENTE'].includes(period.status)) {
      return json(409,{error:'Competência não permite importação ou consulta idempotente.'});
    }

    async function verifiedFile(path:string):Promise<File> {
      const {data:blob,error}=await db.storage.from(BUCKET).download(path);
      if(error||!blob) throw new Error('Arquivo privado não disponível.');
      if(blob.size<1||blob.size>MAX_BYTES) throw new Error('Tamanho do XLSX inválido.');
      const buffer=await blob.arrayBuffer();
      const expected=path.split('/').at(-1)!.slice(0,64);
      if(await hashHex(buffer)!==expected) throw new Error('SHA-256 do XLSX divergente.');
      return new File([buffer],path.split('/').at(-1)!,{
        type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
    }

    const [productFile,paymentFile]=await Promise.all([
      verifiedFile(productsPath),verifiedFile(paymentsPath)
    ]);
    // Não aceitar resultados de validação do navegador.
    // O parser é chamado sobre os bytes retornados pelo Storage.
    const [pSheets,fSheets]=await Promise.all([
      readExcelFile(productFile),readExcelFile(paymentFile)
    ]);
    const parsed=parseMonthlyReports(
      pSheets as Worksheet[],fSheets as Worksheet[],period.year_month
    );
    // Credencial exclusiva do runtime; nunca é enviada ao navegador.
    // A RPC é SECURITY INVOKER e possui EXECUTE somente para service_role.
    const service=createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:committed,error:commitError}=await service.rpc('commit_monthly_import_v1',{
      p_actor:userData.user.id,
      p_store_id:storeId,
      p_period_id:periodId,
      p_product_file:{
        path:productsPath,sha256:productsPath.split('/').at(-1)!.slice(0,64),
        filename:productsFilename,sizeBytes:productFile.size
      },
      p_payment_file:{
        path:paymentsPath,sha256:paymentsPath.split('/').at(-1)!.slice(0,64),
        filename:paymentsFilename,sizeBytes:paymentFile.size
      },
      p_products:parsed.productRows,p_payments:parsed.paymentRows
    });
    if(commitError){
      if(['23505','55000'].includes(commitError.code))
        return json(409,{error:'Importação já existente ou competência não editável.'});
      if(commitError.code==='42501')
        return json(403,{error:'Acesso gerencial negado.'});
      if(commitError.code==='22023')
        return json(422,{error:'Dados financeiros rejeitados pelo PostgreSQL.'});
      return json(500,{error:'Falha na transação financeira.'});
    }
    return json(200,{...committed,
      productRows:parsed.productRows.length,
      paymentRows:parsed.paymentRows.length,
      reconciled:parsed.reconciled
    });
  }catch(e){
    // Não devolver detalhes privados das integrações nem informações de outros tenants.
    const safe=e instanceof Error &&
      /^(Arquivo privado não disponível|Tamanho do XLSX inválido|SHA-256 do XLSX divergente)/.test(e.message);
    return json(safe?422:500,{error:safe?(e as Error).message:'Não foi possível validar os arquivos XLSX arquivados.'});
  }
});
