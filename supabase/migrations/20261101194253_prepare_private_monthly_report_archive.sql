-- DRE Mais1 SaaS: bucket privado de relatórios mensais (sem importação SQL).
-- Migration aditiva restrita a homologação, aprovada pelo proprietário.
-- Path: <store_id>/<period_id>/PRODUCTS|PAYMENTS/<sha256>.xlsx
-- Hash e XLSX devem ser revalidados por backend confiável antes do commit financeiro.

INSERT INTO storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dre-mais1-report-archives',
  'dre-mais1-report-archives',
  false,
  20971520,
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- A migration nunca altera silenciosamente um bucket já existente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets b
    WHERE b.id = 'dre-mais1-report-archives'
      AND b.public IS FALSE
      AND b.file_size_limit = 20971520
      AND b.allowed_mime_types = ARRAY[
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]::text[]
  ) THEN
    RAISE EXCEPTION 'Bucket DRE Mais1 existe com configuracao inesperada';
  END IF;
END;
$$;

-- Upload somente para gerentes/proprietários da mesma loja, em DRAFT.
-- UPDATE/DELETE não são concedidos nesta migration: nenhum upsert ou overwrite.
CREATE POLICY "dre_archive_insert_authorized_draft"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dre-mais1-report-archives'
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[3] IN ('PRODUCTS', 'PAYMENTS')
  AND storage.filename(name) ~ '^[a-f0-9]{64}[.]xlsx$'
  AND EXISTS (
    SELECT 1 FROM public.periods p
    WHERE p.id::text = (storage.foldername(name))[2]
      AND p.store_id::text = (storage.foldername(name))[1]
      AND p.status = 'DRAFT'
      AND app_security.has_manager_role(p.store_id)
  )
);

-- Leitura somente por usuários vinculados à loja real do período.
CREATE POLICY "dre_archive_select_authorized_store"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'dre-mais1-report-archives'
  AND array_length(storage.foldername(name), 1) = 3
  AND EXISTS (
    SELECT 1 FROM public.periods p
    WHERE p.id::text = (storage.foldername(name))[2]
      AND p.store_id::text = (storage.foldername(name))[1]
      AND app_security.has_store_access(p.store_id)
  )
);

-- Não expor importações financeiras a gravação cliente.
-- A próxima etapa exige operação backend única e transacional.
REVOKE INSERT, UPDATE, DELETE
ON public.imports, public.import_product_rows, public.import_payment_rows
FROM anon, authenticated;
