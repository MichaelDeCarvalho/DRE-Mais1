-- Precos de venda por codigo externo e competencia; sem sobrescrita silenciosa.
CREATE TABLE product_sale_prices (
 id INTEGER PRIMARY KEY,
 store_id INTEGER NOT NULL REFERENCES stores(id),
 product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 period TEXT NOT NULL CHECK(period GLOB '[1-2][0-9][0-9][0-9]-[0-1][0-9]'),
 price_cents INTEGER NOT NULL CHECK(price_cents>0),
 origin TEXT NOT NULL CHECK(origin IN ('MANUAL')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(store_id,product_id,period)
);
