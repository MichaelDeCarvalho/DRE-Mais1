"""Verificação INDEPENDENTE de conteúdo XLSX e das migrations SQLite.
NÃO executa parser Rust/Tauri. Python + artifact_tool é apenas verificador da fixture.
"""
import unittest, sqlite3, json, hashlib, tempfile
from pathlib import Path
from decimal import Decimal
from artifact_tool import Blob, SpreadsheetFile

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / 'tests' / 'fixtures'

def sheet(path, name=None, address='A1:L160'):
    book = SpreadsheetFile.import_xlsx(Blob.load(str(path)))
    sh = book.worksheets.get_item(name) if name else book.worksheets.get_item_at(0)
    return sh.get_range(address).values

def reference():
    data = sheet(FIX/'base-dre-set-2026.xlsx', 'Base DRE', 'B2:E152')
    assert data[0][:4] == ['Produto','Código','Qtde.','Categoria']
    valid=[]; skipped=[]
    for line, (name, code, qty, category) in enumerate(data[1:], start=3):
        if not name: continue
        if str(name).strip().lower() == "total unitário" and code is None: break
        if isinstance(code,(int,float)) and code > 0 and int(code) == code and category:
            valid.append((line,str(int(code)),name,category))
        else: skipped.append((line,name,str(code),category))
    return valid,skipped

def sales():
    rows=sheet(FIX/'produtos-set-2026.xlsx',address='A1:I124')
    assert rows[0][1:4] == ['ID','Produto','Categoria']
    return [r for r in rows[1:] if r[2] is not None]

def payments():
    rows=sheet(FIX/'pagamentos-set-2026.xlsx',address='A1:E12')
    return [r for r in rows[1:] if r[0] is not None]

class LegacyMappingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.known,cls.skipped=reference()
        cls.vendas=sales(); cls.pagamentos=payments()

    def test_legacy_file_has_135_unique_valid_codes(self):
        self.assertEqual(len(self.known),135)
        self.assertEqual(len({code for _,code,_,_ in self.known}),135)

    def test_14_unresolved_legacy_rows_preserved(self):
        self.assertEqual(len(self.skipped),14)
        self.assertTrue(all(code == '#N/A' for _,_,code,_ in self.skipped))

    def test_sales_120_codes_and_29_not_in_baseline(self):
        sold={str(int(row[1])) for row in self.vendas if row[1] and row[5]>0}
        known={code for _,code,_,_ in self.known}
        self.assertEqual(len(sold),120)
        self.assertEqual(len(sold - known),29)
        self.assertEqual(len(sold & known),91)

    def test_29_unmapped_sales_total(self):
        known={code for _,code,_,_ in self.known}
        missing=sum((Decimal(str(row[8])) for row in self.vendas if row[1] and row[5]>0 and str(int(row[1])) not in known), Decimal(0))
        self.assertEqual(missing,Decimal('3653.70'))

    def test_september_money_conciles(self):
        sales_total=sum((Decimal(str(row[8])) for row in self.vendas),Decimal(0))
        pay_total=sum((Decimal(str(row[2])) for row in self.pagamentos),Decimal(0))
        self.assertEqual(sales_total,Decimal('24944.63'))
        self.assertEqual(pay_total,Decimal('24944.63'))
        self.assertEqual(sales_total-pay_total,Decimal(0))

    def test_payment_manual_normalization(self):
        amounts={str(row[0]).split(' - ',1)[1]:Decimal(str(row[2])) for row in self.pagamentos}
        self.assertEqual(amounts['Crédito']+amounts['Crédito Manual'],Decimal('11373.49'))
        self.assertEqual(amounts['Débito']+amounts['Débito Manual'],Decimal('6487.85'))

    def test_upgrade_0001_to_0002_and_foreign_keys(self):
        db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
        db.executescript((ROOT/'src-tauri/migrations/0001_init.sql').read_text())
        db.execute('PRAGMA user_version=1')
        db.executescript((ROOT/'src-tauri/migrations/0002_legacy_catalog.sql').read_text())
        db.execute('PRAGMA user_version=2')
        self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],2)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertIn('legacy_catalog_rows',{r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")})
        db.close()

    def test_migration_preserves_original_file_and_provenance(self):
        db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
        for p in sorted((ROOT/'src-tauri/migrations').glob('*.sql')): db.executescript(p.read_text())
        f=(FIX/'base-dre-set-2026.xlsx').read_bytes();digest=hashlib.sha256(f).hexdigest()
        db.execute('INSERT INTO legacy_catalog_imports(store_id,filename,file_sha256,file_size_bytes,original_bytes,valid_rows,skipped_rows) VALUES (1,?,?,?,?,?,?)',('base-dre-set-2026.xlsx',digest,len(f),f,135,14))
        self.assertEqual(db.execute('SELECT original_bytes FROM legacy_catalog_imports').fetchone()[0],f)
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute('INSERT INTO legacy_catalog_imports(store_id,filename,file_sha256,file_size_bytes,original_bytes,valid_rows,skipped_rows) VALUES (1,?,?,?,?,?,?)',('base-dre-set-2026.xlsx',digest,len(f),f,135,14))
        db.execute("INSERT INTO products(store_id,display_name) VALUES(1,'Teste')")
        db.execute("INSERT INTO product_external_codes(store_id,product_id,external_code) VALUES(1,1,'1012')")
        db.execute("INSERT INTO legacy_catalog_rows(catalog_import_id,source_sheet,source_row,raw_cells_json,external_code,imported_product_id,is_skipped,issue) VALUES (1,'Base DRE',3,'[\"Caramel\"]','1012',1,0,NULL)")
        db.execute("INSERT INTO legacy_catalog_rows(catalog_import_id,source_sheet,source_row,raw_cells_json,external_code,imported_product_id,is_skipped,issue) VALUES (1,'Base DRE',32,'[\"#N/A\"]',NULL,NULL,1,'Código inválido')")
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO legacy_catalog_rows(catalog_import_id,source_sheet,source_row,raw_cells_json,external_code,imported_product_id,is_skipped,issue) VALUES (1,'Base DRE',88,'[]','1020',NULL,0,NULL)")
        db.close()

    def test_legacy_catalog_does_not_contain_cost_fields(self):
        sql=(ROOT/'src-tauri/migrations/0002_legacy_catalog.sql').read_text()
        self.assertNotIn('cmv_cents',sql)
        self.assertNotIn('cost_cents',sql)

if __name__=='__main__':unittest.main(verbosity=2)
