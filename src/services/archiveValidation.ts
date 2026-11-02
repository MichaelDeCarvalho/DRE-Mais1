/**
 * Arquivamento privado + validação autoritativa com a sessão do usuário atual.
 * NÃO executa importação financeira e NÃO chama commit-monthly-reports.
 */
import {isSupabaseConfigured, supabase} from '../supabase/client';
import {stageMonthlyReportFiles, type ArchiveBatchResult} from './reportArchives';
import type {MonthlyImportPreview} from '../importPreview';

export type ServerArchiveValidation = {
  state: 'VALIDATED_NOT_IMPORTED';
  period: string;
  productRows: number;
  paymentRows: number;
  soldProductCodes: number;
  positiveSalesCents: number;
  adjustmentsCents: number;
  productsTotalCents: number;
  paymentsTotalCents: number;
  differenceCents: number;
  reconciled: boolean;
  productsSha256: string;
  paymentsSha256: string;
};

export type MonthlyArchiveValidation = {
  archived: ArchiveBatchResult;
  validation: ServerArchiveValidation;
};

export async function archiveAndValidateCurrentSession(
  storeId: string,
  periodId: string,
  products: File,
  payments: File,
  expected: MonthlyImportPreview
): Promise<MonthlyArchiveValidation> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado.');
  if (!expected || !expected.period || !expected.reconciled) {
    throw new Error('É necessário validar e conciliar os dois XLSX antes do arquivamento.');
  }

  // Exige que o usuário tenha autenticação Supabase e competência DRAFT.
  // Pode deixar objeto arquivado em caso de falha posterior (Storage não tem rollback SQL).
  const archived = await stageMonthlyReportFiles(storeId, periodId, products, payments);
  const p = archived.files.find(f => f.kind === 'PRODUCTS');
  const f = archived.files.find(f => f.kind === 'PAYMENTS');
  if (!p || !f) throw new Error('Resposta do arquivamento incompleta.');

  const {data, error} = await supabase.functions.invoke('validate-monthly-reports', {
    body: {
      storeId, periodId,
      productsPath: p.path,
      paymentsPath: f.path
    }
  });
  if (error || !data || typeof data !== 'object') {
    throw new Error('Arquivos arquivados, mas a validação no servidor não foi concluída. Não houve importação financeira.');
  }
  const got = data as Record<string, unknown>;
  const expectedFields: Record<string, unknown> = {
    state: 'VALIDATED_NOT_IMPORTED',
    period: expected.period,
    productRows: expected.productRows,
    paymentRows: expected.paymentRows,
    soldProductCodes: expected.soldProductCodes,
    positiveSalesCents: expected.positiveSalesCents,
    adjustmentsCents: expected.adjustmentsCents,
    productsTotalCents: expected.productsTotalCents,
    paymentsTotalCents: expected.paymentsTotalCents,
    differenceCents: expected.differenceCents,
    reconciled: expected.reconciled,
    productsSha256: p.sha256,
    paymentsSha256: f.sha256
  };

  for (const [key, value] of Object.entries(expectedFields)) {
    if (got[key] !== value) {
      throw new Error(
        'Arquivos arquivados, porém a conferência do backend divergiu (' + key +
        '). Não houve importação financeira.'
      );
    }
  }
  return {archived, validation: got as ServerArchiveValidation};
}
