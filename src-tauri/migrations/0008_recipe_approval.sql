-- Revisao explicita e imutavel de ficha tecnica por competencia.
ALTER TABLE recipe_versions ADD COLUMN approved_at TEXT;
ALTER TABLE recipe_versions ADD COLUMN approved_note TEXT;
CREATE TRIGGER recipe_lines_no_insert_after_approval
BEFORE INSERT ON recipe_lines
WHEN (SELECT approved_at FROM recipe_versions WHERE id=NEW.recipe_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Ficha aprovada: ingredientes bloqueados'); END;
CREATE TRIGGER recipe_lines_no_update_after_approval
BEFORE UPDATE ON recipe_lines
WHEN (SELECT approved_at FROM recipe_versions WHERE id=OLD.recipe_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Ficha aprovada: alteracao bloqueada'); END;
CREATE TRIGGER recipe_lines_no_delete_after_approval
BEFORE DELETE ON recipe_lines
WHEN (SELECT approved_at FROM recipe_versions WHERE id=OLD.recipe_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Ficha aprovada: exclusao bloqueada'); END;
