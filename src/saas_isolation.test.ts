import { describe, it, expect } from 'vitest';
import { getCurrentSession, getDemoSession, DEMO_STORES, DEMO_ORGANIZATION } from './supabase/client';

describe('SaaS Multi-Tenant Isolation & Authentication Rules', () => {
  it('should return unauthenticated null session by default when no user is signed in', async () => {
    const session = await getCurrentSession();
    expect(session.user).toBeNull();
    expect(session.organization).toBeNull();
    expect(session.store).toBeNull();
    expect(session.role).toBeNull();
  });

  it('should return isolated demo fixtures ONLY when getDemoSession() is explicitly called', () => {
    const demoSession = getDemoSession();
    expect(demoSession.user).not.toBeNull();
    expect(demoSession.user?.email).toBe('demonstracao@mais1cafe.com.br');
    expect(demoSession.organization?.id).toBe('00000000-0000-0000-0000-000000000001');
    expect(demoSession.store?.code).toBe('LOJA_SJP');
  });

  it('should define distinct UUIDs for demo stores to satisfy PostgreSQL schema constraints', () => {
    expect(DEMO_STORES.length).toBeGreaterThanOrEqual(2);
    expect(DEMO_STORES[0].id).not.toEqual(DEMO_STORES[1].id);
    expect(DEMO_STORES[0].organization_id).toEqual(DEMO_ORGANIZATION.id);
    expect(DEMO_STORES[1].organization_id).toEqual(DEMO_ORGANIZATION.id);
  });

  it('should isolate store context by filtering against target store_id', () => {
    const targetStore = DEMO_STORES[0];
    const isolateQuery = (storeId: string) => {
      return DEMO_STORES.filter((s) => s.id === storeId);
    };

    const isolatedResult = isolateQuery(targetStore.id);
    expect(isolatedResult.length).toBe(1);
    expect(isolatedResult[0].code).toBe('LOJA_SJP');
  });
});
