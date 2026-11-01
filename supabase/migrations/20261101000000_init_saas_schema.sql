-- Migration DRE Mais1 SaaS: Multi-Tenant PostgreSQL + Supabase RLS Schema
-- Versão 1.1.0 - Segurança de RLS, RBAC, isolamento e imutabilidade de históricos

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABELAS DE ORGANIZAÇÃO, ESTRUTURA E MEMBROS (RBAC MULTI-TENANT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    slug TEXT UNIQUE NOT NULL CHECK (length(trim(slug)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_store_code_per_org UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.store_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- Referência ao auth.users(id)
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE, -- NULL significa acesso a todas as lojas da Org
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_store_membership UNIQUE (user_id, organization_id, store_id)
);

-- ============================================================================
-- 2. OPERAÇÕES FINANCEIRAS, COMPETÊNCIAS E IMPORTAÇÕES BRUTAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL CHECK (year_month ~ '^[1-2][0-9][0-9][0-9]-[0-1][0-9]$'),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IMPORTADO', 'PENDENTE', 'PRONTO', 'FECHADO', 'DIVERGENTE')),
    closed_at TIMESTAMPTZ,
    closed_by UUID,
    reopened_at TIMESTAMPTZ,
    reopened_by UUID,
    reopen_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_period_per_store UNIQUE (store_id, year_month)
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
    category_name TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_external_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    external_code TEXT NOT NULL CHECK (length(trim(external_code)) > 0),
    managerial_category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_external_code_per_store UNIQUE (store_id, external_code)
);

CREATE TABLE IF NOT EXISTS public.imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('PRODUCTS', 'PAYMENTS')),
    filename TEXT NOT NULL,
    file_sha256 CHAR(64) NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    storage_path TEXT, -- Armazenamento privado
    detected_period VARCHAR(7),
    parser_version TEXT NOT NULL DEFAULT 'v1.0.0-saas',
    record_count INT NOT NULL CHECK (record_count >= 0),
    total_cents BIGINT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('VALIDADO', 'DIVERGENTE')),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_import_file_per_store UNIQUE (store_id, kind, file_sha256),
    CONSTRAINT unique_import_kind_per_period UNIQUE (store_id, period_id, kind)
);

CREATE TABLE IF NOT EXISTS public.import_product_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_id UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    source_sheet TEXT NOT NULL,
    source_row INT NOT NULL CHECK (source_row >= 1),
    raw_cells_json JSONB NOT NULL,
    external_code TEXT,
    product_name TEXT NOT NULL,
    category_name TEXT NOT NULL,
    quantity INT NOT NULL CHECK (quantity >= 0),
    value_cents BIGINT NOT NULL,
    row_type TEXT NOT NULL CHECK (row_type IN ('SALE', 'ADJUSTMENT', 'PLACEHOLDER')),
    CONSTRAINT unique_product_row UNIQUE (import_id, source_sheet, source_row)
);

CREATE TABLE IF NOT EXISTS public.import_payment_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_id UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    source_sheet TEXT NOT NULL,
    source_row INT NOT NULL CHECK (source_row >= 1),
    raw_cells_json JSONB NOT NULL,
    method_raw TEXT NOT NULL,
    method_normalized TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('STANDARD', 'MANUAL')),
    detected_period VARCHAR(7) NOT NULL,
    value_cents BIGINT NOT NULL,
    CONSTRAINT unique_payment_row UNIQUE (import_id, source_sheet, source_row)
);

-- ============================================================================
-- 3. INSUMOS, FICHAS TÉCNICAS E CUSTOS VERSIONADOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    code TEXT NOT NULL CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    base_unit TEXT NOT NULL CHECK (base_unit IN ('G', 'ML', 'UN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_ingredient_code UNIQUE (store_id, code)
);

CREATE TABLE IF NOT EXISTS public.ingredient_purchase_costs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL,
    quantity_base BIGINT NOT NULL CHECK (quantity_base > 0),
    purchase_cents BIGINT NOT NULL CHECK (purchase_cents >= 0),
    freight_cents BIGINT NOT NULL DEFAULT 0 CHECK (freight_cents >= 0),
    st_cents BIGINT NOT NULL DEFAULT 0 CHECK (st_cents >= 0),
    supplier TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_purchase_cost_per_period UNIQUE (store_id, ingredient_id, period)
);

CREATE TABLE IF NOT EXISTS public.recipe_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    period VARCHAR(7) NOT NULL,
    approved_at TIMESTAMPTZ,
    approved_by UUID,
    approved_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_recipe_per_period UNIQUE (store_id, product_id, period)
);

CREATE TABLE IF NOT EXISTS public.recipe_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID NOT NULL REFERENCES public.recipe_versions(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
    quantity_milli_base BIGINT NOT NULL CHECK (quantity_milli_base > 0),
    CONSTRAINT unique_recipe_ingredient UNIQUE (recipe_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS public.sale_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    period VARCHAR(7) NOT NULL,
    price_cents BIGINT NOT NULL CHECK (price_cents > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_sale_price_per_period UNIQUE (store_id, product_id, period)
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL,
    expense_kind TEXT NOT NULL CHECK (expense_kind IN ('VARIAVEL', 'FIXA', 'TRIBUTO')),
    category TEXT NOT NULL CHECK (length(trim(category)) > 0),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
    reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.financial_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    rule_code TEXT NOT NULL CHECK (length(trim(rule_code)) > 0),
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
    category TEXT NOT NULL CHECK (category IN ('ROYALTIES', 'PAYMENT_FEE', 'PLATFORM_FEE', 'TAX_ESTIMATE', 'OTHER')),
    calculation_base TEXT NOT NULL CHECK (calculation_base IN ('NET_REVENUE', 'PAYMENT_METHOD', 'PLATFORM_SALES', 'DOCUMENTED', 'MANUAL')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_rule_code_per_store UNIQUE (store_id, rule_code)
);

CREATE TABLE IF NOT EXISTS public.financial_rule_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES public.financial_rules(id) ON DELETE CASCADE,
    effective_from VARCHAR(7) NOT NULL,
    basis_points INT NOT NULL CHECK (basis_points >= 0 AND basis_points <= 10000),
    source TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_rule_effective_from UNIQUE (rule_id, effective_from)
);

CREATE TABLE IF NOT EXISTS public.dre_workbook_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL,
    filename TEXT NOT NULL,
    file_sha256 CHAR(64) NOT NULL,
    source_month_label TEXT NOT NULL,
    revenue_cents BIGINT NOT NULL,
    confirmation TEXT NOT NULL,
    rows_json JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_dre_workbook_per_store_period UNIQUE (store_id, period)
);

-- ============================================================================
-- 4. FUNÇÕES DE SEGURANÇA E AUXILIARES RBAC (SECURITY DEFINER + SEARCH_PATH)
-- ============================================================================

-- Função para verificar se o usuário autenticado tem acesso a uma determinada loja
CREATE OR REPLACE FUNCTION public.has_store_access(target_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.store_memberships sm
        JOIN public.stores s ON s.id = target_store_id
        WHERE sm.user_id = auth.uid()
          AND sm.organization_id = s.organization_id
          AND (sm.store_id IS NULL OR sm.store_id = target_store_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Função para obter o papel (role) do usuário na loja
CREATE OR REPLACE FUNCTION public.get_user_store_role(target_store_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT sm.role INTO user_role
    FROM public.store_memberships sm
    JOIN public.stores s ON s.id = target_store_id
    WHERE sm.user_id = auth.uid()
      AND sm.organization_id = s.organization_id
      AND (sm.store_id IS NULL OR sm.store_id = target_store_id)
    ORDER BY (sm.store_id IS NOT NULL) DESC
    LIMIT 1;

    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Função para verificar se o usuário possui papéis administrativos/gerenciais
CREATE OR REPLACE FUNCTION public.has_manager_role(target_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.get_user_store_role(target_store_id) IN ('OWNER', 'ADMIN', 'MANAGER');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 5. ATIVAÇÃO DE ROW LEVEL SECURITY (RLS) E POLÍTICAS
-- ============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_external_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_product_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_payment_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_purchase_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_workbook_references ENABLE ROW LEVEL SECURITY;

-- Organizations
CREATE POLICY "Leitura de organizações autorizadas" ON public.organizations
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.store_memberships sm WHERE sm.organization_id = id AND sm.user_id = auth.uid())
    );

-- Stores
CREATE POLICY "Leitura de lojas autorizadas" ON public.stores
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.store_memberships sm WHERE sm.organization_id = organization_id AND sm.user_id = auth.uid() AND (sm.store_id IS NULL OR sm.store_id = id))
    );

-- Memberships
CREATE POLICY "Leitura de memberships do usuário" ON public.store_memberships
    FOR SELECT USING (user_id = auth.uid());

-- Periods
CREATE POLICY "SELECT em períodos" ON public.periods FOR SELECT USING (public.has_store_access(store_id));
CREATE POLICY "INSERT em períodos" ON public.periods FOR INSERT WITH CHECK (public.has_store_access(store_id));
CREATE POLICY "UPDATE em períodos" ON public.periods FOR UPDATE USING (public.has_manager_role(store_id));

-- Products & Codes
CREATE POLICY "SELECT em produtos" ON public.products FOR SELECT USING (public.has_store_access(store_id));
CREATE POLICY "INSERT/UPDATE em produtos" ON public.products FOR ALL USING (public.has_store_access(store_id));

CREATE POLICY "SELECT em códigos externos" ON public.product_external_codes FOR SELECT USING (public.has_store_access(store_id));
CREATE POLICY "INSERT/UPDATE em códigos externos" ON public.product_external_codes FOR ALL USING (public.has_store_access(store_id));

-- Imports & Row Data
CREATE POLICY "SELECT em importações" ON public.imports FOR SELECT USING (public.has_store_access(store_id));
CREATE POLICY "INSERT em importações" ON public.imports FOR INSERT WITH CHECK (public.has_store_access(store_id));

CREATE POLICY "SELECT em linhas de produtos" ON public.import_product_rows FOR SELECT USING (public.has_store_access(store_id));
CREATE POLICY "INSERT em linhas de produtos" ON public.import_product_rows FOR INSERT WITH CHECK (public.has_store_access(store_id));

CREATE POLICY "SELECT em linhas de pagamentos" ON public.import_payment_rows FOR SELECT USING (public.has_store_access(store_id));
CREATE POLICY "INSERT em linhas de pagamentos" ON public.import_payment_rows FOR INSERT WITH CHECK (public.has_store_access(store_id));

-- Ingredients & Costs
CREATE POLICY "Acesso a insumos" ON public.ingredients FOR ALL USING (public.has_store_access(store_id));
CREATE POLICY "Acesso a custos de compra" ON public.ingredient_purchase_costs FOR ALL USING (public.has_store_access(store_id));

-- Recipes & Sale Prices
CREATE POLICY "Acesso a fichas técnicas" ON public.recipe_versions FOR ALL USING (public.has_store_access(store_id));
CREATE POLICY "Acesso a linhas de ficha técnica" ON public.recipe_lines FOR ALL USING (
    EXISTS (SELECT 1 FROM public.recipe_versions rv WHERE rv.id = recipe_id AND public.has_store_access(rv.store_id))
);

CREATE POLICY "Acesso a preços de venda" ON public.sale_prices FOR ALL USING (public.has_store_access(store_id));

-- Expenses & Financial Rules
CREATE POLICY "Acesso a despesas" ON public.expenses FOR ALL USING (public.has_store_access(store_id));
CREATE POLICY "Acesso a regras financeiras" ON public.financial_rules FOR ALL USING (public.has_store_access(store_id));
CREATE POLICY "Acesso a versões de regras financeiras" ON public.financial_rule_versions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.financial_rules fr WHERE fr.id = rule_id AND public.has_store_access(fr.store_id))
);

-- DRE Workbook References
CREATE POLICY "Acesso a DRE de referência" ON public.dre_workbook_references FOR ALL USING (public.has_store_access(store_id));
