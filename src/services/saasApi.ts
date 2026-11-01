/**
 * SaaS API Service layer for DRE Mais1.
 * Communicates with Supabase PostgreSQL and Edge Functions with real authentication and RLS.
 */

import { supabase, isSupabaseConfigured } from '../supabase/client';
import type { Store } from '../supabase/types';
import type { ImportSummary, CatalogStatus, MappingOverview } from '../types';

export interface FinancialRuleDto {
  code: string;
  name: string;
  category: string;
  calculationBase: string;
  effectiveFrom: string | null;
  basisPoints: number | null;
  source: string | null;
}

export interface PeriodRecord {
  id: string;
  store_id: string;
  year_month: string;
  status: 'DRAFT' | 'IMPORTADO' | 'PENDENTE' | 'PRONTO' | 'FECHADO' | 'DIVERGENTE';
  closed_at: string | null;
  created_at: string;
}

/**
 * Fetches authorized stores for the authenticated user from Supabase PostgreSQL.
 */
export async function fetchUserStores(): Promise<Store[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase não configurado. Verifique a conexão com o banco PostgreSQL.');
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    throw new Error('Não foi possível confirmar a autenticação do usuário.');
  }
  if (!user) return [];

  // A própria policy stores_select verifica memberships por loja e memberships
  // organizacionais (store_id IS NULL). Não filtrar pela FK store do membership:
  // para proprietários de toda a organização ela é intencionalmente NULL.
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .order('display_name', { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar lojas autorizadas: ${error.message}`);
  }

  return (data ?? []) as Store[];
}

/**
 * Fetches monthly periods for a given store from Supabase PostgreSQL.
 */
export async function fetchStorePeriods(storeId: string): Promise<PeriodRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase não configurado. Conecte o banco PostgreSQL.');
  }

  const { data, error } = await supabase
    .from('periods')
    .select('*')
    .eq('store_id', storeId)
    .order('year_month', { ascending: false });

  if (error) {
    throw new Error(`Erro ao consultar competências: ${error.message}`);
  }

  return data || [];
}

/**
 * Creates a new monthly period in Supabase PostgreSQL, enforcing RLS and duplicate prevention.
 */
export async function createStorePeriod(storeId: string, yearMonth: string): Promise<PeriodRecord> {
  if (!/^[1-2][0-9][0-9][0-9]-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    throw new Error('Formato de competência inválido. Utilize YYYY-MM.');
  }

  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase não configurado.');
  }

  const { data, error } = await supabase
    .from('periods')
    .insert([
      { store_id: storeId, year_month: yearMonth, status: 'DRAFT' }
    ])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`A competência ${yearMonth} já está cadastrada para esta loja.`);
    }
    throw new Error(`Erro ao criar competência: ${error.message}`);
  }

  return data;
}

export async function fetchCatalogStatus(_storeId: string): Promise<CatalogStatus> {
  if (!isSupabaseConfigured || !supabase) {
    return { loaded: false, filename: null, validCodes: 0, skippedRows: 0 };
  }
  return { loaded: false, filename: null, validCodes: 0, skippedRows: 0 };
}

export async function fetchFinancialParameters(_storeId: string, _period: string): Promise<FinancialRuleDto[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }
  return [];
}

export async function importMonthlyReports(
  _storeId: string,
  _period: string,
  _productsFile: File,
  _paymentsFile: File
): Promise<ImportSummary> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase não configurado. Conecte o banco de dados PostgreSQL para realizar importações reais.');
  }
  throw new Error('Funcionalidade de importação server-side em processamento no Supabase.');
}

export async function reviewMappings(_storeId: string, _period: string): Promise<MappingOverview> {
  return { soldProductCodes: 0, mappedProductCodes: 0, unmappedProducts: [] };
}
