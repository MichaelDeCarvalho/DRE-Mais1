import {useEffect, useState} from 'react';
import type {MonthlyImportPreview} from '../importPreview';
import type {PeriodRecord} from '../services/saasApi';
import {
  archiveAndValidateCurrentSession,
  type MonthlyArchiveValidation
} from '../services/archiveValidation';
import {brl} from '../format';

interface Props {
  storeId: string;
  period: PeriodRecord | undefined;
  productsFile: File | null;
  paymentsFile: File | null;
  preview: MonthlyImportPreview | null;
}

/** Homologação de Storage/Edge: não chama a RPC de gravação financeira. */
export function ArchivedReportHomologation({
  storeId,period,productsFile,paymentsFile,preview
}: Props) {
  const [approved,setApproved] = useState(false);
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState<MonthlyArchiveValidation | null>(null);
  const [error,setError] = useState('');
  useEffect(()=>{
    setApproved(false);
    setResult(null);
    setError('');
  },[storeId,period?.id,productsFile,paymentsFile,preview]);

  const eligible = Boolean(
    storeId && period?.status==='DRAFT' &&
    preview && preview.period===period.year_month && preview.reconciled &&
    productsFile && paymentsFile
  );

  async function run() {
    if (!eligible || !approved || busy ||
      !period || !productsFile || !paymentsFile || !preview) return;
    setBusy(true);setError('');setResult(null);
    try {
      const done=await archiveAndValidateCurrentSession(
        storeId,period.id,productsFile,paymentsFile,preview
      );
      setResult(done);
    } catch(e){
      setError(e instanceof Error ? e.message : 'Validação não concluída.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="feedback feedback-info" aria-label="Homologação de arquivos originais no servidor">
    <strong>Homologação privada — sessão da conta atual</strong>
    <p>Esta opção envia os dois XLSX para o Storage privado e os revalida no
       Supabase. <b>Não importa vendas ou pagamentos para o PostgreSQL.</b></p>
    <p>Os arquivos arquivados não podem ser apagados nesta interface; uma falha
       posterior pode deixá-los armazenados para reconciliação.</p>
    {!period && <p>Selecione uma competência já cadastrada antes de enviar.</p>}
    {period && period.status!=='DRAFT' &&
      <p>A competência está {period.status}; somente DRAFT permite arquivamento.</p>}
    {preview && !preview.reconciled &&
      <p>Prévia divergente: confira os relatórios antes da homologação.</p>}
    <label style={{display:'flex',gap:'8px',alignItems:'flex-start',margin:'12px 0'}}>
      <input type="checkbox" checked={approved} disabled={!eligible||busy}
        onChange={e=>setApproved(e.target.checked)} />
      <span>Confirmo o envio dos arquivos originais da competência selecionada
        ao Storage privado para validação, sem lançamentos financeiros.</span>
    </label>
    <button type="button" className="outline-button"
      disabled={!eligible||!approved||busy} onClick={run}>
      {busy?'Arquivando e verificando no servidor…':'Arquivar e validar no servidor (sem importar)'}
    </button>
    {result && <div role="status" className="feedback feedback-info">
      <strong>Validado no servidor — NÃO IMPORTADO</strong>
      <p>Produtos: {result.validation.productRows} linhas. Pagamentos: {result.validation.paymentRows} linhas.
      Receita líquida: {brl(result.validation.productsTotalCents)}.
      Diferença: {brl(result.validation.differenceCents)}.</p>
      <p>Arquivos preservados no Storage privado. Importações financeiras: não executadas.</p>
    </div>}
    {error && <p role="alert" className="feedback feedback-error">
      {error}
    </p>}
  </div>;
}
