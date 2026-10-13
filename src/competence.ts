/** Consultas de competencia independentes: uma falha nao bloqueia os demais modulos. */
export const PERIOD_COMMANDS = [
  'load_period_summary',
  'list_ingredients',
  'monthly_cost_overview',
  'monthly_cmv_summary',
  'get_dre_preview',
  'list_expenses',
  'list_financial_parameters',
] as const;
export type PeriodCommand = (typeof PERIOD_COMMANDS)[number];

export async function consultPeriodModules(
  period: string,
  run: (command: PeriodCommand, args: { period: string }) => Promise<unknown>,
): Promise<Record<PeriodCommand, PromiseSettledResult<unknown>>> {
  const settled = await Promise.allSettled(PERIOD_COMMANDS.map(command => run(command, { period })));
  return Object.fromEntries(PERIOD_COMMANDS.map((command, i) => [command, settled[i]])) as Record<PeriodCommand, PromiseSettledResult<unknown>>;
}

/** Avanca a vigencia sem alterar a competencia global selecionada. */
export function nextCompetence(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Competência inválida');
  }
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}
