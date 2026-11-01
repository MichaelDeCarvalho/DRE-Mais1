-- DRE Mais1 / PR #5. Read-only evidence from two REAL archived September objects.
-- Financial rows below are SYNTHETIC test payloads with September reference totals,
-- NOT a reconstruction of the actual XLSX. This must NEVER persist.
-- Run ONLY as: BEGIN; <not-yet-applied migration>; <this file>; ROLLBACK;
DO $rollback_real_storage$
DECLARE
  v_store uuid := 'a90a2118-6f5e-4dc2-8548-32de70ce3c20';
  v_period uuid := 'a01f4767-6cc4-4eff-8170-0c23f6c77c4c';
  v_actor uuid;
  v_products_file jsonb; v_payments_file jsonb;
  v_products jsonb; v_payments jsonb;
  v_result jsonb; v_retry jsonb;
BEGIN
  IF (SELECT status FROM public.periods WHERE id=v_period AND store_id=v_store)<>'DRAFT'
    OR EXISTS (SELECT 1 FROM public.imports WHERE period_id=v_period)
    OR EXISTS (SELECT 1 FROM public.import_product_rows WHERE store_id=v_store)
    OR EXISTS (SELECT 1 FROM public.import_payment_rows WHERE store_id=v_store) THEN
    RAISE EXCEPTION 'Existing financial data or non-DRAFT period: abort';
  END IF;
  SELECT user_id INTO STRICT v_actor FROM public.store_memberships
   WHERE store_id IS NULL AND role='OWNER'
    AND organization_id=(SELECT organization_id FROM public.stores WHERE id=v_store);

  -- Use genuine Storage metadata previously uploaded by the authorized owner.
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='dre-mais1-report-archives'
    AND name LIKE v_store::text || '/' || v_period::text || '/%') <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two real XLSX archive objects';
  END IF;

  SELECT jsonb_build_object(
     'path',o.name,
     'sha256',split_part(split_part(o.name,'/',4),'.',1),
     'filename','produtos-set-2026.xlsx',
     'sizeBytes',(o.metadata->>'size')::bigint)
    INTO STRICT v_products_file FROM storage.objects AS o
    WHERE o.bucket_id='dre-mais1-report-archives'
      AND o.name LIKE v_store::text || '/' || v_period::text || '/PRODUCTS/%';
  SELECT jsonb_build_object(
     'path',o.name,
     'sha256',split_part(split_part(o.name,'/',4),'.',1),
     'filename','pagamentos-set-2026.xlsx',
     'sizeBytes',(o.metadata->>'size')::bigint)
    INTO STRICT v_payments_file FROM storage.objects AS o
    WHERE o.bucket_id='dre-mais1-report-archives'
      AND o.name LIKE v_store::text || '/' || v_period::text || '/PAYMENTS/%';

  -- Reference totals: 120 sales codes, 1 discount adjustment, 1 placeholder.
  -- Values are synthetic for SQL contract validation only.
  SELECT jsonb_agg(jsonb_build_object(
    'sourceSheet','Produtos','sourceRow',i+1,'rawCells',jsonb_build_array(i),
    'externalCode',CASE WHEN i<=120 THEN i::text ELSE NULL END,
    'productName',CASE WHEN i=121 THEN 'Total de Descontos e Taxas'
                        WHEN i=122 THEN 'Vendas Lançadas Manualmente'
                        ELSE 'Produto sintético ' || i END,
    'categoryName',CASE WHEN i>120 THEN 'Ajustes' ELSE 'Categoria' END,
    'quantity',CASE WHEN i<=120 THEN 1 ELSE 0 END,
    'valueCents',CASE WHEN i=1 THEN 2837070 WHEN i=121 THEN -342607 ELSE 0 END,
    'rowType',CASE WHEN i=121 THEN 'ADJUSTMENT'
                   WHEN i=122 THEN 'PLACEHOLDER' ELSE 'SALE' END
  ) ORDER BY i) INTO v_products FROM generate_series(1,122) AS i;

  SELECT jsonb_agg(jsonb_build_object(
    'sourceSheet','Pagamentos','sourceRow',i+1,
    'rawCells',jsonb_build_array('09/2026 - PIX',CASE WHEN i=1 THEN 24944.63 ELSE 0 END),
    'methodRaw','09/2026 - PIX',
    'methodNormalized','PIX','entryType','STANDARD',
    'detectedPeriod','2026-09','valueCents',CASE WHEN i=1 THEN 2494463 ELSE 0 END
  ) ORDER BY i) INTO v_payments FROM generate_series(1,9) AS i;

  v_result := public.commit_monthly_import_v1(v_actor,v_store,v_period,
    v_products_file,v_payments_file,v_products,v_payments);
  IF v_result->>'state'<>'IMPORTED'
    OR (v_result->>'productsTotalCents')::bigint<>2494463
    OR (v_result->>'paymentsTotalCents')::bigint<>2494463
    OR (v_result->>'differenceCents')::bigint<>0 THEN
    RAISE EXCEPTION 'Reference totals rejected: %',v_result;
  END IF;
  IF (SELECT count(*) FROM public.imports WHERE period_id=v_period)<>2
    OR (SELECT count(*) FROM public.import_product_rows
       WHERE import_id=(v_result->>'productImportId')::uuid)<>122
    OR (SELECT count(*) FROM public.import_payment_rows
       WHERE import_id=(v_result->>'paymentImportId')::uuid)<>9
    OR (SELECT status FROM public.periods WHERE id=v_period)<>'IMPORTADO' THEN
    RAISE EXCEPTION 'Atomic record counts or period status incorrect';
  END IF;
  v_retry := public.commit_monthly_import_v1(v_actor,v_store,v_period,
    v_products_file,v_payments_file,v_products,v_payments);
  IF v_retry->>'state'<>'ALREADY_IMPORTED' OR
     v_retry->>'productImportId' IS DISTINCT FROM v_result->>'productImportId' THEN
    RAISE EXCEPTION 'Duplicate retry created extra import';
  END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='dre-mais1-report-archives'
     AND name LIKE v_store::text || '/' || v_period::text || '/%')<>2 THEN
    RAISE EXCEPTION 'Archive objects were changed';
  END IF;
  RAISE NOTICE 'PASS: actual archived object metadata, synthetic September totals and 122+9 atomic rows (all rolled back)';
END
$rollback_real_storage$;
