"""Testes independentes das constraints SQLite e do contrato de integridade.

IMPORTANTE: não executa o importador Rust nem recalcula planilhas. Os valores
inseridos são dados SINTÉTICOS de contrato, usando bytes reais da fixture.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / 'src-tauri' / 'migrations'
FIXTURES = ROOT / 'tests' / 'fixtures'


def new_db() -> sqlite3.Connection:
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript((MIGRATIONS / '0001_init.sql').read_text())
    db.executescript((MIGRATIONS / '0002_legacy_catalog.sql').read_text())
    return db


def seed(db: sqlite3.Connection) -> None:
    db.execute('INSERT INTO periods(store_id,year_month,status) VALUES(1,?,?)', ('2026-09', 'IMPORTADO'))
    period_id = db.execute('SELECT id FROM periods').fetchone()[0]
    for kind, filename in [('PRODUCTS', 'produtos-set-2026.xlsx'), ('PAYMENTS', 'pagamentos-set-2026.xlsx')]:
        raw = (FIXTURES / filename).read_bytes()
        db.execute('''INSERT INTO imports(store_id,period_id,kind,filename,file_sha256,file_size_bytes,original_bytes,
                 original_headers_json,detected_period,parser_version,record_count,total_cents,status)
                 VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?)''', (
            period_id, kind, filename, hashlib.sha256(raw).hexdigest(), len(raw), raw,
            json.dumps(['ID','Produto','Categoria','Quantidade','Valor'] if kind == 'PRODUCTS' else ['Método de Pagamento','Total']),
            '2026-09' if kind == 'PAYMENTS' else None,
            'test-contract', 1, 2494463, 'VALIDADO'))
        import_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
        if kind == 'PRODUCTS':
            db.execute('''INSERT INTO import_product_rows(import_id,source_sheet,source_row,raw_cells_json,
                external_code,product_name,category_name,quantity,value_cents,row_type)
                VALUES(?,?,?,?,?,?,?,?,?,?)''', (
                import_id,'Produtos',1,'["exemplo sintético"]','123','Produto fictício','Teste',1,2494463,'SALE'))
        else:
            db.execute('''INSERT INTO import_payment_rows(import_id,source_sheet,source_row,raw_cells_json,
                method_raw,method_normalized,entry_type,detected_period,value_cents)
                VALUES(?,?,?,?,?,?,?,?,?)''',(
                import_id,'Pagamentos',1,'["exemplo sintético"]','09/2026 - PIX','pix','STANDARD','2026-09',2494463))
    db.commit()


def verify(db: sqlite3.Connection, kind: str) -> bool:
    """Reproduz as condições SQL/hash do verificador Rust, não invoca Rust."""
    imp_id, count, total, original, digest, size, period = db.execute(
        'SELECT id,record_count,total_cents,original_bytes,file_sha256,file_size_bytes,detected_period FROM imports WHERE kind=?',
        (kind,)).fetchone()
    table = 'import_product_rows' if kind == 'PRODUCTS' else 'import_payment_rows'
    nrows, actual_total = db.execute(f'SELECT COUNT(*), SUM(value_cents) FROM {table} WHERE import_id=?', (imp_id,)).fetchone()
    return (count >= 1 and count == nrows and total == actual_total and
            len(original) == size and hashlib.sha256(original).hexdigest() == digest and
            (kind != 'PAYMENTS' or period == '2026-09'))


class PersistenceContractTests(unittest.TestCase):
    def setUp(self):
        self.db = new_db()
        seed(self.db)

    def tearDown(self):
        self.db.close()

    def test_migrations_and_foreign_keys(self):
        self.assertEqual(self.db.execute('PRAGMA foreign_keys').fetchone()[0], 1)
        self.assertEqual(len(self.db.execute('SELECT name FROM sqlite_master WHERE type="table"').fetchall()) >= 8, True)

    def test_valid_synthetic_rows(self):
        self.assertTrue(verify(self.db, 'PRODUCTS'))
        self.assertTrue(verify(self.db, 'PAYMENTS'))

    def test_corrupted_product_amount_detected(self):
        self.db.execute('UPDATE import_product_rows SET value_cents=value_cents+1')
        self.assertFalse(verify(self.db, 'PRODUCTS'))

    def test_deleted_payment_row_detected(self):
        self.db.execute('DELETE FROM import_payment_rows')
        self.assertFalse(verify(self.db, 'PAYMENTS'))

    def test_modified_file_blob_detected(self):
        self.db.execute('UPDATE imports SET original_bytes=? WHERE kind="PAYMENTS"', (b'alterado',))
        self.assertFalse(verify(self.db, 'PAYMENTS'))

    def test_wrong_payment_period_detected(self):
        self.db.execute('UPDATE imports SET detected_period="2026-08" WHERE kind="PAYMENTS"')
        self.assertFalse(verify(self.db, 'PAYMENTS'))

    def test_duplicate_file_hash_is_rejected_by_sqlite(self):
        line = self.db.execute('SELECT store_id,period_id,kind,filename,file_sha256,file_size_bytes,original_bytes,original_headers_json,parser_version,record_count,total_cents,status FROM imports WHERE kind="PAYMENTS"').fetchone()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('''INSERT INTO imports(store_id,period_id,kind,filename,file_sha256,file_size_bytes,original_bytes,original_headers_json,parser_version,record_count,total_cents,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''', line)

    def test_original_files_are_preserved_byte_for_byte(self):
        for kind, path in [('PRODUCTS', 'produtos-set-2026.xlsx'), ('PAYMENTS', 'pagamentos-set-2026.xlsx')]:
            self.assertEqual(self.db.execute('SELECT original_bytes FROM imports WHERE kind=?', (kind,)).fetchone()[0],
                             (FIXTURES / path).read_bytes())


if __name__ == '__main__':
    unittest.main(verbosity=2)
