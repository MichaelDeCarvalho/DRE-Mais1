-- Transação descartável: EXECUTAR SOMENTE com BEGIN; <migration>; <este arquivo>; ROLLBACK;
-- Não usa bytes reais: verifica apenas o contrato SQL e metadados de Storage.
DO $test$
DECLARE
 v_store uuid := 'a90a2118-6f5e-4dc2-8548-32de70ce3c20';
 v_period uuid := 'a01f4767-6cc4-4eff-8170-0c23f6c77c4c';
 v_actor uuid;
 v_pf jsonb; v_ff jsonb; v_products jsonb; v_payments jsonb;
 v_a jsonb; v_b jsonb;
BEGIN
 SELECT user_id INTO v_actor FROM public.store_memberships
 WHERE store_id IS NULL AND role='OWNER' AND organization_id=(
   SELECT organization_id FROM public.stores WHERE id=v_store
 ) LIMIT 1;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'OWNER fixture ausente'; END IF;
 IF EXISTS (SELECT 1 FROM public.imports WHERE period_id=v_period) THEN
   RAISE EXCEPTION 'Dados prévios encontrados: abortar teste';
 END IF;
 IF has_function_privilege('authenticated',
    'public.commit_monthly_import_v1(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('anon',
    'public.commit_monthly_import_v1(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role',
    'public.commit_monthly_import_v1(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'Concessões de execução incorretas';
 END IF;
 v_pf := jsonb_build_object(
   'path',v_store||'/'||v_period||'/PRODUCTS/'||repeat('a',64)||'.xlsx',
   'sha256',repeat('a',64),'filename','produtos.xlsx','sizeBytes',1234);
 v_ff := jsonb_build_object(
   'path',v_store||'/'||v_period||'/PAYMENTS/'||repeat('b',64)||'.xlsx',
   'sha256',repeat('b',64),'filename','pagamentos.xlsx','sizeBytes',456);
 v_products := jsonb_build_array(
  jsonb_build_object('sourceSheet','Produtos','sourceRow',2,'rawCells',jsonb_build_array(123,'Café','Bebidas',1,10),
   'externalCode','123','productName','Café','categoryName','Bebidas','quantity',1,'valueCents',1000,'rowType','SALE'),
  jsonb_build_object('sourceSheet','Produtos','sourceRow',3,'rawCells',jsonb_build_array(0,'Total de Descontos e Taxas','Ajustes',0,-2),
   'externalCode',null,'productName','Total de Descontos e Taxas','categoryName','Ajustes','quantity',0,'valueCents',-200,'rowType','ADJUSTMENT')
 );
 v_payments := jsonb_build_array(
  jsonb_build_object('sourceSheet','Pagamentos','sourceRow',2,'rawCells',jsonb_build_array('09/2026 - PIX',8),
  'methodRaw','09/2026 - PIX','methodNormalized','PIX','entryType','STANDARD','detectedPeriod','2026-09','valueCents',800)
 );
 INSERT INTO storage.objects(bucket_id,name) VALUES
 ('dre-mais1-report-archives',v_pf->>'path'),
 ('dre-mais1-report-archives',v_ff->>'path');
 BEGIN
   PERFORM public.commit_monthly_import_v1('00000000-0000-0000-0000-000000000001',
     v_store,v_period,v_pf,v_ff,v_products,v_payments);
   RAISE EXCEPTION 'Permissão não aplicada';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 v_a := public.commit_monthly_import_v1(v_actor,v_store,v_period,v_pf,v_ff,v_products,v_payments);
 IF v_a->>'state'<>'IMPORTED' OR (v_a->>'differenceCents')::integer<>0 THEN
   RAISE EXCEPTION 'Primeiro commit incorreto: %',v_a;
 END IF;
 IF (SELECT count(*) FROM public.import_product_rows WHERE import_id=(v_a->>'productImportId')::uuid)<>2
   OR (SELECT count(*) FROM public.import_payment_rows WHERE import_id=(v_a->>'paymentImportId')::uuid)<>1
   OR (SELECT status FROM public.periods WHERE id=v_period)<>'IMPORTADO' THEN
   RAISE EXCEPTION 'Linhas/estado inconsistentes';
 END IF;
 v_b := public.commit_monthly_import_v1(v_actor,v_store,v_period,v_pf,v_ff,v_products,v_payments);
 IF v_b->>'state'<>'ALREADY_IMPORTED' OR v_a->>'productImportId'<>v_b->>'productImportId' THEN
   RAISE EXCEPTION 'Idempotência quebrada: %',v_b;
 END IF;
 BEGIN
   PERFORM public.commit_monthly_import_v1(v_actor,v_store,v_period,v_pf,v_ff,
    v_products,jsonb_build_array(jsonb_set(v_payments->0,'{valueCents}','900'::jsonb)));
   RAISE EXCEPTION 'Troca divergente não recusada';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 RAISE NOTICE 'PASS: permissions, atomic rows, period status, idempotency, rejection';
END $test$;
