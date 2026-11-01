import {beforeEach,describe,expect,it,vi} from 'vitest';

const mock=vi.hoisted(()=>({stage:vi.fn(),invoke:vi.fn()}));
vi.mock('./reportArchives',()=>({stageMonthlyReportFiles:mock.stage}));
vi.mock('../supabase/client',()=>({
  isSupabaseConfigured:true,
  supabase:{functions:{invoke:mock.invoke}}
}));
import {archiveAndValidateCurrentSession} from './archiveValidation';
import type {MonthlyImportPreview} from '../importPreview';

const storeId='a90a2118-6f5e-4dc2-8548-32de70ce3c20';
const periodId='a01f4767-6cc4-4eff-8170-0c23f6c77c4c';
const shaA='a'.repeat(64),shaB='b'.repeat(64);
const products=new File(['products'],'produtos-set-2026.xlsx');
const payments=new File(['payments'],'pagamentos-set-2026.xlsx');
const preview:MonthlyImportPreview={
  period:'2026-09',productRows:122,paymentRows:9,soldProductCodes:120,
  positiveSalesCents:2837070,adjustmentsCents:-342607,
  productsTotalCents:2494463,paymentsTotalCents:2494463,
  differenceCents:0,reconciled:true,methods:[]
};
const staged={
  storeId,periodId,state:'FILES_STAGED_NOT_IMPORTED',
  files:[
    {kind:'PRODUCTS',path:storeId+'/'+periodId+'/PRODUCTS/'+shaA+'.xlsx',sha256:shaA,fileName:products.name,size:products.size},
    {kind:'PAYMENTS',path:storeId+'/'+periodId+'/PAYMENTS/'+shaB+'.xlsx',sha256:shaB,fileName:payments.name,size:payments.size}
  ]
};
const validated={
  state:'VALIDATED_NOT_IMPORTED',...preview,
  methods:undefined,productsSha256:shaA,paymentsSha256:shaB
};

beforeEach(()=>{
  vi.clearAllMocks();
  mock.stage.mockResolvedValue(staged);
  mock.invoke.mockResolvedValue({data:validated,error:null});
});

describe('homologação no browser usa sessão Supabase existente',()=>{
  it('chama apenas arquivamento privado e Edge de validação sem import financeiro',async()=>{
    const done=await archiveAndValidateCurrentSession(storeId,periodId,products,payments,preview);
    expect(mock.stage).toHaveBeenCalledWith(storeId,periodId,products,payments);
    expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('validate-monthly-reports',{
      body:{
        storeId,periodId,productsPath:staged.files[0].path,
        paymentsPath:staged.files[1].path
      }
    });
    expect(done.validation).toMatchObject({state:'VALIDATED_NOT_IMPORTED',reconciled:true});
  });
  it('bloqueia upload sem conciliação prévia',async()=>{
    await expect(archiveAndValidateCurrentSession(storeId,periodId,products,payments,
      {...preview,reconciled:false,differenceCents:1})).rejects.toThrow('conciliar');
    expect(mock.stage).not.toHaveBeenCalled();
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('não anuncia êxito quando Edge não valida arquivos arquivados',async()=>{
    mock.invoke.mockResolvedValueOnce({data:null,error:{message:'500'}});
    await expect(archiveAndValidateCurrentSession(storeId,periodId,products,payments,preview))
      .rejects.toThrow('não foi concluída');
  });
  it('rejeita diferença monetária entre validação local e backend',async()=>{
    mock.invoke.mockResolvedValueOnce({data:{...validated,productsTotalCents:2500000},error:null});
    await expect(archiveAndValidateCurrentSession(storeId,periodId,products,payments,preview))
      .rejects.toThrow('productsTotalCents');
  });
  it('rejeita resposta de SHA-256 diferente dos bytes arquivados',async()=>{
    mock.invoke.mockResolvedValueOnce({data:{...validated,productsSha256:shaB},error:null});
    await expect(archiveAndValidateCurrentSession(storeId,periodId,products,payments,preview))
      .rejects.toThrow('productsSha256');
  });
});
