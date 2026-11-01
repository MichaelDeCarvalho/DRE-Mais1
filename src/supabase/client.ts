import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { UserSession } from './types';

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

/**
 * Retrieves the current authenticated user session from Supabase Auth and queries authorized memberships.
 * Returns null session if unauthenticated or not configured.
 */
export async function getCurrentSession(): Promise<UserSession> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      user: null,
      organization: null,
      store: null,
      role: null,
    };
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      return {
        user: null,
        organization: null,
        store: null,
        role: null,
      };
    }

    // Query user's authorized store memberships and joined organization/store records from Supabase
    const { data: memberships, error: membershipError } = await supabase
      .from('store_memberships')
      .select('*, organization:organizations(*), store:stores(*)')
      .eq('user_id', session.user.id);

    if (membershipError) {
      console.error('[Supabase Auth] Erro ao carregar permissões do usuário:', membershipError);
    }

    const activeMembership = memberships?.[0];
    return {
      user: { id: session.user.id, email: session.user.email || '' },
      organization: activeMembership?.organization || null,
      store: activeMembership?.store || null,
      role: activeMembership?.role || null,
    };
  } catch (err) {
    console.error('[Supabase Auth] Falha crítica na verificação de sessão:', err);
    return {
      user: null,
      organization: null,
      store: null,
      role: null,
    };
  }
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
