-- Primeiro marco: sem CMV/DRE/licenciamento/usuários, com preservação de bytes originais.
CREATE TABLE stores (
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)
);
INSERT INTO stores(id, display_name) VALUES (1, 'Loja local');
CREATE TABLE periods (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  year_month TEXT NOT NULL CHECK(year_month GLOB '[1-2][0-9][0-9][0-9]-[0-1][0-9]'),
  status TEXT NOT NULL DEFAULT 'IMPORTADO' CHECK(status IN ('IMPORTADO','DIVERGENTE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, year_month)
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) > 0),
  category_name TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE product_external_codes (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  external_code TEXT NOT NULL CHECK(length(trim(external_code)) > 0),
  UNIQUE(store_id, external_code)
);
CREATE INDEX ix_external_codes_product ON product_external_codes(product_id);
CREATE TABLE imports (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  period_id INTEGER NOT NULL REFERENCES periods(id),
  kind TEXT NOT NULL CHECK(kind IN ('PRODUCTS','PAYMENTS')),
  filename TEXT NOT NULL,
  file_sha256 TEXT NOT NULL CHECK(length(file_sha256) = 64),
  file_size_bytes INTEGER NOT NULL CHECK(file_size_bytes > 0),
  original_bytes BLOB NOT NULL,
  original_headers_json TEXT NOT NULL CHECK(json_valid(original_headers_json)),
  detected_period TEXT,
  parser_version TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK(record_count >= 0),
  total_cents INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL CHECK(status IN ('VALIDADO','DIVERGENTE')),
  UNIQUE(store_id, kind, file_sha256),
  UNIQUE(store_id, period_id, kind)
);
CREATE INDEX ix_imports_period ON imports(period_id);
CREATE TABLE import_product_rows (
  id INTEGER PRIMARY KEY,
  import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE RESTRICT,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK(source_row >= 1),
  raw_cells_json TEXT NOT NULL CHECK(json_valid(raw_cells_json)),
  external_code TEXT,
  product_name TEXT NOT NULL,
  category_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity >= 0),
  value_cents INTEGER NOT NULL,
  row_type TEXT NOT NULL CHECK(row_type IN ('SALE','ADJUSTMENT','PLACEHOLDER')),
  UNIQUE(import_id, source_sheet, source_row)
);
CREATE INDEX ix_product_rows_code ON import_product_rows(external_code);
CREATE TABLE import_payment_rows (
  id INTEGER PRIMARY KEY,
  import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE RESTRICT,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK(source_row >= 1),
  raw_cells_json TEXT NOT NULL CHECK(json_valid(raw_cells_json)),
  method_raw TEXT NOT NULL,
  method_normalized TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('STANDARD','MANUAL')),
  detected_period TEXT NOT NULL,
  value_cents INTEGER NOT NULL,
  UNIQUE(import_id, source_sheet, source_row)
);
CREATE INDEX ix_payment_rows_method ON import_payment_rows(method_normalized);
