import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('../supabase/client',()=>({
  isSupabaseConfigured:true,
  supabase:{functions:{invoke:mock.invoke}}
}));
import {commitValidatedMonthlyArchive,verifyFinancialCommitBlocked} from './financialCommit';
import type {ArchiveBatchResult} from './reportArchives';
import type {ServerArchiveValidation} from './archiveValidation';

const storeId='a90a2118-6f5e-4dc2-8548-32de70ce3c20';
const periodId='a01f4767-6cc4-4eff-8170-0c23f6c77c4c';
const a='a'.repeat(64),b='b'.repeat(64);
const archive:ArchiveBatchResult={
  state:'FILES_STAGED_NOT_IMPORTED',storeId,periodId,
  files:[
    {kind:'PRODUCTS',path:storeId+'/'+periodId+'/PRODUCTS/'+a+'.xlsx',
      sha256:a,fileName:'produtos-set-2026.xlsx',size:18073},
    {kind:'PAYMENTS',path:storeId+'/'+periodId+'/PAYMENTS/'+b+'.xlsx',
      sha256:b,fileName:'pagamentos-set-2026.xlsx',size:10903}
  ]
};
const validated:ServerArchiveValidation={
  state:'VALIDATED_NOT_IMPORTED',period:'2026-09',productRows:122,paymentRows:9,
  soldProductCodes:120,positiveSalesCents:2837070,adjustmentsCents:-342607,
  productsTotalCents:2494463,paymentsTotalCents:2494463,
  differenceCents:0,reconciled:true,
  productsSha256:a,paymentsSha256:b
};
const response={
  state:'IMPORTED',periodId,productImportId:'11111111-1111-4111-8111-111111111111',
  paymentImportId:'22222222-2222-4222-8222-222222222222',
  productsTotalCents:2494463,paymentsTotalCents:2494463,differenceCents:0,
  productRows:122,paymentRows:9,reconciled:true
};
beforeEach(()=>{
  vi.clearAllMocks();
  mock.invoke.mockResolvedValue({data:response,error:null});
});
describe('contrato de importação financeira ainda não ativado na UI',()=>{
  it('envia somente referências dos XLSX já validados à Edge autenticada',async()=>{
    const got=await commitValidatedMonthlyArchive(archive,validated);
    expect(got.state).toBe('IMPORTED');
    expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('commit-monthly-reports',{
      body:{
        storeId,periodId,productsPath:archive.files[0].path,
        paymentsPath:archive.files[1].path,
        productsFilename:'produtos-set-2026.xlsx',
        paymentsFilename:'pagamentos-set-2026.xlsx'
      }
    });
  });
  it('aceita o retry idempotente informado pelo backend',async()=>{
    mock.invoke.mockResolvedValueOnce({data:{...response,state:'ALREADY_IMPORTED'},error:null});
    const got=await commitValidatedMonthlyArchive(archive,validated);
    expect(got.state).toBe('ALREADY_IMPORTED');
  });
  it('não inicia commit sem conciliação exata',async()=>{
    await expect(commitValidatedMonthlyArchive(archive,{...validated,reconciled:false,differenceCents:100}))
      .rejects.toThrow('não autorizada');
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('não inicia commit com hash ou caminho forjado',async()=>{
    await expect(commitValidatedMonthlyArchive(archive,{...validated,productsSha256:b}))
      .rejects.toThrow('SHA-256');
    await expect(commitValidatedMonthlyArchive({
      ...archive,files:[{...archive.files[0],path:'other/path.xlsx'},archive.files[1]]
    },validated)).rejects.toThrow('SHA-256');
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('não inicia commit com nome inválido',async()=>{
    await expect(commitValidatedMonthlyArchive({...archive,files:[
      {...archive.files[0],fileName:'../../produtos.xlsx'},archive.files[1]
    ]},validated)).rejects.toThrow('Metadados');
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('recusa status divergente ou resposta de commit incompleto',async()=>{
    mock.invoke.mockResolvedValueOnce({data:{...response,state:'IMPORTED_DIVERGENT'},error:null});
    await expect(commitValidatedMonthlyArchive(archive,validated)).rejects.toThrow('não confirmada');
    mock.invoke.mockResolvedValueOnce({data:{...response,productImportId:null},error:null});
    await expect(commitValidatedMonthlyArchive(archive,validated)).rejects.toThrow('IDs de importação');
  });
  it('falha com erro HTTP de função ainda bloqueada (423)',async()=>{
    mock.invoke.mockResolvedValueOnce({data:null,error:{status:423,message:'Locked'}});
    await expect(commitValidatedMonthlyArchive(archive,validated)).rejects.toThrow('Consulte o histórico');
  });
  it('não declara sucesso de gravação com erro de resposta',async()=>{
    mock.invoke.mockResolvedValueOnce({data:null,error:{message:'timeout'}});
    await expect(commitValidatedMonthlyArchive(archive,validated))
      .rejects.toThrow('Consulte o histórico');
  });
  it('não declara sucesso quando a Edge relata valor divergente',async()=>{
    mock.invoke.mockResolvedValueOnce({data:{...response,paymentsTotalCents:2494464},error:null});
    await expect(commitValidatedMonthlyArchive(archive,validated))
      .rejects.toThrow('inconsistente');
  });
});

describe('prova negativa do bloqueio da Edge com sessão do navegador',()=>{
  const lockMessage='Importação financeira ainda não ativada.';
  it('aceita somente HTTP 423 com corpo de bloqueio exato',async()=>{
    const context=new Response(JSON.stringify({error:lockMessage}),{
      status:423,headers:{'content-type':'application/json'}
    });
    mock.invoke.mockResolvedValueOnce({data:null,error:{context}});
    await expect(verifyFinancialCommitBlocked()).resolves.toBeUndefined();
    expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('commit-monthly-reports',{
      body:{
        storeId:'00000000-0000-4000-8000-000000000000',
        periodId:'00000000-0000-4000-8000-000000000001',
        productsPath:'00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001/PRODUCTS/'+a.replace(/a/g,'0')+'.xlsx',
        paymentsPath:'00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001/PAYMENTS/'+b.replace(/b/g,'1')+'.xlsx',
        productsFilename:'probe-products.xlsx',
        paymentsFilename:'probe-payments.xlsx'
      }
    });
  });
  it('não aprova HTTP 401, 403 ou 200 e não envia XLSX reais',async()=>{
    for(const status of [401,403]){
      mock.invoke.mockResolvedValueOnce({
        data:null,error:{context:new Response(JSON.stringify({error:'Unauthorized'}),{status})}
      });
      await expect(verifyFinancialCommitBlocked()).rejects.toThrow('423 não comprovado');
    }
    mock.invoke.mockResolvedValueOnce({data:{state:'IMPORTED'},error:null});
    await expect(verifyFinancialCommitBlocked()).rejects.toThrow('423 não comprovado');
  });
  it('não aprova resposta 423 inesperada ou inválida',async()=>{
    mock.invoke.mockResolvedValueOnce({
      data:null,error:{context:new Response(JSON.stringify({error:'Outro estado'}),{status:423})}
    });
    await expect(verifyFinancialCommitBlocked()).rejects.toThrow('inesperada');
    mock.invoke.mockResolvedValueOnce({
      data:null,error:{context:new Response('não é JSON',{status:423})}
    });
    await expect(verifyFinancialCommitBlocked()).rejects.toThrow('inválida');
  });
});
