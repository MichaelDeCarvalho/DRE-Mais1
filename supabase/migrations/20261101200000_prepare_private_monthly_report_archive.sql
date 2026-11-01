-- DRE Mais1 — preparação de arquivo original para importação SaaS
-- Esta migration NÃO habilita importação financeira, NÃO altera competências
-- e NÃO concede acesso direto de escrita às tabelas imports/import_*_rows.
-- Aplicar apenas após aprovação explícita e teste isolado de RLS.
--
-- Objetivo:
-- 1) arquivar os dois XLSX em bucket privado;
-- 2) permitir upload somente ao gerente/administrador da loja com período DRAFT;
-- 3) permitir leitura somente a membros autorizados da loja;
-- 4) preservar arquivos sem UPDATE, DELETE ou upsert pelo cliente;
-- 5) preparar nomenclatura determinística para um commit transacional futuro.
--
-- Caminho esperado: <store_uuid>/<period_uuid>/PRODUCTS/<sha256>.xlsx
--                 ou <store_uuid>/<period_uuid>/PAYMENTS/<sha256>.xlsx
-- Hash SHA-256 e parsing devem ser recalculados no serviço de importação
-- confiável ANTES de registrar arquivos/linhas em public.imports.
--
-- Não expor a chave service_role no React.

INSERT INTO storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('dre-mais1-report-archives',
   'dre-mais1-report-archives',
   false,
   20971520,
   ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[])
ON CONFLICT (id) DO NOTHING;

-- Nunca reconfigurar um bucket preexistente silenciosamente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'dre-mais1-report-archives'
      AND public = false
      AND file_size_limit = 20971520
      AND allowed_mime_types @> ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
  ) THEN
    RAISE EXCEPTION 'O bucket de importação já existe com configuração incompatível';
  END IF;
END;
$$;

-- Evitar políticas abertas. Nenhum UPDATE/DELETE: arquivos são imutáveis
-- no fluxo do cliente; retenção/limpeza eventual precisa de rotina auditada.
CREATE POLICY "dre_archive_insert_authorized_draft"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dre-mais1-report-archives'
  AND (storage.foldername(name))[3] IN ('PRODUCTS','PAYMENTS')
  AND (storage.filename(name)) ~ '^[a-f0-9]{64}[.]xlsx
  AND array_length(storage.foldername(name),1) = 3
  AND EXISTS (
    SELECT 1 FROM public.periods p
    WHERE p.store_id::text = (storage.foldername(name))[1]
      AND p.id::text = (storage.foldername(name))[2]
      AND p.status = 'DRAFT'
      AND app_security.has_manager_role(p.store_id)
  )
);

CREATE POLICY "dre_archive_select_authorized_store"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'dre-mais1-report-archives'
  AND EXISTS (
    SELECT 1 FROM public.periods p
    WHERE p.store_id::text = (storage.foldername(name))[1]
      AND p.id::text = (storage.foldername(name))[2]
      AND app_security.has_store_access(p.store_id)
  )
);

-- Por enquanto, importações financeiras não são graváveis diretamente
-- pela Data API: a futura função server-side deve validar em uma única
-- transação os dados dos dois XLSX e toda a conciliação.
REVOKE INSERT, UPDATE, DELETE ON
  public.imports,
  public.import_product_rows,
  public.import_payment_rows
FROM anon, authenticated;

  AND array_length(storage.foldername(name),1) = 3
  AND EXISTS (
    SELECT 1 FROM public.periods p
    WHERE p.store_id::text = (storage.foldername(name))[1]
      AND p.id::text = (storage.foldername(name))[2]
      AND p.status = 'DRAFT'
      AND app_security.has_manager_role(p.store_id)
  )
);

CREATE POLICY "dre_archive_select_authorized_store"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'dre-mais1-report-archives'
  AND EXISTS (
    SELECT 1 FROM public.periods p
    WHERE p.store_id::text = (storage.foldername(name))[1]
      AND p.id::text = (storage.foldername(name))[2]
      AND app_security.has_store_access(p.store_id)
  )
);

-- Por enquanto, importações financeiras não são graváveis diretamente
-- pela Data API: a futura função server-side deve validar em uma única
-- transação os dados dos dois XLSX e toda a conciliação.
REVOKE INSERT, UPDATE, DELETE ON
  public.imports,
  public.import_product_rows,
  public.import_payment_rows
FROM anon, authenticated;
