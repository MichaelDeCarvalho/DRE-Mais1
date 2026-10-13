-- Permite consumo de insumos com ate tres casas decimais (0,001 G/ML/UN).
-- Nao modifica linhas existentes, inclusive fichas aprovadas protegidas por trigger.
-- Zero indica registro legado e e interpretado como quantity_base * 1000.
-- Linhas novas armazenam o valor exato em milésimos; quantity_base e campo legado obrigatorio.
ALTER TABLE recipe_lines ADD COLUMN quantity_milli_base INTEGER NOT NULL DEFAULT 0
  CHECK(quantity_milli_base >= 0);
