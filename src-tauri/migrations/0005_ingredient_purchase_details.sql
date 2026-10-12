-- Complementos de custo da planilha "Insumos" original.
-- Mantem os registros da migration 0004; valores legados ficam com frete/ST zero
-- e fornecedor nao informado ate revisao explicita.
ALTER TABLE ingredient_purchase_costs ADD COLUMN supplier TEXT NOT NULL DEFAULT '' CHECK(length(supplier)<=200);
ALTER TABLE ingredient_purchase_costs ADD COLUMN freight_cents INTEGER NOT NULL DEFAULT 0 CHECK(freight_cents>=0);
ALTER TABLE ingredient_purchase_costs ADD COLUMN st_cents INTEGER NOT NULL DEFAULT 0 CHECK(st_cents>=0);
