import { describe, it, expect } from 'vitest';
import { createStorePeriod } from './services/saasApi';

describe('SaaS Period Operations & Validation Invariants', () => {
  it('should reject invalid year-month formats', async () => {
    await expect(createStorePeriod('store-123', '2026-13')).rejects.toThrow('Formato de competência inválido');
    await expect(createStorePeriod('store-123', '2026-00')).rejects.toThrow('Formato de competência inválido');
    await expect(createStorePeriod('store-123', 'invalid')).rejects.toThrow('Formato de competência inválido');
  });

  it('should accept valid YYYY-MM period formats (e.g. 2026-09)', async () => {
    // Calling without active Supabase connection should throw Supabase nao configurado
    await expect(createStorePeriod('store-123', '2026-09')).rejects.toThrow('Supabase não configurado');
  });
});
