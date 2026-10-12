-- Fichas tecnicas versionadas por competencia: custo TEORICO, nao estoque real.
CREATE TABLE recipe_versions (
 id INTEGER PRIMARY KEY,
 product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 period TEXT NOT NULL CHECK(period GLOB '[1-2][0-9][0-9][0-9]-[0-1][0-9]'),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(product_id,period)
);
CREATE TABLE recipe_lines (
 id INTEGER PRIMARY KEY,
 recipe_id INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE RESTRICT,
 ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
 quantity_base INTEGER NOT NULL CHECK(quantity_base>0),
 UNIQUE(recipe_id,ingredient_id)
);
