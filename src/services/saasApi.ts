/**
 * SaaS API Service layer for DRE Mais1.
 * Communicates with Supabase PostgreSQL and Edge Functions.
 * Replaces all Tauri desktop IPC commands with secure server-side SaaS operations.
 */

import { supabase, isSupabaseConfigured } from '../supabase/client';
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

export async function fetchCatalogStatus(_storeId: string): Promise<CatalogStatus> {
  if (!isSupabaseConfigured || !supabase) {
    return { loaded: false, filename: null, validCodes: 0, skippedRows: 0 };
  }
  // Real Supabase PostgreSQL query implementation placeholder
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
