import { describe, expect, it } from 'vitest';
import { planPeriodSelection } from './periodSelection';

describe('seleção de competência já cadastrada', () => {
  it('clicar setembro já exibido ainda fornece ação e feedback para avançar', () => {
    const selected = planPeriodSelection({ year_month: '2026-09', status: 'DRAFT' }, '2026-09');
    expect(selected).toMatchObject({
      year: '2026', month: '09', changed: false, canArchive: true
    });
    expect(selected.notice).toContain('selecionada (DRAFT)');
    expect(selected.notice).toContain('Etapa 02');
    expect(selected.notice).toContain('Nenhum lançamento financeiro');
  });

  it('trocar o mês invalida os arquivos anteriores e aponta para o mês correto', () => {
    const selected = planPeriodSelection({ year_month: '2026-10', status: 'DRAFT' }, '2026-09');
    expect(selected).toMatchObject({ year: '2026', month: '10', changed: true, canArchive: true });
  });

  it('não incentiva novo arquivamento quando competência não está em DRAFT', () => {
    for (const status of ['IMPORTADO', 'DIVERGENTE', 'FECHADO'] as const) {
      const selected = planPeriodSelection({ year_month: '2026-09', status }, '2026-09');
      expect(selected.canArchive).toBe(false);
      expect(selected.notice).toContain('não aceita novos arquivos');
    }
  });
});
