-- Marco 2: cadastramento manual auditavel dos codigos vendidos pendentes.
-- Nao altera relatorios originais, nem valores financeiros, nem catalogo legado.
CREATE TABLE product_mapping_decisions (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  period_id INTEGER NOT NULL REFERENCES periods(id),
  external_code TEXT NOT NULL CHECK(length(trim(external_code)) > 0),
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  decision_type TEXT NOT NULL CHECK(decision_type IN ('CREATE_PRODUCT')),
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) > 0),
  managerial_category TEXT NOT NULL CHECK(length(trim(managerial_category)) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id,external_code)
);
CREATE INDEX ix_product_mapping_decisions_period ON product_mapping_decisions(period_id);
