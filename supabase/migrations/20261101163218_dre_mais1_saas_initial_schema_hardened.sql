-- Migration DRE Mais1 SaaS: Multi-Tenant PostgreSQL + Supabase RLS Schema
-- Versão 1.3.0 - Schema privado app_security, controle de EXECUTE, RLS anti-recursivo e validação estrita YYYY-MM

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schema privado de segurança (não exposto à REST Data API do Supabase)
CREATE SCHEMA IF NOT EXISTS app_security;

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
    user_id UUID NOT NULL, -- Referência ao auth.users(id) do Supabase
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE, -- NULL significa acesso a todas as lojas da Org
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_store_membership UNIQUE (user_id, organization_id, store_id)
);

-- Garantir unicidade de memberships para toda a organização (store_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS unique_org_membership_all_stores 
ON public.store_memberships(user_id, organization_id) 
WHERE store_id IS NULL;

-- ============================================================================
-- 2. OPERAÇÕES FINANCEIRAS, COMPETÊNCIAS E IMPORTAÇÕES BRUTAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL CHECK (year_month ~ '^[1-2][0-9][0-9][0-9]-(0[1-9]|1[0-2])$'),
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
    storage_path TEXT,
    detected_period VARCHAR(7) CHECK (detected_period IS NULL OR detected_period ~ '^[1-2][0-9][0-9][0-9]-(0[1-9]|1[0-2])$'),
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
    detected_period VARCHAR(7) NOT NULL CHECK (detected_period ~ '^[1-2][0-9][0-9][0-9]-(0[1-9]|1[0-2])$'),
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
    period VARCHAR(7) NOT NULL CHECK (period ~ '^[1-2][0-9][0-9][0-9]-(0[1-9]|1[0-2])$'),
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
    period VARCHAR(7) NOT NULL CHECK (period ~ '^[1-2][0-9][0-9][0-9]-(0[1-9]|1[0-2])$'),
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
    period VARCHAR(7) NOT NULL CHECK (period ~ '^[1-2][0-9][0-9][0-9]-(0[1-9]|1[0-2])$'),
    price_cents BIGINT NOT NULL CHECK (price_cents > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_sale_price_per_period UNIQUE (store_id, product_id, period)
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL CHECK (period ~ '^[1-2][0-9][0-9][0-9]-(0[1-9]|1[0-2])$'),
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
    effective_from VARCHAR(7) NOT NULL CHECK (effective_from ~ '^[1-2][0-9][0-9][0-9]-(0[1-9]|1[0-2])$'),
    basis_points INT NOT NULL CHECK (basis_points >= 0 AND basis_points <= 10000),
    source TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_rule_effective_from UNIQUE (rule_id, effective_from)
);

CREATE TABLE IF NOT EXISTS public.dre_workbook_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL CHECK (period ~ '^[1-2][0-9][0-9][0-9]-(0[1-9]|1[0-2])$'),
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
-- 4. FUNÇÕES DE SEGURANÇA E AUXILIARES RBAC NO SCHEMA PRIVADO `app_security`
-- ============================================================================

-- Função para verificar acesso à loja sem causar recursão RLS
CREATE OR REPLACE FUNCTION app_security.has_store_access(target_store_id UUID)
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

-- Função para obter papel do usuário na loja
CREATE OR REPLACE FUNCTION app_security.get_user_store_role(target_store_id UUID)
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

-- Função para verificar papel gerencial (OWNER, ADMIN, MANAGER)
CREATE OR REPLACE FUNCTION app_security.has_manager_role(target_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN app_security.get_user_store_role(target_store_id) IN ('OWNER', 'ADMIN', 'MANAGER');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Função para verificar papel de administração (OWNER, ADMIN)
CREATE OR REPLACE FUNCTION app_security.has_admin_role(target_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN app_security.get_user_store_role(target_store_id) IN ('OWNER', 'ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Procedimento seguro de bootstrap administrativo para primeira organização/loja
CREATE OR REPLACE FUNCTION app_security.bootstrap_organization(
    org_name TEXT,
    org_slug TEXT,
    store_code TEXT,
    store_display_name TEXT,
    owner_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    new_org_id UUID;
    new_store_id UUID;
BEGIN
    INSERT INTO public.organizations (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO new_org_id;

    INSERT INTO public.stores (organization_id, code, display_name)
    VALUES (new_org_id, store_code, store_display_name)
    RETURNING id INTO new_store_id;

    INSERT INTO public.store_memberships (user_id, organization_id, store_id, role)
    VALUES (owner_user_id, new_org_id, NULL, 'OWNER');

    RETURN jsonb_build_object(
        'organization_id', new_org_id,
        'store_id', new_store_id,
        'owner_user_id', owner_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Restringir privilégios EXECUTE no schema privado
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_security FROM PUBLIC;
GRANT USAGE ON SCHEMA app_security TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_security.has_store_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_security.get_user_store_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_security.has_manager_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_security.has_admin_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_security.bootstrap_organization(TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

-- ============================================================================
-- 5. ATIVAÇÃO DE ROW LEVEL SECURITY (RLS) E POLÍTICAS EXPLÍCITAS
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
CREATE POLICY "org_select" ON public.organizations FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.store_memberships sm WHERE sm.organization_id = id AND sm.user_id = auth.uid())
);

-- Stores
CREATE POLICY "stores_select" ON public.stores FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.store_memberships sm WHERE sm.organization_id = organization_id AND sm.user_id = auth.uid() AND (sm.store_id IS NULL OR sm.store_id = id))
);

-- Memberships
CREATE POLICY "memberships_select" ON public.store_memberships FOR SELECT USING (
    user_id = auth.uid() OR app_security.has_admin_role(store_id)
);

-- Periods
CREATE POLICY "periods_select" ON public.periods FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "periods_insert" ON public.periods FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "periods_update" ON public.periods FOR UPDATE USING (app_security.has_manager_role(store_id));
CREATE POLICY "periods_delete" ON public.periods FOR DELETE USING (app_security.has_admin_role(store_id));

-- Products & External Codes
CREATE POLICY "products_select" ON public.products FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "products_insert" ON public.products FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "products_update" ON public.products FOR UPDATE USING (app_security.has_manager_role(store_id));
CREATE POLICY "products_delete" ON public.products FOR DELETE USING (app_security.has_admin_role(store_id));

CREATE POLICY "codes_select" ON public.product_external_codes FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "codes_insert" ON public.product_external_codes FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "codes_update" ON public.product_external_codes FOR UPDATE USING (app_security.has_manager_role(store_id));
CREATE POLICY "codes_delete" ON public.product_external_codes FOR DELETE USING (app_security.has_admin_role(store_id));

-- Imports & Row Data
CREATE POLICY "imports_select" ON public.imports FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "imports_insert" ON public.imports FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "imports_update" ON public.imports FOR UPDATE USING (app_security.has_admin_role(store_id));
CREATE POLICY "imports_delete" ON public.imports FOR DELETE USING (app_security.has_admin_role(store_id));

CREATE POLICY "prod_rows_select" ON public.import_product_rows FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "prod_rows_insert" ON public.import_product_rows FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "prod_rows_delete" ON public.import_product_rows FOR DELETE USING (app_security.has_admin_role(store_id));

CREATE POLICY "pay_rows_select" ON public.import_payment_rows FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "pay_rows_insert" ON public.import_payment_rows FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "pay_rows_delete" ON public.import_payment_rows FOR DELETE USING (app_security.has_admin_role(store_id));

-- Ingredients & Costs
CREATE POLICY "ingredients_select" ON public.ingredients FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "ingredients_insert" ON public.ingredients FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "ingredients_update" ON public.ingredients FOR UPDATE USING (app_security.has_manager_role(store_id));
CREATE POLICY "ingredients_delete" ON public.ingredients FOR DELETE USING (app_security.has_admin_role(store_id));

CREATE POLICY "costs_select" ON public.ingredient_purchase_costs FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "costs_insert" ON public.ingredient_purchase_costs FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "costs_update" ON public.ingredient_purchase_costs FOR UPDATE USING (app_security.has_manager_role(store_id));
CREATE POLICY "costs_delete" ON public.ingredient_purchase_costs FOR DELETE USING (app_security.has_admin_role(store_id));

-- Recipes & Sale Prices
CREATE POLICY "recipe_select" ON public.recipe_versions FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "recipe_insert" ON public.recipe_versions FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "recipe_update" ON public.recipe_versions FOR UPDATE USING (app_security.has_manager_role(store_id));
CREATE POLICY "recipe_delete" ON public.recipe_versions FOR DELETE USING (app_security.has_admin_role(store_id));

CREATE POLICY "recipe_lines_select" ON public.recipe_lines FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.recipe_versions rv WHERE rv.id = recipe_id AND app_security.has_store_access(rv.store_id))
);
CREATE POLICY "recipe_lines_insert" ON public.recipe_lines FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.recipe_versions rv WHERE rv.id = recipe_id AND app_security.has_manager_role(rv.store_id))
);
CREATE POLICY "recipe_lines_delete" ON public.recipe_lines FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.recipe_versions rv WHERE rv.id = recipe_id AND app_security.has_admin_role(rv.store_id))
);

CREATE POLICY "prices_select" ON public.sale_prices FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "prices_insert" ON public.sale_prices FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "prices_update" ON public.sale_prices FOR UPDATE USING (app_security.has_manager_role(store_id));
CREATE POLICY "prices_delete" ON public.sale_prices FOR DELETE USING (app_security.has_admin_role(store_id));

-- Expenses & Financial Rules
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (app_security.has_manager_role(store_id));
CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE USING (app_security.has_admin_role(store_id));

CREATE POLICY "rules_select" ON public.financial_rules FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "rules_insert" ON public.financial_rules FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "rules_update" ON public.financial_rules FOR UPDATE USING (app_security.has_manager_role(store_id));
CREATE POLICY "rules_delete" ON public.financial_rules FOR DELETE USING (app_security.has_admin_role(store_id));

CREATE POLICY "rule_versions_select" ON public.financial_rule_versions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.financial_rules fr WHERE fr.id = rule_id AND app_security.has_store_access(fr.store_id))
);
CREATE POLICY "rule_versions_insert" ON public.financial_rule_versions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.financial_rules fr WHERE fr.id = rule_id AND app_security.has_manager_role(fr.store_id))
);
CREATE POLICY "rule_versions_delete" ON public.financial_rule_versions FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.financial_rules fr WHERE fr.id = rule_id AND app_security.has_admin_role(fr.store_id))
);

-- DRE Workbook References
CREATE POLICY "dre_ref_select" ON public.dre_workbook_references FOR SELECT USING (app_security.has_store_access(store_id));
CREATE POLICY "dre_ref_insert" ON public.dre_workbook_references FOR INSERT WITH CHECK (app_security.has_manager_role(store_id));
CREATE POLICY "dre_ref_delete" ON public.dre_workbook_references FOR DELETE USING (app_security.has_admin_role(store_id));


-- ============================================================================
-- 6. HARDENING APLICADO NA HOMOLOGACAO: permissões mínimas e integridade por loja
-- ============================================================================

-- Revoga EXECUTE público sobre a função EVENT TRIGGER de RLS automático,
-- preservando a própria função e o gatilho.
REVOKE ALL PRIVILEGES ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION app_security.has_store_access(UUID) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION app_security.get_user_store_role(UUID) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION app_security.has_manager_role(UUID) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION app_security.has_admin_role(UUID) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION app_security.bootstrap_organization(TEXT, TEXT, TEXT, TEXT, UUID) SET search_path = pg_catalog, pg_temp;
REVOKE USAGE ON SCHEMA app_security FROM PUBLIC, anon;

-- Identidades devem existir no Supabase Auth.
ALTER TABLE public.store_memberships
 ADD CONSTRAINT store_memberships_auth_user_fk FOREIGN KEY (user_id)
 REFERENCES auth.users(id) ON DELETE RESTRICT;

-- FKs compostas reforçam consistência entre entidades da mesma organização/loja.
ALTER TABLE public.stores ADD CONSTRAINT stores_id_org_unique UNIQUE (id, organization_id);
ALTER TABLE public.periods ADD CONSTRAINT periods_id_store_unique UNIQUE (id, store_id);
ALTER TABLE public.products ADD CONSTRAINT products_id_store_unique UNIQUE (id, store_id);
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_id_store_unique UNIQUE (id, store_id);
ALTER TABLE public.imports ADD CONSTRAINT imports_id_store_unique UNIQUE (id, store_id);
ALTER TABLE public.recipe_versions ADD CONSTRAINT recipe_versions_id_store_unique UNIQUE (id, store_id);

ALTER TABLE public.store_memberships ADD CONSTRAINT memberships_store_org_fk
 FOREIGN KEY (store_id, organization_id) REFERENCES public.stores(id, organization_id);
ALTER TABLE public.product_external_codes ADD CONSTRAINT external_codes_product_store_fk
 FOREIGN KEY (product_id, store_id) REFERENCES public.products(id, store_id);
ALTER TABLE public.imports ADD CONSTRAINT imports_period_store_fk
 FOREIGN KEY (period_id, store_id) REFERENCES public.periods(id, store_id);
ALTER TABLE public.import_product_rows ADD CONSTRAINT import_product_rows_import_store_fk
 FOREIGN KEY (import_id, store_id) REFERENCES public.imports(id, store_id);
ALTER TABLE public.import_payment_rows ADD CONSTRAINT import_payment_rows_import_store_fk
 FOREIGN KEY (import_id, store_id) REFERENCES public.imports(id, store_id);
ALTER TABLE public.ingredient_purchase_costs ADD CONSTRAINT ingredient_cost_store_fk
 FOREIGN KEY (ingredient_id, store_id) REFERENCES public.ingredients(id, store_id);
ALTER TABLE public.recipe_versions ADD CONSTRAINT recipe_product_store_fk
 FOREIGN KEY (product_id, store_id) REFERENCES public.products(id, store_id);
ALTER TABLE public.sale_prices ADD CONSTRAINT sale_price_product_store_fk
 FOREIGN KEY (product_id, store_id) REFERENCES public.products(id, store_id);
ALTER TABLE public.recipe_lines ADD COLUMN store_id UUID NOT NULL;
ALTER TABLE public.recipe_lines ADD CONSTRAINT recipe_lines_recipe_store_fk
 FOREIGN KEY (recipe_id, store_id) REFERENCES public.recipe_versions(id, store_id);
ALTER TABLE public.recipe_lines ADD CONSTRAINT recipe_lines_ingredient_store_fk
 FOREIGN KEY (ingredient_id, store_id) REFERENCES public.ingredients(id, store_id);

-- Fechamentos e históricos devem ter retificação controlada, não DELETE direto.
DROP POLICY IF EXISTS "periods_delete" ON public.periods;
DROP POLICY IF EXISTS "imports_delete" ON public.imports;
DROP POLICY IF EXISTS "prod_rows_delete" ON public.import_product_rows;
DROP POLICY IF EXISTS "pay_rows_delete" ON public.import_payment_rows;
DROP POLICY IF EXISTS "dre_ref_delete" ON public.dre_workbook_references;
DROP POLICY IF EXISTS "rule_versions_delete" ON public.financial_rule_versions;

DROP POLICY IF EXISTS "periods_insert" ON public.periods;
CREATE POLICY "periods_insert" ON public.periods FOR INSERT TO authenticated
 WITH CHECK (app_security.has_manager_role(store_id)
 AND status = 'DRAFT' AND closed_at IS NULL AND closed_by IS NULL
 AND reopened_at IS NULL AND reopened_by IS NULL AND reopen_reason IS NULL);
DROP POLICY IF EXISTS "periods_update" ON public.periods;
CREATE POLICY "periods_update" ON public.periods FOR UPDATE TO authenticated
 USING (app_security.has_manager_role(store_id) AND status = 'DRAFT')
 WITH CHECK (app_security.has_manager_role(store_id) AND status = 'DRAFT');

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
 REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_security
 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Acesso opt-in para a primeira operação SaaS: autenticação e competências.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON public.organizations, public.stores, public.store_memberships, public.periods TO authenticated;
GRANT INSERT ON public.periods TO authenticated;
