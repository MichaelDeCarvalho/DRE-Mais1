import { describe, it, expect } from 'vitest';
import { getCurrentSession } from './supabase/client';

describe('SaaS Multi-Tenant Isolation & Authentication Rules', () => {
  it('should return unauthenticated null session by default when no user is signed in', async () => {
    const session = await getCurrentSession();
    expect(session.user).toBeNull();
    expect(session.organization).toBeNull();
    expect(session.store).toBeNull();
    expect(session.role).toBeNull();
  });
});
