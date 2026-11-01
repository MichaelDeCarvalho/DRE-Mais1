import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Organization, Store, UserSession } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let supabaseInstance: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export const supabase = supabaseInstance;

// Isolated Demo environment fixtures - used strictly when explicitly in Demo Mode
export const DEMO_ORGANIZATION: Organization = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Franquia Mais1 Café (Modo Demonstração)',
  slug: 'mais1-demo',
  created_at: new Date().toISOString(),
};

export const DEMO_STORES: Store[] = [
  {
    id: '00000000-0000-0000-0000-000000000101',
    organization_id: '00000000-0000-0000-0000-000000000001',
    code: 'LOJA_SJP',
    display_name: 'Loja São José dos Pinhais (SJP) - Demo',
    created_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000102',
    organization_id: '00000000-0000-0000-0000-000000000001',
    code: 'LOJA_CWB_CENTRO',
    display_name: 'Loja Curitiba Centro - Demo',
    created_at: new Date().toISOString(),
  },
];

export async function getCurrentSession(): Promise<UserSession> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Query user's store memberships from Supabase
        const { data: memberships, error } = await supabase
          .from('store_memberships')
          .select('*, organization:organizations(*), store:stores(*)')
          .eq('user_id', session.user.id);

        if (error) {
          console.error('[Supabase Auth] Erro ao carregar permissões do usuário:', error);
        }

        const activeMembership = memberships?.[0];
        return {
          user: { id: session.user.id, email: session.user.email || '' },
          organization: activeMembership?.organization || null,
          store: activeMembership?.store || null,
          role: activeMembership?.role || null,
        };
      }
    } catch (err) {
      console.error('[Supabase Auth] Falha na verificação de sessão:', err);
    }
  }

  // Without active authenticated session, return unauthenticated session (NO demo fallback)
  return {
    user: null,
    organization: null,
    store: null,
    role: null,
  };
}

/**
 * Returns isolated demo session ONLY when Demo Mode is explicitly enabled by the user.
 */
export function getDemoSession(): UserSession {
  return {
    user: { id: 'usr-demo-001', email: 'demonstracao@mais1cafe.com.br' },
    organization: DEMO_ORGANIZATION,
    store: DEMO_STORES[0],
    role: 'OWNER',
  };
}

/**
 * Tests live connection and authorization to Supabase PostgreSQL database.
 */
export async function testSupabaseConnection(): Promise<{ connected: boolean; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { connected: false, message: 'Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não configuradas.' };
  }

  try {
    const { error } = await supabase.from('organizations').select('id', { head: true, count: 'exact' });
    if (error && error.code !== 'PGRST116') {
      return { connected: false, message: `Erro ao conectar com PostgreSQL: ${error.message}` };
    }
    return { connected: true, message: 'Conexão Supabase PostgreSQL verificada com sucesso.' };
  } catch (e) {
    return { connected: false, message: e instanceof Error ? e.message : 'Falha na comunicação de rede com Supabase.' };
  }
}
