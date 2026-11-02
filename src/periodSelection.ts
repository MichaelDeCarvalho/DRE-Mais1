import { periodLabel } from './format';
import type { PeriodRecord } from './services/saasApi';

/** Seleção de competência existente: não cria nem importa dados. */
export function planPeriodSelection(
  stored: Pick<PeriodRecord, 'year_month' | 'status'>,
  currentPeriod: string,
) {
  const [year, month] = stored.year_month.split('-');
  const canArchive = stored.status === 'DRAFT';
  const notice = canArchive
    ? `Competência ${periodLabel(stored.year_month)} selecionada (DRAFT). Vá à Etapa 02, escolha os relatórios XLSX de produtos e pagamentos e clique em “Validar arquivos sem gravar”. Nenhum lançamento financeiro foi realizado.`
    : `Competência ${periodLabel(stored.year_month)} selecionada (${stored.status}). Esta competência não aceita novos arquivos para homologação.`;
  return {
    year,
    month,
    changed: currentPeriod !== stored.year_month,
    canArchive,
    notice,
  };
}
