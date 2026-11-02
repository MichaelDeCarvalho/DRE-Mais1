import {useEffect, useState} from 'react';
import type {MonthlyImportPreview} from '../importPreview';
import type {PeriodRecord} from '../services/saasApi';
import {
  archiveAndValidateCurrentSession,
  type MonthlyArchiveValidation
} from '../services/archiveValidation';
import {brl} from '../format';
import {
  commitValidatedMonthlyArchive,
  verifyFinancialCommitBlocked,
  type MonthlyCommitResult
} from '../services/financialCommit';

const FINANCIAL_COMMIT_UI_ENABLED = import.meta.env.VITE_ENABLE_FINANCIAL_COMMIT === 'true';

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
  const [commitApproved,setCommitApproved] = useState(false);
  const [committing,setCommitting] = useState(false);
  const [commitResult,setCommitResult] = useState<MonthlyCommitResult | null>(null);
  const [commitError,setCommitError] = useState('');
  const [lockTest,setLockTest] = useState<'idle'|'running'|'passed'|'failed'>('idle');
  const [lockError,setLockError] = useState('');
  useEffect(()=>{
    setApproved(false);
    setResult(null);
    setError('');
    setCommitApproved(false);
    setCommitResult(null);
    setCommitError('');
    setLockTest('idle');
    setLockError('');
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
    setCommitApproved(false);setCommitResult(null);setCommitError('');
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

  const canCommit = Boolean(FINANCIAL_COMMIT_UI_ENABLED && eligible && result &&
    period && result.archived.storeId===storeId &&
    result.archived.periodId===period.id && !busy && !committing && !commitResult);

  async function commit() {
    if(!canCommit || !result || !commitApproved) return;
    setCommitting(true);
    setCommitError('');
    try {
      setCommitResult(await commitValidatedMonthlyArchive(result.archived,result.validation));
    } catch(e) {
      setCommitError(e instanceof Error ? e.message : 'Importação não confirmada.');
      setCommitApproved(false);
    } finally {
      setCommitting(false);
    }
  }

  async function testCommitLock() {
    if(lockTest==='running' || busy || committing) return;
    setLockTest('running');
    setLockError('');
    try {
      await verifyFinancialCommitBlocked();
      setLockTest('passed');
    } catch(e) {
      setLockTest('failed');
      setLockError(e instanceof Error ? e.message : 'Bloqueio não comprovado.');
    }
  }

  return <div className="feedback feedback-info" aria-label="Homologação de arquivos originais no servidor">
    <strong>Homologação privada — sessão da conta atual</strong>
    <div className="feedback feedback-info" aria-label="Teste de bloqueio financeiro">
      <strong>Teste de segurança: Edge financeira bloqueada</strong>
      <p>Envia uma solicitação sintética usando a sessão Supabase atual,
        sem XLSX, identificadores reais ou lançamento financeiro.
        O único resultado aprovado é HTTP 423 com a mensagem de bloqueio.</p>
      <button type="button" className="outline-button"
        disabled={lockTest==='running'||busy||committing} onClick={testCommitLock}>
        {lockTest==='running' ? 'Verificando bloqueio…' : 'Testar bloqueio financeiro (sem gravação)'}
      </button>
      {lockTest==='passed' && <p role="status">Bloqueio confirmado: HTTP 423 após
        validação da sessão. A função financeira permanece desativada.</p>}
      {lockTest==='failed' && <p role="alert" className="feedback feedback-error">
        {lockError}
      </p>}
    </div>
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
    {FINANCIAL_COMMIT_UI_ENABLED && result && <div className="feedback feedback-info"
      aria-label="Confirmação de importação financeira">
      <strong>Importação financeira definitiva — homologação</strong>
      <p>Esta ação grava vendas e pagamentos no PostgreSQL e altera o estado da
        competência. Não é uma simulação. A gravação depende também de liberação
        explícita no servidor.</p>
      {!commitResult && <>
        <label style={{display:'flex',gap:'8px',alignItems:'flex-start',margin:'12px 0'}}>
          <input type="checkbox" checked={commitApproved}
            disabled={!canCommit} onChange={e=>setCommitApproved(e.target.checked)} />
          <span>Autorizo expressamente gravar os dados financeiros desta competência.</span>
        </label>
        <button type="button" className="outline-button"
          disabled={!canCommit||!commitApproved} onClick={commit}>
          {committing?'Gravando importação…':'Confirmar importação financeira definitiva'}
        </button>
      </>}
      {commitResult && <p role="status"><strong>{commitResult.state==='ALREADY_IMPORTED'
        ? 'Importação existente confirmada (sem duplicação)'
        : 'Importação financeira gravada'}</strong>. Produtos: {commitResult.productRows} linhas;
        pagamentos: {commitResult.paymentRows} linhas. Receita: {brl(commitResult.productsTotalCents)}.
        Diferença: {brl(commitResult.differenceCents)}.</p>}
      {commitError && <p role="alert" className="feedback feedback-error">{commitError}</p>}
    </div>}
    {error && <p role="alert" className="feedback feedback-error">
      {error}
    </p>}
  </div>;
}
