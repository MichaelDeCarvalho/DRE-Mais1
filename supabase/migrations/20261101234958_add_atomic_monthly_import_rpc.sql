-- DRE Mais1 SaaS / PR #5. NÃO APLICAR sem testes SQL transacionais e homologação Edge.
-- RPC só para backend service_role. A função é invoker, não bypass implícito de RLS.
-- O backend DEVE validar JWT, baixar bytes do Storage, conferir SHA-256 e parsear
-- os arquivos antes de chamar esta função. JSON enviado pelo navegador nunca entra aqui.
CREATE OR REPLACE FUNCTION public.commit_monthly_import_v1(
  p_actor uuid, p_store_id uuid, p_period_id uuid,
  p_product_file jsonb, p_payment_file jsonb,
  p_products jsonb, p_payments jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_period public.periods%ROWTYPE;
  v_org uuid;
  v_actual_role text;
  v_product_path text;
  v_payment_path text;
  v_product_hash text;
  v_payment_hash text;
  v_product_size bigint;
  v_payment_size bigint;
  v_product_filename text;
  v_payment_filename text;
  v_product_count integer;
  v_payment_count integer;
  v_products_total bigint;
  v_payments_total bigint;
  v_products_existing public.imports%ROWTYPE;
  v_payments_existing public.imports%ROWTYPE;
  v_product_id uuid;
  v_payment_id uuid;
  v_state text;
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL OR p_period_id IS NULL THEN
    RAISE EXCEPTION 'Identificadores ausentes' USING ERRCODE='22023';
  END IF;
  SELECT s.organization_id INTO v_org
    FROM public.stores AS s WHERE s.id = p_store_id;
  -- Escopo da loja específica prevalece sobre o papel organizacional.
  -- Deve corresponder a app_security.get_user_store_role (RLS existente).
  SELECT m.role INTO v_actual_role
    FROM public.store_memberships AS m
   WHERE m.user_id = p_actor AND m.organization_id = v_org
     AND (m.store_id IS NULL OR m.store_id = p_store_id)
   ORDER BY (m.store_id IS NOT NULL) DESC LIMIT 1;
  IF v_org IS NULL OR v_actual_role IS NULL
    OR v_actual_role NOT IN ('OWNER','ADMIN','MANAGER') THEN
    RAISE EXCEPTION 'Acesso gerencial negado' USING ERRCODE='42501';
  END IF;

  -- SERIALIZA as importações concorrentes da mesma competência.
  SELECT * INTO v_period
    FROM public.periods WHERE id = p_period_id AND store_id = p_store_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência inexistente ou de outra loja' USING ERRCODE='42501';
  END IF;

  IF jsonb_typeof(p_product_file) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payment_file) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_products) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Formato de payload inválido' USING ERRCODE='22023';
  END IF;

  v_product_path := p_product_file->>'path';
  v_payment_path := p_payment_file->>'path';
  v_product_hash := p_product_file->>'sha256';
  v_payment_hash := p_payment_file->>'sha256';
  v_product_filename := p_product_file->>'filename';
  v_payment_filename := p_payment_file->>'filename';
  v_product_size := (p_product_file->>'sizeBytes')::bigint;
  v_payment_size := (p_payment_file->>'sizeBytes')::bigint;
  v_product_count := jsonb_array_length(p_products);
  v_payment_count := jsonb_array_length(p_payments);
  IF v_product_count NOT BETWEEN 1 AND 50000
     OR v_payment_count NOT BETWEEN 1 AND 50000 THEN
    RAISE EXCEPTION 'Quantidade inválida de linhas' USING ERRCODE='22023';
  END IF;

  IF v_product_hash !~ '^[a-f0-9]{64}$' OR v_payment_hash !~ '^[a-f0-9]{64}$'
     OR v_product_path IS DISTINCT FROM
       (p_store_id::text || '/' || p_period_id::text || '/PRODUCTS/' || v_product_hash || '.xlsx')
     OR v_payment_path IS DISTINCT FROM
       (p_store_id::text || '/' || p_period_id::text || '/PAYMENTS/' || v_payment_hash || '.xlsx')
     OR v_product_filename !~* '^[^/\\]{1,250}\.xlsx$'
     OR v_payment_filename !~* '^[^/\\]{1,250}\.xlsx$'
     OR v_product_size NOT BETWEEN 1 AND 20971520
     OR v_payment_size NOT BETWEEN 1 AND 20971520 THEN
    RAISE EXCEPTION 'Metadados dos arquivos inválidos' USING ERRCODE='22023';
  END IF;
  -- Além do caminho/hash, exija tamanho idêntico aos bytes registrados
  -- pelo serviço Storage. O hash dos bytes é conferido previamente pela Edge.
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'dre-mais1-report-archives'
      AND name = v_product_path
      AND (metadata->>'size')::bigint = v_product_size
  ) OR NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'dre-mais1-report-archives'
      AND name = v_payment_path
      AND (metadata->>'size')::bigint = v_payment_size
  ) THEN
    RAISE EXCEPTION 'Arquivos originais ausentes do Storage ou tamanho divergente'
      USING ERRCODE='22023';
  END IF;

  IF EXISTS (
     SELECT 1 FROM jsonb_array_elements(p_products) AS x
      WHERE jsonb_typeof(x) <> 'object'
         OR jsonb_typeof(x->'rawCells') <> 'array'
         OR nullif(x->>'sourceSheet','') IS NULL
         OR nullif(x->>'productName','') IS NULL
         OR nullif(x->>'categoryName','') IS NULL
         OR x->>'rowType' NOT IN ('SALE','ADJUSTMENT','PLACEHOLDER')
         OR jsonb_typeof(x->'sourceRow') IS DISTINCT FROM 'number'
         OR jsonb_typeof(x->'quantity') IS DISTINCT FROM 'number'
         OR jsonb_typeof(x->'valueCents') IS DISTINCT FROM 'number'
         OR (x->>'rowType'='SALE' AND nullif(x->>'externalCode','') IS NULL)
         OR (x->>'rowType'<>'SALE' AND nullif(x->>'externalCode','') IS NOT NULL)
         OR (x->>'sourceRow')::integer < 1
         OR (x->>'quantity')::integer < 0
         OR (x->>'rowType'='SALE' AND (x->>'valueCents')::bigint < 0)
         OR (x->>'rowType'='ADJUSTMENT' AND (x->>'valueCents')::bigint > 0)
         OR (x->>'rowType'='PLACEHOLDER' AND
            ((x->>'valueCents')::bigint <> 0 OR (x->>'quantity')::integer <> 0))
  ) OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(p_payments) AS x
      WHERE jsonb_typeof(x) <> 'object'
        OR jsonb_typeof(x->'rawCells') <> 'array'
        OR nullif(x->>'sourceSheet','') IS NULL
        OR nullif(x->>'methodRaw','') IS NULL
        OR nullif(x->>'methodNormalized','') IS NULL
        OR x->>'entryType' NOT IN ('STANDARD','MANUAL')
        OR x->>'methodNormalized' NOT IN
          ('CREDIT','DEBIT','PIX','DIGITAL_WALLET','OTHER','CASH','VOUCHER')
        OR (x->>'entryType'='MANUAL' AND x->>'methodNormalized' NOT IN ('CREDIT','DEBIT'))
        OR x->>'detectedPeriod' IS DISTINCT FROM v_period.year_month
        OR jsonb_typeof(x->'sourceRow') IS DISTINCT FROM 'number'
        OR jsonb_typeof(x->'valueCents') IS DISTINCT FROM 'number'
        OR (x->>'sourceRow')::integer < 1
        OR (x->>'valueCents')::bigint < 0
  ) THEN
    RAISE EXCEPTION 'Linhas de relatório inválidas' USING ERRCODE='22023';
  END IF;

  SELECT coalesce(sum((x->>'valueCents')::bigint),0) INTO v_products_total
    FROM jsonb_array_elements(p_products) AS x;
  SELECT coalesce(sum((x->>'valueCents')::bigint),0) INTO v_payments_total
    FROM jsonb_array_elements(p_payments) AS x;
  IF v_products_total IS NULL OR v_payments_total IS NULL THEN
    RAISE EXCEPTION 'Valor monetário inválido' USING ERRCODE='22023';
  END IF;
  v_state := CASE WHEN v_products_total = v_payments_total
                  THEN 'VALIDADO' ELSE 'DIVERGENTE' END;

  -- Não permitir troca de relatórios após a primeira gravação.
  SELECT * INTO v_products_existing FROM public.imports
    WHERE period_id = p_period_id AND store_id = p_store_id AND kind = 'PRODUCTS';
  SELECT * INTO v_payments_existing FROM public.imports
    WHERE period_id = p_period_id AND store_id = p_store_id AND kind = 'PAYMENTS';
  IF v_products_existing.id IS NOT NULL OR v_payments_existing.id IS NOT NULL THEN
    IF v_products_existing.id IS NOT NULL AND v_payments_existing.id IS NOT NULL
       AND v_products_existing.file_sha256 = v_product_hash
       AND v_payments_existing.file_sha256 = v_payment_hash
       AND v_products_existing.storage_path = v_product_path
       AND v_payments_existing.storage_path = v_payment_path
       AND v_products_existing.record_count = v_product_count
       AND v_payments_existing.record_count = v_payment_count
       AND v_products_existing.total_cents = v_products_total
       AND v_payments_existing.total_cents = v_payments_total
       AND v_products_existing.status = v_state
       AND v_payments_existing.status = v_state
       AND v_period.status = (CASE WHEN v_state = 'VALIDADO' THEN 'IMPORTADO' ELSE 'DIVERGENTE' END)
    THEN
      RETURN jsonb_build_object(
        'state','ALREADY_IMPORTED','periodId',p_period_id,
        'productImportId',v_products_existing.id,
        'paymentImportId',v_payments_existing.id,
        'productsTotalCents',v_products_total,
        'paymentsTotalCents',v_payments_total,
        'differenceCents',v_products_total-v_payments_total
      );
    END IF;
    RAISE EXCEPTION 'Competência já possui importação distinta/incompleta' USING ERRCODE='23505';
  END IF;
  IF v_period.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Competência não está em DRAFT' USING ERRCODE='55000';
  END IF;

  -- Uma invocação RPC = uma transação PostgreSQL; exceções revertem todos os INSERTs.
  INSERT INTO public.imports(
    store_id,period_id,kind,filename,file_sha256,file_size_bytes,
    storage_path,detected_period,parser_version,record_count,total_cents,status
  ) VALUES (
    p_store_id,p_period_id,'PRODUCTS',v_product_filename,v_product_hash,v_product_size,
    v_product_path,v_period.year_month,'v1.1.0-authoritative',v_product_count,v_products_total,v_state
  ) RETURNING id INTO v_product_id;

  INSERT INTO public.imports(
    store_id,period_id,kind,filename,file_sha256,file_size_bytes,
    storage_path,detected_period,parser_version,record_count,total_cents,status
  ) VALUES (
    p_store_id,p_period_id,'PAYMENTS',v_payment_filename,v_payment_hash,v_payment_size,
    v_payment_path,v_period.year_month,'v1.1.0-authoritative',v_payment_count,v_payments_total,v_state
  ) RETURNING id INTO v_payment_id;

  INSERT INTO public.import_product_rows(
    import_id,store_id,source_sheet,source_row,raw_cells_json,
    external_code,product_name,category_name,quantity,value_cents,row_type
  ) SELECT
    v_product_id,p_store_id,x->>'sourceSheet',(x->>'sourceRow')::integer,x->'rawCells',
    x->>'externalCode',x->>'productName',x->>'categoryName',
    (x->>'quantity')::integer,(x->>'valueCents')::bigint,x->>'rowType'
  FROM jsonb_array_elements(p_products) AS x;

  INSERT INTO public.import_payment_rows(
    import_id,store_id,source_sheet,source_row,raw_cells_json,
    method_raw,method_normalized,entry_type,detected_period,value_cents
  ) SELECT
    v_payment_id,p_store_id,x->>'sourceSheet',(x->>'sourceRow')::integer,x->'rawCells',
    x->>'methodRaw',x->>'methodNormalized',x->>'entryType',
    x->>'detectedPeriod',(x->>'valueCents')::bigint
  FROM jsonb_array_elements(p_payments) AS x;

  UPDATE public.periods SET status = CASE WHEN v_state='VALIDADO'
    THEN 'IMPORTADO' ELSE 'DIVERGENTE' END
  WHERE id = p_period_id AND store_id = p_store_id AND status = 'DRAFT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência alterada durante importação' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object(
    'state',CASE WHEN v_state='VALIDADO' THEN 'IMPORTED' ELSE 'IMPORTED_DIVERGENT' END,
    'periodId',p_period_id,'productImportId',v_product_id,'paymentImportId',v_payment_id,
    'productsTotalCents',v_products_total,'paymentsTotalCents',v_payments_total,
    'differenceCents',v_products_total-v_payments_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_monthly_import_v1(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_monthly_import_v1(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb
) TO service_role;

COMMENT ON FUNCTION public.commit_monthly_import_v1(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)
IS 'Privileged backend-only atomic import; Edge validates original Storage bytes and JWT before RPC.';
