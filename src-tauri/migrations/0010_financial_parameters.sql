CREATE TABLE IF NOT EXISTS financial_rules (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 rule_code TEXT NOT NULL UNIQUE CHECK(length(trim(rule_code)) > 0),
 display_name TEXT NOT NULL CHECK(length(trim(display_name)) > 0),
 category TEXT NOT NULL CHECK(category IN ('ROYALTIES','PAYMENT_FEE','PLATFORM_FEE','TAX_ESTIMATE','OTHER')),
 calculation_base TEXT NOT NULL CHECK(calculation_base IN ('NET_REVENUE','PAYMENT_METHOD','PLATFORM_SALES','DOCUMENTED','MANUAL')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS financial_rule_versions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 rule_id INTEGER NOT NULL REFERENCES financial_rules(id) ON DELETE RESTRICT,
 effective_from TEXT NOT NULL CHECK(effective_from GLOB '20[0-9][0-9]-[0-1][0-9]' AND substr(effective_from,6,2) BETWEEN '01' AND '12'),
 basis_points INTEGER NOT NULL CHECK(basis_points BETWEEN 0 AND 10000),
 source TEXT NOT NULL CHECK(length(trim(source)) > 0),
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(rule_id,effective_from)
);
CREATE INDEX IF NOT EXISTS idx_financial_rule_versions_period ON financial_rule_versions(rule_id,effective_from);
CREATE TRIGGER IF NOT EXISTS forbid_financial_rule_version_update BEFORE UPDATE ON financial_rule_versions
BEGIN SELECT RAISE(ABORT,'Versões históricas são imutáveis'); END;
CREATE TRIGGER IF NOT EXISTS forbid_financial_rule_version_delete BEFORE DELETE ON financial_rule_versions
BEGIN SELECT RAISE(ABORT,'Versões históricas são imutáveis'); END;