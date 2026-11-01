import { describe, it, expect } from 'vitest';
import { DEMO_STORES, DEMO_ORGANIZATION } from './supabase/client';

describe('SaaS Multi-Tenant Isolation & Schema Invariants', () => {
  it('should define distinct stores for the organization', () => {
    expect(DEMO_STORES.length).toBeGreaterThanOrEqual(2);
    expect(DEMO_STORES[0].id).not.toEqual(DEMO_STORES[1].id);
    expect(DEMO_STORES[0].organization_id).toEqual(DEMO_ORGANIZATION.id);
    expect(DEMO_STORES[1].organization_id).toEqual(DEMO_ORGANIZATION.id);
  });

  it('should enforce distinct store codes', () => {
    const codes = DEMO_STORES.map((s) => s.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should validate multi-tenant store context scoping', () => {
    const activeStore = DEMO_STORES[0];
    const isolateQuery = (storeId: string) => {
      return DEMO_STORES.filter((s) => s.id === storeId);
    };

    const isolatedResult = isolateQuery(activeStore.id);
    expect(isolatedResult.length).toBe(1);
    expect(isolatedResult[0].code).toBe('LOJA_SJP');
  });
});
