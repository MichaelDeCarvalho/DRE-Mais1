-- Transação descartável: EXECUTAR SOMENTE com BEGIN; <migration>; <este arquivo>; ROLLBACK;
-- Não usa bytes reais: verifica apenas o contrato SQL e metadados de Storage.
DO $test$
DECLARE
 v_store uuid := 'a90a2118-6f5e-4dc2-8548-32de70ce3c20';
 v_period uuid := 'a01f4767-6cc4-4eff-8170-0c23f6c77c4c';
 v_actor uuid;
 v_alt_period uuid;
 v_alt_pf jsonb; v_alt_ff jsonb; v_alt_payments jsonb;
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
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
 ('dre-mais1-report-archives',v_pf->>'path',jsonb_build_object('size',1234)),
 ('dre-mais1-report-archives',v_ff->>'path',jsonb_build_object('size',456));
 BEGIN
   PERFORM public.commit_monthly_import_v1('00000000-0000-0000-0000-000000000001',
     v_store,v_period,v_pf,v_ff,v_products,v_payments);
   RAISE EXCEPTION 'Permissão não aplicada';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 -- Conferir precedência: papel OPERATOR da loja substitui OWNER da organização.
 INSERT INTO public.store_memberships(user_id,organization_id,store_id,role)
 SELECT v_actor,s.organization_id,v_store,'OPERATOR'
 FROM public.stores s WHERE s.id=v_store;
 BEGIN
   PERFORM public.commit_monthly_import_v1(v_actor,v_store,v_period,v_pf,v_ff,v_products,v_payments);
   RAISE EXCEPTION 'Operador restrito aceito indevidamente';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 DELETE FROM public.store_memberships
 WHERE user_id=v_actor AND store_id=v_store AND role='OPERATOR';

 -- Induz violação na segunda linha depois da criação de imports; subtransação
 -- do bloco EXCEPTION deve cancelar todos os registros parciais.
 BEGIN
   PERFORM public.commit_monthly_import_v1(v_actor,v_store,v_period,v_pf,v_ff,
     jsonb_build_array(v_products->0,jsonb_set(v_products->1,'{sourceRow}','2'::jsonb)),
     v_payments);
   RAISE EXCEPTION 'Falha parcial artificial não detectada';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 IF EXISTS (SELECT 1 FROM public.imports WHERE period_id=v_period)
    OR EXISTS (SELECT 1 FROM public.import_product_rows WHERE store_id=v_store)
    OR EXISTS (SELECT 1 FROM public.import_payment_rows WHERE store_id=v_store)
    OR (SELECT status FROM public.periods WHERE id=v_period)<>'DRAFT' THEN
    RAISE EXCEPTION 'Rollback atômico falhou';
 END IF;

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

 -- Divergência é registrada sem fechamento: teste em competência sintética 2026-08,
 -- também desfeita por ROLLBACK externo.
 INSERT INTO public.periods(store_id,year_month,status)
 VALUES (v_store,'2026-08','DRAFT') RETURNING id INTO v_alt_period;
 v_alt_pf := jsonb_build_object(
   'path',v_store||'/'||v_alt_period||'/PRODUCTS/'||repeat('c',64)||'.xlsx',
   'sha256',repeat('c',64),'filename','produtos-ago.xlsx','sizeBytes',1234);
 v_alt_ff := jsonb_build_object(
   'path',v_store||'/'||v_alt_period||'/PAYMENTS/'||repeat('d',64)||'.xlsx',
   'sha256',repeat('d',64),'filename','pagamentos-ago.xlsx','sizeBytes',456);
 v_alt_payments := jsonb_build_array(
   jsonb_set(jsonb_set(v_payments->0,'{detectedPeriod}','"2026-08"'::jsonb),
     '{valueCents}','700'::jsonb)
 );
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
 ('dre-mais1-report-archives',v_alt_pf->>'path',jsonb_build_object('size',1234)),
 ('dre-mais1-report-archives',v_alt_ff->>'path',jsonb_build_object('size',456));
 v_b := public.commit_monthly_import_v1(v_actor,v_store,v_alt_period,
   v_alt_pf,v_alt_ff,v_products,v_alt_payments);
 IF v_b->>'state'<>'IMPORTED_DIVERGENT' OR (v_b->>'differenceCents')::bigint<>100
    OR (SELECT status FROM public.periods WHERE id=v_alt_period)<>'DIVERGENTE' THEN
    RAISE EXCEPTION 'Divergência não sinalizada corretamente: %',v_b;
 END IF;
 IF (public.commit_monthly_import_v1(v_actor,v_store,v_alt_period,
   v_alt_pf,v_alt_ff,v_products,v_alt_payments))->>'state'<>'ALREADY_IMPORTED' THEN
   RAISE EXCEPTION 'Repetição idempotente divergente falhou';
 END IF;
 -- Mesmo com objetos existentes, um caminho divergente da competência
 -- ou SHA incorreto precisa ser rejeitado antes de qualquer commit.
 BEGIN
   PERFORM public.commit_monthly_import_v1(v_actor,v_store,v_period,
     jsonb_set(v_pf,'{sha256}','"not-a-hash"'::jsonb),
     v_ff,v_products,v_payments);
   RAISE EXCEPTION 'SHA inválido aceito';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;

 RAISE NOTICE 'PASS: permissions, atomic rows, period status, idempotency, rejection';
END $test$;
