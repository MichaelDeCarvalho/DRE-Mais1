-- Suite de Testes de Integração RLS para Supabase PostgreSQL (Etapa B)
-- Valida isolamento entre dois tenants (Org A e Org B) e permissões por papel (OWNER, ADMIN, MANAGER, OPERATOR)

BEGIN;

-- 1. Setup de fixtures para Testes de Isolamento Multi-Tenant
-- Identidades de teste reais no auth.users, revertidas no ROLLBACK.
-- Necessarias após FK store_memberships.user_id -> auth.users.id.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
 ('a0000000-0000-0000-0000-000000000001','authenticated','authenticated','rls-qa-alpha@example.invalid','',now(),now()),
 ('b0000000-0000-0000-0000-000000000001','authenticated','authenticated','rls-qa-beta@example.invalid','',now(),now());

INSERT INTO public.organizations (id, name, slug)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Organização Alpha (Loja 1)', 'org-alpha'),
  ('22222222-2222-2222-2222-222222222222', 'Organização Beta (Loja 2)', 'org-beta')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stores (id, organization_id, code, display_name)
VALUES 
  ('11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111', 'LOJA_ALPHA', 'Loja Alpha - SJP'),
  ('22222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222222', 'LOJA_BETA', 'Loja Beta - CWB')
ON CONFLICT (id) DO NOTHING;

-- Memberships para Usuário Alpha (Manager da Loja Alpha) e Usuário Beta (Operator da Loja Beta)
INSERT INTO public.store_memberships (id, user_id, organization_id, store_id, role)
VALUES
  ('11111111-1111-1111-1111-111111111102', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111101', 'MANAGER'),
  ('22222222-2222-2222-2222-222222222202', 'b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222201', 'OPERATOR')
ON CONFLICT (id) DO NOTHING;

-- 2. Teste: Usuário sem Autenticação (auth.uid() IS NULL) -> Deve retornar 0 registros
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '';

DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM public.periods;
    IF cnt > 0 THEN
        RAISE EXCEPTION 'FALHA DE RLS: Usuário não autenticado visualizou registros!';
    END IF;
END $$;

-- 3. Teste: Usuário Alpha (MANAGER da Loja Alpha) -> Deve visualizar apenas períodos da Loja Alpha
SET LOCAL "request.jwt.claim.sub" TO 'a0000000-0000-0000-0000-000000000001';

INSERT INTO public.periods (id, store_id, year_month, status)
VALUES ('11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111101', '2026-09', 'DRAFT')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM public.periods WHERE store_id = '11111111-1111-1111-1111-111111111101';
    IF cnt <> 1 THEN
        RAISE EXCEPTION 'FALHA DE RLS: Usuário MANAGER não conseguiu ler a própria competência!';
    END IF;
END $$;

-- 4. Teste: Usuário Beta (OPERATOR da Loja Beta) -> Tenta LER a competência da Loja Alpha (Deve retornar 0 registros)
SET LOCAL "request.jwt.claim.sub" TO 'b0000000-0000-0000-0000-000000000001';

DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM public.periods WHERE store_id = '11111111-1111-1111-1111-111111111101';
    IF cnt > 0 THEN
        RAISE EXCEPTION 'FALHA DE ISOLAMENTO MULTI-TENANT: Usuário Beta visualizou dados da Loja Alpha!';
    END IF;
END $$;

-- 5. Teste: Usuário Beta (OPERATOR da Loja Beta) -> Tenta INSERIR competência na Loja Beta (Deve ser BLOQUEADO por RLS, exige MANAGER/ADMIN)
DO $$
BEGIN
    BEGIN
        INSERT INTO public.periods (store_id, year_month, status)
        VALUES ('22222222-2222-2222-2222-222222222201', '2026-09', 'DRAFT');
        RAISE EXCEPTION 'FALHA DE RLS: Papel OPERATOR conseguiu criar competência sem permissão!';
    EXCEPTION WHEN insufficient_privilege THEN
        -- Sucesso esperado: OPERATOR bloqueado por RLS
        NULL;
    END;
END $$;

ROLLBACK;
