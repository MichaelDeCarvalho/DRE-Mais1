-- Marco 3: insumos e custos de compra por competencia, sem CMV.
CREATE TABLE ingredients (
 id INTEGER PRIMARY KEY, store_id INTEGER NOT NULL REFERENCES stores(id),
 code TEXT NOT NULL CHECK(length(trim(code)) BETWEEN 1 AND 40),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 base_unit TEXT NOT NULL CHECK(base_unit IN ('G','ML','UN')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 UNIQUE(store_id,code)
);
CREATE TABLE ingredient_purchase_costs (
 id INTEGER PRIMARY KEY,
 ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
 period TEXT NOT NULL CHECK(period GLOB '[1-2][0-9][0-9][0-9]-[0-1][0-9]'),
 quantity_base INTEGER NOT NULL CHECK(quantity_base > 0),
 purchase_cents INTEGER NOT NULL CHECK(purchase_cents >= 0),
 origin TEXT NOT NULL CHECK(origin IN ('MANUAL','EXCEL')),
 entered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(ingredient_id,period)
);
CREATE TABLE ingredient_excel_imports (
 id INTEGER PRIMARY KEY, store_id INTEGER NOT NULL REFERENCES stores(id),
 period TEXT NOT NULL, filename TEXT NOT NULL,
 file_sha256 TEXT NOT NULL, original_bytes BLOB NOT NULL,
 rows_imported INTEGER NOT NULL CHECK(rows_imported > 0),
 imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(store_id,period,file_sha256)
);
