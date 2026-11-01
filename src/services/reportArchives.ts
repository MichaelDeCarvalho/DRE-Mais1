/**
 * Etapa de preparação de arquivos originais para importação mensal.
 *
 * NÃO grava linhas financeiras nem conclui uma importação.
 * NÃO chamada pela interface até a operação transacional do backend existir.
 * O Storage e o PostgreSQL não compartilham uma transação distribuída.
 */
import { isSupabaseConfigured, supabase } from '../supabase/client';
import { previewXlsxFiles } from '../importPreview';

export type MonthlyReportKind = 'PRODUCTS' | 'PAYMENTS';

export interface ArchiveFileResult {
  kind: MonthlyReportKind;
  path: string;
  sha256: string;
  fileName: string;
  size: number;
}

export interface ArchiveBatchResult {
  storeId: string;
  periodId: string;
  state: 'FILES_STAGED_NOT_IMPORTED';
  files: [ArchiveFileResult, ArchiveFileResult];
}

const BUCKET = 'dre-mais1-report-archives';
const MAX_BYTES = 20 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function validateFile(file: File, kind: MonthlyReportKind): void {
  if (!(file instanceof Blob) || !/\.xlsx$/i.test(file.name)) {
    throw new Error(`Arquivo de ${kind} deve ser uma planilha .xlsx.`);
  }
  if (file.size < 1 || file.size > MAX_BYTES) {
    throw new Error(`Arquivo de ${kind} deve ter entre 1 byte e 20 MiB.`);
  }
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('');
}

export function archiveObjectPath(
  storeId: string,
  periodId: string,
  kind: MonthlyReportKind,
  sha256: string
): string {
  if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(periodId)) {
    throw new Error('Identificador de loja ou competência inválido.');
  }
  if (kind !== 'PRODUCTS' && kind !== 'PAYMENTS') {
    throw new Error('Tipo de relatório inválido.');
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('SHA-256 do arquivo inválido.');
  }
  return `${storeId.toLowerCase()}/${periodId.toLowerCase()}/${kind}/${sha256}.xlsx`;
}

export async function stageMonthlyReportFiles(
  storeId: string,
  periodId: string,
  products: File,
  payments: File
): Promise<ArchiveBatchResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase não configurado.');
  }

  // Valide todos os inputs antes do primeiro upload para evitar escrita parcial.
  validateFile(products, 'PRODUCTS');
  validateFile(payments, 'PAYMENTS');
  if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(periodId)) {
    throw new Error('Identificador de loja ou competência inválido.');
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('Sessão não autenticada. Entre novamente.');
  }

  // RLS valida que o período é visível para o usuário.
  // O Storage reforça manager/owner, loja e DRAFT no momento do upload.
  const { data: period, error: periodError } = await supabase.from('periods')
    .select('id, store_id, status, year_month')
    .eq('id', periodId)
    .eq('store_id', storeId)
    .single();

  if (periodError || !period || period.status !== 'DRAFT') {
    throw new Error('Competência inexistente, inacessível ou não está em rascunho.');
  }

  // Pré-validação de layout, competência e centavos ANTES de qualquer escrita no
  // Storage. A competência vem do PostgreSQL, nunca de um parâmetro não confiável.
  // Isto NÃO substitui o parser autoritativo no backend antes do commit financeiro.
  await previewXlsxFiles(products, payments, period.year_month);

  const originals: Array<{ kind: MonthlyReportKind; file: File }> = [
    { kind: 'PRODUCTS', file: products },
    { kind: 'PAYMENTS', file: payments }
  ];

  const prepared = await Promise.all(originals.map(async ({ kind, file }) => {
    const buffer = await file.arrayBuffer();
    const sha256 = await sha256Hex(buffer);
    const path = archiveObjectPath(storeId, periodId, kind, sha256);
    return { kind, file, buffer, sha256, path };
  }));

  const staged: ArchiveFileResult[] = [];
  for (const item of prepared) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(item.path, item.buffer, {
        contentType: XLSX_MIME,
        upsert: false
      });

    if (error) {
      // Um retry pode encontrar exatamente o mesmo objeto (ou um upload que
      // concluiu no servidor mas cuja resposta se perdeu). Reutilizar somente
      // quando o download privado confirmar tamanho e SHA-256 idênticos.
      // Jamais substituir objetos existentes: upsert permanece false.
      const { data: existing, error: downloadError } = await supabase.storage
        .from(BUCKET).download(item.path);
      const matchesOriginal = !downloadError && !!existing &&
        existing.size === item.file.size &&
        await sha256Hex(await existing.arrayBuffer()) === item.sha256;
      if (!matchesOriginal) {
        // Limpeza de órfãos exige serviço administrativo auditável, não browser.
        throw new Error(
          `Falha ao arquivar ${item.kind}: ${error.message}. ` +
          `Arquivos anteriores podem ter sido armazenados; nenhuma linha financeira foi importada.`
        );
      }
    }

    staged.push({
      kind: item.kind,
      path: item.path,
      sha256: item.sha256,
      fileName: item.file.name,
      size: item.file.size
    });
  }

  return {
    storeId,
    periodId,
    state: 'FILES_STAGED_NOT_IMPORTED',
    files: staged as [ArchiveFileResult, ArchiveFileResult]
  };
}
