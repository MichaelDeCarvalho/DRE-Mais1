-- Gastos gerenciais por competencia. Sem lancamentos presumidos.
CREATE TABLE managerial_expenses (
 id INTEGER PRIMARY KEY,
 store_id INTEGER NOT NULL REFERENCES stores(id),
 period TEXT NOT NULL,
 expense_kind TEXT NOT NULL CHECK(expense_kind IN ('VARIAVEL','FIXA','TRIBUTO')),
 category TEXT NOT NULL CHECK(length(trim(category)) BETWEEN 1 AND 120),
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 200),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
 reference TEXT NOT NULL DEFAULT '' CHECK(length(reference)<=200),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(store_id,period,expense_kind,category,description,reference)
);
CREATE INDEX ix_managerial_expenses_period ON managerial_expenses(store_id,period);
