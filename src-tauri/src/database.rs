use crate::importer::{self, ImportSummary, PaymentReport, ProductReport};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

pub fn open_database(path: &std::path::Path) -> Result<Connection, String> {
    let mut db = Connection::open(path).map_err(|e| format!("Não foi possível abrir SQLite: {e}"))?;
    db.pragma_update(None, "foreign_keys", "ON").map_err(|e| e.to_string())?;
    let version: i64 = db.pragma_query_value(None, "user_version", |row| row.get(0)).map_err(|e| e.to_string())?;
    if version > 12 { return Err(format!("Banco de dados versão {version} é mais recente que esta aplicação.")); }
    if version == 0 {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0001_init.sql")).map_err(|e| format!("Migration 0001 falhou: {e}"))?;
        tx.pragma_update(None, "user_version", 1).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 2 {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0002_legacy_catalog.sql"))
            .map_err(|e| format!("Migration 0002 falhou: {e}"))?;
        tx.pragma_update(None, "user_version", 2).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 3 {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0003_product_mapping.sql"))
            .map_err(|e| format!("Migration 0003 falhou: {e}"))?;
        tx.pragma_update(None, "user_version", 3).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 4 {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0004_ingredients.sql"))
            .map_err(|e| format!("Migration 0004 falhou: {e}"))?;
        tx.pragma_update(None, "user_version", 4).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 5 {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0005_ingredient_purchase_details.sql"))
            .map_err(|e| format!("Migration 0005 falhou: {e}"))?;
        tx.pragma_update(None, "user_version", 5).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 6 {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0006_recipes.sql"))
            .map_err(|e| format!("Migration 0006 falhou: {e}"))?;
        tx.pragma_update(None, "user_version", 6).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 7 {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0007_sale_prices.sql"))
            .map_err(|e| format!("Migration 0007 falhou: {e}"))?;
        tx.pragma_update(None, "user_version", 7).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 8 {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0008_recipe_approval.sql"))
            .map_err(|e| format!("Migration 0008 falhou: {e}"))?;
        tx.pragma_update(None, "user_version", 8).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 9 {
        let tx=db.transaction().map_err(|e|e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0009_expenses.sql")).map_err(|e|format!("Migration 0009 falhou: {e}"))?;
        tx.pragma_update(None,"user_version",9).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;
    }
    if version < 10 {
        let tx=db.transaction().map_err(|e|e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0010_financial_parameters.sql")).map_err(|e|format!("Migration 0010 falhou: {e}"))?;
        tx.pragma_update(None,"user_version",10).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;
    }
    if version < 11 {
        let tx=db.transaction().map_err(|e|e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0011_seed_financial_rules.sql")).map_err(|e|format!("Migration 0011 falhou: {e}"))?;
        tx.pragma_update(None,"user_version",11).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;
    }
    if version < 12 {
        let tx=db.transaction().map_err(|e|e.to_string())?;
        tx.execute_batch(include_str!("../migrations/0012_fractional_recipe_quantity.sql"))
          .map_err(|e|format!("Migration 0012 falhou: {e}"))?;
        tx.pragma_update(None,"user_version",12).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;
    }
    Ok(db)
}

pub fn save_reports(db: &mut Connection, selected_period: &str, products: ProductReport, payments: PaymentReport) -> Result<ImportSummary, String> {
    importer::validate_selected_period(selected_period, &payments.period)?;
    let difference = products.total_cents.checked_sub(payments.total_cents).ok_or("Diferença monetária fora do limite")?;
    let reconciled = difference == 0;
    let candidates = importer::collect_unmapped_candidates(&products.rows)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for (kind, hash) in [("PRODUCTS", &products.file.sha256), ("PAYMENTS", &payments.file.sha256)] {
        let duplicate: Option<i64> = tx.query_row("SELECT id FROM imports WHERE store_id=1 AND kind=?1 AND file_sha256=?2", params![kind, hash], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        if duplicate.is_some() { return Err(format!("Este arquivo já foi importado ({kind}); importação duplicada bloqueada.")); }
    }
    let period_id: Option<i64> = tx.query_row("SELECT id FROM periods WHERE store_id=1 AND year_month=?1", [selected_period], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    if let Some(id) = period_id {
        let count: i64 = tx.query_row("SELECT COUNT(*) FROM imports WHERE period_id=?1", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
        if count > 0 { return Err("Já existem relatórios neste período. Substituição controlada ainda não implementada; nenhum dado foi sobrescrito.".into()); }
    }
    let mut unmapped = Vec::new();
    for (external_code, product) in candidates.iter() {
        let mapped: Option<i64> = tx.query_row("SELECT product_id FROM product_external_codes WHERE store_id=1 AND external_code=?1", [external_code], |r| r.get(0))
            .optional().map_err(|e| e.to_string())?;
        if mapped.is_none() { unmapped.push(product.clone()); }
    }
    let mapped_count = candidates.len().saturating_sub(unmapped.len());
    let status = if reconciled { "VALIDADO" } else { "DIVERGENTE" };
    tx.execute("INSERT INTO periods(store_id, year_month, status) VALUES (1, ?1, ?2) ON CONFLICT(store_id, year_month) DO UPDATE SET status=excluded.status",
        params![selected_period, if reconciled { "IMPORTADO" } else { "DIVERGENTE" }]).map_err(|e| e.to_string())?;
    let period_id: i64 = tx.query_row("SELECT id FROM periods WHERE store_id=1 AND year_month=?1", [selected_period], |r| r.get(0)).map_err(|e| e.to_string())?;
    let product_import_id = insert_import(&tx, period_id, "PRODUCTS", &products.file, &products.headers, None, products.rows.len(), products.total_cents, status)?;
    let payment_import_id = insert_import(&tx, period_id, "PAYMENTS", &payments.file, &payments.headers, Some(&payments.period), payments.rows.len(), payments.total_cents, status)?;
    for r in &products.rows {
        tx.execute("INSERT INTO import_product_rows(import_id, source_sheet, source_row, raw_cells_json, external_code, product_name, category_name, quantity, value_cents, row_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![product_import_id,r.sheet,r.source_row as i64,serde_json::to_string(&r.original_cells).map_err(|e|e.to_string())?,r.external_code,r.name,r.category,r.quantity,r.value_cents,r.row_type]).map_err(|e| e.to_string())?;
    }
    for r in &payments.rows {
        tx.execute("INSERT INTO import_payment_rows(import_id, source_sheet, source_row, raw_cells_json, method_raw, method_normalized, entry_type, detected_period, value_cents) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![payment_import_id,r.sheet,r.source_row as i64,serde_json::to_string(&r.original_cells).map_err(|e|e.to_string())?,r.raw_method,r.normalized_method,r.entry_type,r.period,r.value_cents]).map_err(|e|e.to_string())?;
    }
    let mut warnings = products.warnings.clone();
    warnings.extend(payments.warnings.clone());
    warnings.push("O relatório de produtos recebido não informa o período. O mês é confirmado pelo operador e validado apenas contra o relatório de pagamentos.".into());
    if !reconciled { warnings.push("Os totais divergem: nenhuma conclusão de fechamento pode ser emitida.".into()); }
    let methods = importer::method_totals(&payments.rows)?;
    let summary = ImportSummary {
        period: selected_period.to_string(), payment_report_period: payments.period.clone(),
        products_report_has_independent_period: false,
        products_total_cents: products.total_cents, payments_total_cents: payments.total_cents,
        difference_cents: difference, reconciled, positive_sales_cents: products.positive_cents, adjustments_cents: products.adjustments_cents,
        product_rows: products.rows.len(), payment_rows: payments.rows.len(),
        sold_product_codes: candidates.len(), mapped_product_codes: mapped_count, unmapped_products: unmapped,
        payment_methods: methods, warnings,
    };
    tx.commit().map_err(|e| format!("Falha ao concluir transação SQLite: {e}"))?;
    Ok(summary)
}
/// Verifica consistência entre os metadados imutáveis e as linhas persistidas.
/// Em caso de corrupção/incompletude, nunca apresenta uma conciliação "OK".
fn verify_import_integrity(db: &Connection, import_id: i64, kind: &str, expected_rows: i64, expected_cents: i64) -> Result<(), String> {
    let table = match kind {
        "PRODUCTS" => "import_product_rows",
        "PAYMENTS" => "import_payment_rows",
        _ => return Err("Tipo de importação desconhecido".into()),
    };
    let statement = format!("SELECT COUNT(*), SUM(value_cents) FROM {table} WHERE import_id=?1");
    let (actual_rows, actual_cents): (i64, Option<i64>) = db.query_row(&statement, [import_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| format!("Falha ao verificar integridade dos dados importados: {e}"))?;
    if expected_rows < 1 || actual_rows != expected_rows || actual_cents != Some(expected_cents) {
        return Err(format!("Integridade da importação {kind} comprometida: linhas ou total divergem dos dados de origem. Consulta bloqueada."));
    }
    let (raw_bytes, hash, expected_size): (Vec<u8>, String, i64) = db.query_row(
        "SELECT original_bytes, file_sha256, file_size_bytes FROM imports WHERE id=?1", [import_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| format!("Falha na leitura do original preservado: {e}"))?;
    if i64::try_from(raw_bytes.len()).ok() != Some(expected_size) ||
       format!("{:x}", Sha256::digest(&raw_bytes)) != hash {
        return Err(format!("Integridade do arquivo original {kind} comprometida: tamanho/hash divergentes. Consulta bloqueada."));
    }
    Ok(())
}

/// Reabre para consulta a conciliação persistida. Não reimporta nem recalcula CMV.
pub fn load_period_summary(db: &Connection, period: &str) -> Result<ImportSummary, String> {
    let id: i64 = db.query_row("SELECT id FROM periods WHERE store_id=1 AND year_month=?1", [period], |r| r.get(0))
        .optional().map_err(|e| e.to_string())?.ok_or("Nenhuma importação encontrada para o período selecionado.")?;
    let products: (i64, i64, i64) = db.query_row("SELECT id,total_cents,record_count FROM imports WHERE period_id=?1 AND kind='PRODUCTS'", [id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?)))
        .map_err(|e| format!("Importação de produtos indisponível: {e}"))?;
    let payments: (i64, i64, i64, String) = db.query_row("SELECT id,total_cents,record_count,detected_period FROM imports WHERE period_id=?1 AND kind='PAYMENTS'", [id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))
        .map_err(|e| format!("Importação de pagamentos indisponível: {e}"))?;
    verify_import_integrity(db, products.0, "PRODUCTS", products.2, products.1)?;
    verify_import_integrity(db, payments.0, "PAYMENTS", payments.2, payments.1)?;
    if payments.3 != period { return Err("Período detectado e período cadastrado não coincidem; consulta bloqueada.".into()); }
    let (positive, adjustments): (i64, i64) = db.query_row("SELECT COALESCE(SUM(CASE WHEN row_type='SALE' THEN value_cents ELSE 0 END),0),
           COALESCE(SUM(CASE WHEN row_type='ADJUSTMENT' THEN value_cents ELSE 0 END),0)
           FROM import_product_rows WHERE import_id=(SELECT id FROM imports WHERE period_id=?1 AND kind='PRODUCTS')", [id], |r| Ok((r.get(0)?,r.get(1)?)))
        .map_err(|e| e.to_string())?;
    let mut statement = db.prepare("SELECT method_normalized,SUM(value_cents) FROM import_payment_rows
        WHERE import_id=(SELECT id FROM imports WHERE period_id=?1 AND kind='PAYMENTS') GROUP BY method_normalized")
        .map_err(|e| e.to_string())?;
    let method_totals = statement.query_map([id], |r| Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?)))
        .map_err(|e| e.to_string())?.map(|r| {
            let (code, total_cents) = r.map_err(|e|e.to_string())?;
            Ok(importer::MethodTotal { label: importer::normalized_method_label(&code).into(), code, total_cents })
        }).collect::<Result<Vec<_>, String>>()?;
    let overview = crate::catalog::mapping_overview(db, period)?;
    let difference = products.1.checked_sub(payments.1).ok_or("Diferença fora do limite de centavos")?;
    Ok(ImportSummary {
        period: period.into(), payment_report_period: payments.3,
        products_report_has_independent_period: false,
        products_total_cents: products.1, payments_total_cents: payments.1,
        difference_cents: difference, reconciled: difference == 0,
        positive_sales_cents: positive, adjustments_cents: adjustments,
        product_rows: usize::try_from(products.2).map_err(|e|e.to_string())?,
        payment_rows: usize::try_from(payments.2).map_err(|e|e.to_string())?,
        sold_product_codes: overview.sold_product_codes,
        mapped_product_codes: overview.mapped_product_codes,
        unmapped_products: overview.unmapped_products, payment_methods: method_totals,
        warnings: vec!["Consulta de importação gravada localmente. O relatório de produtos não traz período independente; o mês foi validado contra o relatório de pagamentos ao importar.".into()],
    })
}

fn insert_import(tx: &rusqlite::Transaction<'_>, period_id: i64, kind: &str, file: &importer::OriginalFile,
        headers: &[String], period: Option<&str>, row_count: usize, total_cents: i64, status: &str) -> Result<i64, String> {
    tx.execute("INSERT INTO imports(store_id, period_id, kind, filename, file_sha256, file_size_bytes, original_bytes, original_headers_json, detected_period, parser_version, record_count, total_cents, status) VALUES (1,?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![period_id,kind,file.filename,file.sha256,file.raw_bytes.len() as i64,&file.raw_bytes,serde_json::to_string(headers).map_err(|e|e.to_string())?,period,importer::PARSER_VERSION,row_count as i64,total_cents,status]).map_err(|e|e.to_string())?;
    Ok(tx.last_insert_rowid())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    fn fixture(name: &str) -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures").join(name) }
    #[test]
    fn stores_reconciled_september_and_blocks_duplicate() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = open_database(&temp.path().join("test.sqlite")).unwrap();
        let summary = save_reports(&mut db, "2026-09",
            importer::parse_products(&fixture("produtos-set-2026.xlsx")).unwrap(),
            importer::parse_payments(&fixture("pagamentos-set-2026.xlsx")).unwrap()).unwrap();
        assert!(summary.reconciled);
        assert_eq!(summary.difference_cents, 0);
        assert_eq!(summary.unmapped_products.len(), 120); // sem cadastro de referência; 29 não podem ser assumidos
        let count: i64 = db.query_row("SELECT COUNT(*) FROM imports", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 2);
        let loaded = load_period_summary(&db, "2026-09").unwrap();
        assert_eq!(loaded.products_total_cents, 2494463);
        assert_eq!(loaded.payments_total_cents, 2494463);
        assert_eq!(loaded.unmapped_products.len(), 120);
        let original_size: i64 = db.query_row("SELECT length(original_bytes) FROM imports WHERE kind='PRODUCTS'", [], |r| r.get(0)).unwrap();
        assert!(original_size > 0);
        let err = save_reports(&mut db, "2026-09",
            importer::parse_products(&fixture("produtos-set-2026.xlsx")).unwrap(),
            importer::parse_payments(&fixture("pagamentos-set-2026.xlsx")).unwrap()).unwrap_err();
        assert!(err.contains("duplicada"));
        let count2: i64 = db.query_row("SELECT COUNT(*) FROM imports", [], |r| r.get(0)).unwrap();
        assert_eq!(count2, 2);
        assert_eq!(db.query_row("PRAGMA foreign_keys", [], |r| r.get::<_,i64>(0)).unwrap(), 1);
    }
    #[test]
    fn rejects_corrupted_persisted_amount_instead_of_showing_false_reconciliation() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = open_database(&temp.path().join("test.sqlite")).unwrap();
        save_reports(&mut db, "2026-09",
            importer::parse_products(&fixture("produtos-set-2026.xlsx")).unwrap(),
            importer::parse_payments(&fixture("pagamentos-set-2026.xlsx")).unwrap()).unwrap();
        db.execute("UPDATE import_product_rows SET value_cents=value_cents+1 WHERE id=(SELECT MIN(id) FROM import_product_rows)", []).unwrap();
        assert!(load_period_summary(&db, "2026-09").unwrap_err().contains("Integridade"));
    }
    #[test]
    fn rejects_missing_rows_even_when_the_summary_totals_exist() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = open_database(&temp.path().join("test.sqlite")).unwrap();
        save_reports(&mut db, "2026-09",
            importer::parse_products(&fixture("produtos-set-2026.xlsx")).unwrap(),
            importer::parse_payments(&fixture("pagamentos-set-2026.xlsx")).unwrap()).unwrap();
        db.execute("DELETE FROM import_payment_rows WHERE id=(SELECT MIN(id) FROM import_payment_rows)", []).unwrap();
        assert!(load_period_summary(&db, "2026-09").unwrap_err().contains("Integridade"));
    }
    #[test]
    fn rejects_modified_original_bytes_after_import() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = open_database(&temp.path().join("test.sqlite")).unwrap();
        save_reports(&mut db, "2026-09",
            importer::parse_products(&fixture("produtos-set-2026.xlsx")).unwrap(),
            importer::parse_payments(&fixture("pagamentos-set-2026.xlsx")).unwrap()).unwrap();
        db.execute("UPDATE imports SET original_bytes=x'00' WHERE kind='PAYMENTS'", []).unwrap();
        assert!(load_period_summary(&db, "2026-09").unwrap_err().contains("Integridade"));
    }
    #[test]
    fn upgrade_v9_preserves_existing_mapping_and_adds_financial_parameters(){
        let t=tempfile::tempdir().unwrap();
        let path=t.path().join("migration.sqlite");
        {
            let db=open_database(&path).unwrap();
            db.execute("INSERT INTO products(store_id,display_name) VALUES(1,'Produto anterior')",[]).unwrap();
            db.execute("INSERT INTO product_external_codes(store_id,product_id,external_code) VALUES(1,1,'TESTE_ANTIGO')",[]).unwrap();
            db.execute_batch("DROP TRIGGER IF EXISTS forbid_financial_rule_version_update; DROP TRIGGER IF EXISTS forbid_financial_rule_version_delete; DROP TABLE financial_rule_versions; DROP TABLE financial_rules; PRAGMA user_version=9;").unwrap();
        }
        let db=open_database(&path).unwrap();
        let version:i64=db.pragma_query_value(None,"user_version",|row|row.get(0)).unwrap();
        assert_eq!(version,11);
        let mapping:i64=db.query_row("SELECT COUNT(*) FROM product_external_codes WHERE external_code='TESTE_ANTIGO'",[],|r|r.get(0)).unwrap();
        assert_eq!(mapping,1);
        let rules:i64=db.query_row("SELECT COUNT(*) FROM financial_rule_versions WHERE effective_from='2026-09'",[],|r|r.get(0)).unwrap();
        assert_eq!(rules,7);
        let reopened=open_database(&path).unwrap();
        let rules_after:i64=reopened.query_row("SELECT COUNT(*) FROM financial_rule_versions",[],|r|r.get(0)).unwrap();
        assert_eq!(rules_after,7);
    }
    #[test]
    fn period_mismatch_is_atomic() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = open_database(&temp.path().join("test.sqlite")).unwrap();
        assert!(save_reports(&mut db, "2026-08",
            importer::parse_products(&fixture("produtos-set-2026.xlsx")).unwrap(),
            importer::parse_payments(&fixture("pagamentos-set-2026.xlsx")).unwrap()).is_err());
        let count: i64 = db.query_row("SELECT COUNT(*) FROM imports", [], |r|r.get(0)).unwrap();
        assert_eq!(count, 0);
    }
    #[test]
    fn divergent_totals_are_visible_and_persisted_as_such() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = open_database(&temp.path().join("test.sqlite")).unwrap();
        let summary = save_reports(&mut db, "2026-09",
            importer::parse_products(&fixture("produtos-set-2026.xlsx")).unwrap(),
            importer::parse_payments(&fixture("pagamentos-divergentes.xlsx")).unwrap()).unwrap();
        assert!(!summary.reconciled);
        // A fixture sintetica difere em R$ 1,00; o valor deve permanecer negativo.
        assert_eq!(summary.difference_cents, -100);
        let stored = load_period_summary(&db, "2026-09").unwrap();
        assert!(!stored.reconciled);
        assert_eq!(stored.difference_cents, -100);
        let status: String = db.query_row("SELECT status FROM periods WHERE year_month='2026-09'", [], |r| r.get(0)).unwrap();
        assert_eq!(status, "DIVERGENTE");
    }
    #[test]
    fn mapped_product_can_be_detected_by_external_code() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = open_database(&temp.path().join("test.sqlite")).unwrap();
        db.execute("INSERT INTO products(store_id, display_name) VALUES (1, 'Cappuccino Brasileiro')", []).unwrap();
        db.execute("INSERT INTO product_external_codes(store_id, product_id, external_code) VALUES (1, 1, '1021')", []).unwrap();
        let summary = save_reports(&mut db, "2026-09",
            importer::parse_products(&fixture("produtos-set-2026.xlsx")).unwrap(),
            importer::parse_payments(&fixture("pagamentos-set-2026.xlsx")).unwrap()).unwrap();
        assert_eq!(summary.mapped_product_codes, 1);
        assert_eq!(summary.unmapped_products.len(), 119);
    }
}
