"""Independent SQLite checks for the persisted catalog-status contract.

Does NOT compile/run catalog_status() in Rust; exercises the same SQL invariants.
"""
import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "src-tauri" / "migrations"
FIXTURE = ROOT / "tests" / "fixtures" / "base-dre-set-2026.xlsx"


def check_catalog(db):
    row = db.execute('''
        SELECT id,filename,valid_rows,skipped_rows,file_size_bytes,file_sha256,original_bytes
        FROM legacy_catalog_imports WHERE store_id=1 LIMIT 1
    ''').fetchone()
    if row is None:
        return {"loaded": False}
    cid, filename, valid, skipped, size, sha, raw = row
    if len(raw) != size or hashlib.sha256(raw).hexdigest() != sha:
        raise ValueError("Integridade do catálogo legado comprometida: conteúdo original")
    actual_valid, actual_skipped = db.execute('''
        SELECT COALESCE(SUM(CASE WHEN is_skipped=0 THEN 1 ELSE 0 END),0),
               COALESCE(SUM(CASE WHEN is_skipped=1 THEN 1 ELSE 0 END),0)
        FROM legacy_catalog_rows WHERE catalog_import_id=?''', (cid,)).fetchone()
    if actual_valid != valid or actual_skipped != skipped:
        raise ValueError("Integridade do catálogo legado comprometida: registros")
    return {"loaded": True, "filename": filename, "valid": valid, "skipped": skipped}


class CatalogStatusSQLite(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "data.sqlite"
        self.db = sqlite3.connect(self.path)
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted(MIGRATIONS.glob('*.sql')):
            self.db.executescript(migration.read_text(encoding='utf8'))

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def save(self):
        b = FIXTURE.read_bytes()
        self.db.execute('''INSERT INTO legacy_catalog_imports(
          store_id,filename,file_sha256,file_size_bytes,original_bytes,valid_rows,skipped_rows)
          VALUES(1,?,?,?,?,?,?)''', (FIXTURE.name, hashlib.sha256(b).hexdigest(), len(b), b, 1, 1))
        self.db.execute("INSERT INTO products(store_id,display_name) VALUES (1,'Produto válido')")
        self.db.execute('''INSERT INTO legacy_catalog_rows
            (catalog_import_id,source_sheet,source_row,raw_cells_json,external_code,imported_product_id,is_skipped,issue)
            VALUES (1,'Base DRE',3,'[]','123',1,0,NULL)''')
        self.db.execute('''INSERT INTO legacy_catalog_rows
            (catalog_import_id,source_sheet,source_row,raw_cells_json,external_code,imported_product_id,is_skipped,issue)
            VALUES (1,'Base DRE',4,'[]',NULL,NULL,1,'#N/A')''')
        self.db.commit()

    def test_no_catalog_is_not_loaded(self):
        self.assertEqual(check_catalog(self.db), {"loaded": False})

    def test_status_persists_across_sqlite_connections(self):
        self.save()
        self.db.close()
        self.db = sqlite3.connect(self.path)
        self.assertEqual(check_catalog(self.db), {
            "loaded": True, "filename": FIXTURE.name, "valid": 1, "skipped": 1,
        })

    def test_changed_original_is_rejected(self):
        self.save()
        self.db.execute("UPDATE legacy_catalog_imports SET original_bytes=x'01' WHERE id=1")
        with self.assertRaisesRegex(ValueError, 'Integridade'):
            check_catalog(self.db)

    def test_missing_row_is_rejected(self):
        self.save()
        self.db.execute("DELETE FROM legacy_catalog_rows WHERE source_row=4")
        with self.assertRaisesRegex(ValueError, 'Integridade'):
            check_catalog(self.db)

    def test_changed_summary_counter_is_rejected(self):
        self.save()
        self.db.execute("UPDATE legacy_catalog_imports SET valid_rows=2 WHERE id=1")
        with self.assertRaisesRegex(ValueError, 'Integridade'):
            check_catalog(self.db)


if __name__ == '__main__':
    unittest.main(verbosity=2)
