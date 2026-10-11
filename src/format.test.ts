import { describe, expect, it } from 'vitest';
import { brl, periodLabel } from './format';
describe('formatação sem alterar centavos do domínio', () => {
  it('formata o total de setembro', () => expect(brl(2494463)).toContain('24.944,63'));
  it('formata desconto negativo', () => expect(brl(-342607)).toContain('3.426,07'));
  it('rejeita centavos fracionários', () => expect(() => brl(0.5)).toThrow());
  it('identifica setembro', () => expect(periodLabel('2026-09')).toContain('2026'));
});
