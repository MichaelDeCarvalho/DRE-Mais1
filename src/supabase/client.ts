import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Organization, Store, UserSession } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let supabaseInstance: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = supabaseInstance;

// Initial default organization and store for SaaS single-tenant preview fallback
export const DEMO_ORGANIZATION: Organization = {
  id: 'org-mais1-001',
  name: 'Franquia Mais1 Café - Grupo Sul',
  slug: 'mais1-sul',
  created_at: new Date().toISOString(),
};

export const DEMO_STORES: Store[] = [
  {
    id: 'store-sjp-001',
    organization_id: 'org-mais1-001',
    code: 'LOJA_SJP',
    display_name: 'Loja São José dos Pinhais (SJP)',
    created_at: new Date().toISOString(),
  },
  {
    id: 'store-curitiba-002',
    organization_id: 'org-mais1-001',
    code: 'LOJA_CWB_CENTRO',
    display_name: 'Loja Curitiba Centro',
    created_at: new Date().toISOString(),
  },
];

export async function getCurrentSession(): Promise<UserSession> {
  if (isSupabaseConfigured && supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // Fetch memberships and active store from Supabase
      const { data: memberships } = await supabase
        .from('store_memberships')
        .select('*, organization:organizations(*), store:stores(*)')
        .eq('user_id', session.user.id);

      const activeMembership = memberships?.[0];
      return {
        user: { id: session.user.id, email: session.user.email || '' },
        organization: activeMembership?.organization || DEMO_ORGANIZATION,
        store: activeMembership?.store || DEMO_STORES[0],
        role: activeMembership?.role || 'OWNER',
      };
    }
  }

  // Fallback demo session when env vars are not set
  return {
    user: { id: 'usr-demo-001', email: 'michael.c.carvalho@gmail.com' },
    organization: DEMO_ORGANIZATION,
    store: DEMO_STORES[0],
    role: 'OWNER',
  };
}
