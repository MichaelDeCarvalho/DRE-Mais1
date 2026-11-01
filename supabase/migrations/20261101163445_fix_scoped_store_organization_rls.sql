-- Correção executada em homologação após teste RLS no papel authenticated.
-- Na policy de stores, campos externos precisam de qualificação para evitar que
-- 'id' resolva para store_memberships.id e bloqueie a leitura da loja.
DROP POLICY IF EXISTS "org_select" ON public.organizations;
CREATE POLICY "org_select" ON public.organizations
 FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.store_memberships sm
   WHERE sm.organization_id = organizations.id
     AND sm.user_id = auth.uid()
 ));

DROP POLICY IF EXISTS "stores_select" ON public.stores;
CREATE POLICY "stores_select" ON public.stores
 FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.store_memberships sm
   WHERE sm.organization_id = stores.organization_id
     AND sm.user_id = auth.uid()
     AND (sm.store_id IS NULL OR sm.store_id = stores.id)
 ));
