-- Espelho imutavel da DRE validada pelo operador, distinto de lancamentos contabeis.
-- Nao somar totais/subtotais/percentuais com as despesas da tabela managerial_expenses.
CREATE TABLE dre_workbook_sources(
 id INTEGER PRIMARY KEY,
 store_id INTEGER NOT NULL DEFAULT 1 CHECK(store_id=1),
 period TEXT NOT NULL CHECK(period GLOB '[1-2][0-9][0-9][0-9]-[0-1][0-9]'),
 filename TEXT NOT NULL,
 file_sha256 TEXT NOT NULL,
 original_bytes BLOB NOT NULL,
 source_sheet TEXT NOT NULL DEFAULT 'DRE MENSAL',
 source_month_label TEXT NOT NULL DEFAULT '',
 revenue_cents INTEGER NOT NULL CHECK(revenue_cents>=0),
 confirmation TEXT NOT NULL CHECK(confirmation='VALIDADO_PELO_OPERADOR'),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(store_id,period),
 UNIQUE(store_id,file_sha256)
);
CREATE TABLE dre_workbook_rows(
 id INTEGER PRIMARY KEY,
 source_id INTEGER NOT NULL REFERENCES dre_workbook_sources(id) ON DELETE RESTRICT,
 source_row INTEGER NOT NULL CHECK(source_row BETWEEN 1 AND 200),
 label TEXT NOT NULL,
 raw_value TEXT NOT NULL,
 value_cents INTEGER,
 value_kind TEXT NOT NULL CHECK(value_kind IN('MONETARIO','PERCENTUAL','SEM_VALOR','TEXTO')),
 UNIQUE(source_id,source_row)
);
CREATE TRIGGER dre_source_no_update BEFORE UPDATE ON dre_workbook_sources
BEGIN SELECT RAISE(ABORT,'Fonte DRE imutavel'); END;
CREATE TRIGGER dre_source_no_delete BEFORE DELETE ON dre_workbook_sources
BEGIN SELECT RAISE(ABORT,'Fonte DRE imutavel'); END;
CREATE TRIGGER dre_row_no_update BEFORE UPDATE ON dre_workbook_rows
BEGIN SELECT RAISE(ABORT,'Linha DRE imutavel'); END;
CREATE TRIGGER dre_row_no_delete BEFORE DELETE ON dre_workbook_rows
BEGIN SELECT RAISE(ABORT,'Linha DRE imutavel'); END;
