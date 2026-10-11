"""Verificação independente dos exemplos XLSX e da migration, sem executar código Rust.
Requer artifact_tool no ambiente de análise, não é dependência do aplicativo.
Executar: python tools/verify_fixtures.py
"""
from artifact_tool import Blob, SpreadsheetFile
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
import sqlite3
import tempfile
import hashlib
import unittest

ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'tests'/'fixtures'

def rows(filename, width=9, height=130):
    w=SpreadsheetFile.import_xlsx(Blob.load(str(FIX/filename)))
    return w.worksheets.get_item_at(0).get_range_by_indexes(0,0,height,width).values

class SmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.products=rows('produtos-set-2026.xlsx')
        cls.payments=rows('pagamentos-set-2026.xlsx',5,20)
    def test_product_header(self):
        self.assertEqual(self.products[0][:9],['Index','ID','Produto','Categoria','Copo Reutilizável','Quantidade','Produtos vendidos','Interno','Valor'])
    def test_payment_header(self):
        self.assertEqual(self.payments[0][:3],['Metodo de Pagamento','Cliente','Total'])
    def test_122_product_rows_and_120_sold_codes(self):
        data=[r for r in self.products[1:] if r[2] is not None]
        self.assertEqual(len(data),122)
        self.assertEqual(len({str(r[1]) for r in data if r[1]!=0 and r[5]>0}),120)
    def test_products_total(self):
        values=[Decimal(str(r[8])) for r in self.products[1:] if isinstance(r[8],(float,int))]
        self.assertEqual(sum(values),Decimal('24944.63'))
    def test_positive_and_adjustments(self):
        values=[Decimal(str(r[8])) for r in self.products[1:] if isinstance(r[8],(float,int))]
        self.assertEqual(sum(v for v in values if v>0),Decimal('28370.70'))
        self.assertEqual(sum(v for v in values if v<0),Decimal('-3426.07'))
    def test_payment_periods(self):
        methods=[str(r[0]) for r in self.payments[1:] if r[0]]
        self.assertEqual(len(methods),9)
        self.assertTrue(all(x.startswith('09/2026 - ') for x in methods))
    def test_payment_total_and_reconciliation(self):
        values=[Decimal(str(r[2])) for r in self.payments[1:] if isinstance(r[2],(float,int))]
        total=sum(values)
        self.assertEqual(total,Decimal('24944.63'))
        products=sum(Decimal(str(r[8])) for r in self.products[1:] if isinstance(r[8],(float,int)))
        self.assertEqual(products-total,Decimal('0.00'))
    def test_expected_normalization(self):
        raw={r[0].split(' - ',1)[1]:Decimal(str(r[2])) for r in self.payments[1:] if isinstance(r[2],(float,int))}
        normalized={
          'Crédito': raw['Crédito']+raw['Crédito Manual'],
          'Débito': raw['Débito']+raw['Débito Manual'],
          **{x:raw[x] for x in ['PIX','Carteira Digital','Outro','Dinheiro','Voucher']}
        }
        self.assertEqual(normalized,{'Crédito':Decimal('11373.49'),'Débito':Decimal('6487.85'),'PIX':Decimal('5009.59'),'Carteira Digital':Decimal('1183.92'),'Outro':Decimal('471.15'),'Dinheiro':Decimal('357.90'),'Voucher':Decimal('60.73')})
    def test_sqlite_migration_and_constraints(self):
        db=sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript((ROOT/'src-tauri'/'migrations'/'0001_init.sql').read_text())
        self.assertEqual(db.execute('SELECT display_name FROM stores').fetchone(),('Loja local',))
        names={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({'periods','imports','import_product_rows','import_payment_rows','products','product_external_codes'}.issubset(names))
        self.assertEqual(db.execute('PRAGMA foreign_keys').fetchone(),(1,))
        db.execute("INSERT INTO periods(store_id,year_month) VALUES (1,'2026-09')")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO periods(store_id,year_month) VALUES (1,'2026-09')")
        db.close()
    def test_sqlite_preserves_raw_bytes_and_rejects_duplicate_hash(self):
        raw=(FIX/'produtos-set-2026.xlsx').read_bytes()
        digest=hashlib.sha256(raw).hexdigest()
        db=sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript((ROOT/'src-tauri'/'migrations'/'0001_init.sql').read_text())
        db.execute("INSERT INTO periods(store_id,year_month) VALUES (1,'2026-09')")
        query="INSERT INTO imports(store_id,period_id,kind,filename,file_sha256,file_size_bytes,original_bytes,original_headers_json,parser_version,record_count,total_cents,status) VALUES (1,1,'PRODUCTS',?,?,?,?,'[]','smoke',122,2494463,'VALIDADO')"
        values=('produtos-set-2026.xlsx',digest,len(raw),raw)
        db.execute(query,values)
        self.assertEqual(db.execute("SELECT original_bytes FROM imports WHERE kind='PRODUCTS'").fetchone()[0],raw)
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute(query,values)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM imports").fetchone()[0],1)
        db.close()
    def test_shifted_header_fixture_has_correct_totals(self):
        shifted=rows('produtos-cabecalho-deslocado.xlsx',9,130)
        self.assertEqual(shifted[3][:5],['Index','ID','Produto','Categoria','Copo Reutilizável'])
        self.assertEqual(sum(Decimal(str(r[8])) for r in shifted[4:] if isinstance(r[8],(float,int))),Decimal('24944.63'))
    def test_negative_fixtures_structure(self):
        wrong=rows('missing-column-products.xlsx',4,3)
        self.assertNotIn('Valor',wrong[0])
        mixed=rows('mixed-month-payments.xlsx',3,4)
        self.assertNotEqual(mixed[1][0][:7],mixed[2][0][:7])
        missing=rows('missing-money-payments.xlsx',2,3)
        self.assertIsNone(missing[1][1])
    def test_new_mappings_absent_without_baseline(self):
        # O cadastro da DRE não está na fixture: não fabricar as 29 correspondências.
        sold_codes={str(r[1]) for r in self.products[1:] if isinstance(r[1],(int,float)) and r[1]!=0 and r[5]>0}
        self.assertEqual(len(sold_codes),120)

if __name__=='__main__': unittest.main(verbosity=2)
