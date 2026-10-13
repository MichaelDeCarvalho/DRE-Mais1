import { describe, expect, it, vi } from 'vitest';
import { consultPeriodModules, nextCompetence, PERIOD_COMMANDS } from './competence';

describe('consulta unificada da competência', () => {
  it('consulta todas as seções com o mesmo mês e mantém sucessos se uma falhar', async () => {
    const run = vi.fn(async (command:string, args:{period:string}) => {
      if (command === 'get_dre_preview') throw new Error('Sem importação para o mês');
      return { command, period: args.period };
    });
    const results = await consultPeriodModules('2026-11', run);
    expect(run).toHaveBeenCalledTimes(PERIOD_COMMANDS.length);
    expect(run.mock.calls.map(([command, args]) => [command, args.period]))
      .toEqual(PERIOD_COMMANDS.map(command => [command, '2026-11']));
    expect(results.get_dre_preview.status).toBe('rejected');
    expect(results.list_financial_parameters).toEqual({ status: 'fulfilled', value: { command: 'list_financial_parameters', period: '2026-11' } });
    expect(results.list_expenses.status).toBe('fulfilled');
  });
  it('avança a vigência inclusive na mudança de ano', () => {
    expect(nextCompetence('2026-09')).toBe('2026-10');
    expect(nextCompetence('2026-12')).toBe('2027-01');
    expect(() => nextCompetence('2026-13')).toThrow('Competência inválida');
  });
});
