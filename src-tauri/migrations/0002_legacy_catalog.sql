-- Marco 1: ingestão pontual e auditável de códigos da Base DRE, NÃO de CMV/custos.
-- Nenhum código com erro Excel (#N/A, etc.) vira mapeamento.
CREATE TABLE legacy_catalog_imports (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  filename TEXT NOT NULL,
  file_sha256 TEXT NOT NULL CHECK(length(file_sha256) = 64),
  file_size_bytes INTEGER NOT NULL CHECK(file_size_bytes > 0),
  original_bytes BLOB NOT NULL,
  valid_rows INTEGER NOT NULL CHECK(valid_rows >= 0),
  skipped_rows INTEGER NOT NULL CHECK(skipped_rows >= 0),
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, file_sha256)
);
CREATE TABLE legacy_catalog_rows (
  id INTEGER PRIMARY KEY,
  catalog_import_id INTEGER NOT NULL REFERENCES legacy_catalog_imports(id) ON DELETE RESTRICT,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK(source_row > 0),
  raw_cells_json TEXT NOT NULL CHECK(json_valid(raw_cells_json)),
  external_code TEXT,
  imported_product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
  is_skipped INTEGER NOT NULL CHECK(is_skipped IN (0,1)),
  issue TEXT,
  CHECK((is_skipped=1 AND imported_product_id IS NULL AND issue IS NOT NULL) OR
        (is_skipped=0 AND external_code IS NOT NULL AND imported_product_id IS NOT NULL AND issue IS NULL)),
  UNIQUE(catalog_import_id, source_sheet, source_row)
);
CREATE INDEX ix_legacy_catalog_rows_code ON legacy_catalog_rows(external_code);
