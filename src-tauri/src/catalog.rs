//! Importação opcional da Base DRE histórica: mapeamento de códigos, SEM copiar CMV.
use crate::importer::{self, OriginalFile, UnmappedProduct};
use calamine::{open_workbook_auto_from_rs, Data, Reader};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::{BTreeMap, BTreeSet}, io::Cursor, path::Path};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

const SOURCE_SHEET: &str = "Base DRE";

#[derive(Debug)]
pub struct LegacyRow {
    pub row_number: usize,
    pub raw: Vec<String>,
    pub external_code: Option<String>,
    pub name: String,
    pub category: String,
    pub issue: Option<String>,
}
#[derive(Debug)]
pub struct LegacyCatalog {
    pub file: OriginalFile,
    pub rows: Vec<LegacyRow>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogImportSummary {
    pub filename: String,
    pub mapped_codes_imported: usize,
    pub skipped_rows: usize,
    pub warning: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MappingOverview {
    pub sold_product_codes: usize,
    pub mapped_product_codes: usize,
    pub unmapped_products: Vec<UnmappedProduct>,
}
/// Estado persistido do catálogo após reiniciar a aplicação.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogStatus {
    pub loaded: bool,
    pub filename: Option<String>,
    pub valid_codes: usize,
    pub skipped_rows: usize,
}

pub fn catalog_status(db: &Connection) -> Result<CatalogStatus, String> {
    let existing: Option<(i64, String, i64, i64, i64, String, Vec<u8>)> = db.query_row(
        "SELECT id,filename,valid_rows,skipped_rows,file_size_bytes,file_sha256,original_bytes \
         FROM legacy_catalog_imports WHERE store_id=1 LIMIT 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                 row.get(4)?, row.get(5)?, row.get(6)?)),
    ).optional().map_err(|e| format!("Falha ao consultar catálogo de referência: {e}"))?;
    match existing {
        Some((id, filename, valid, skipped, declared_size, hash, raw_bytes)) => {
            let bytes_size = i64::try_from(raw_bytes.len()).map_err(|_| "Catálogo grande demais")?;
            if bytes_size != declared_size || format!("{:x}", Sha256::digest(&raw_bytes)) != hash {
                return Err("Integridade do catálogo legado comprometida: conteúdo original alterado.".into());
            }
            let (rows_valid, rows_skipped): (i64, i64) = db.query_row(
                "SELECT COALESCE(SUM(CASE WHEN is_skipped=0 THEN 1 ELSE 0 END),0), \
                        COALESCE(SUM(CASE WHEN is_skipped=1 THEN 1 ELSE 0 END),0) \
                 FROM legacy_catalog_rows WHERE catalog_import_id=?1",
                [id], |r| Ok((r.get(0)?, r.get(1)?)),
            ).map_err(|e| e.to_string())?;
            if rows_valid != valid || rows_skipped != skipped {
                return Err("Integridade do catálogo legado comprometida: quantidade de registros divergente.".into());
            }
            Ok(CatalogStatus {
                loaded: true, filename: Some(filename),
                valid_codes: usize::try_from(valid).map_err(|_| "Quantidade inválida no catálogo")?,
                skipped_rows: usize::try_from(skipped).map_err(|_| "Quantidade inválida no catálogo")?,
            })
        }
        None => Ok(CatalogStatus {
            loaded: false, filename: None, valid_codes: 0, skipped_rows: 0,
        }),
    }
}

fn key(input: &str) -> String {
    input.nfd().filter(|c| !is_combining_mark(*c))
        .collect::<String>().to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ")
}
fn text(cell: &Data) -> String {
    match cell { Data::Empty => String::new(), Data::String(s) => s.trim().into(), _ => cell.to_string().trim().into() }
}
fn external_code(cell: &Data) -> Option<String> {
    match cell {
        Data::Int(v) if *v > 0 => Some(v.to_string()),
        Data::Float(v) if v.is_finite() && *v > 0.0 && v.fract() == 0.0 && *v <= (i64::MAX as f64) => Some(format!("{v:.0}")),
        Data::String(s) if !s.trim().is_empty() && !s.trim().starts_with('0') && s.trim().chars().all(|c| c.is_ascii_digit()) => Some(s.trim().to_owned()),
        _ => None,
    }
}
pub fn parse_legacy_catalog(path: &Path) -> Result<LegacyCatalog, String> {
    // Primeiro validar e preservar os bytes reais, nunca usar fórmulas de custo da Base DRE.
    let file = importer::original_file(path)?;
    let mut wb = open_workbook_auto_from_rs(Cursor::new(file.raw_bytes.as_slice()))
        .map_err(|e| format!("Planilha de referência ilegível: {e}"))?;
    if !wb.sheet_names().iter().any(|s| s == SOURCE_SHEET) {
        return Err("Planilha consolidada sem aba obrigatória 'Base DRE'.".into());
    }
    let range = wb.worksheet_range(SOURCE_SHEET).map_err(|e| e.to_string())?;
    let offset = range.start().map(|s| s.0 as usize).unwrap_or(0);
    let mut header: Option<(usize, usize, usize, usize)> = None;
    for (index, row) in range.rows().take(30).enumerate() {
        let column = |label: &str| row.iter().position(|c| key(&text(c)) == label);
        if let (Some(name), Some(code), Some(category)) = (column("produto"), column("codigo"), column("categoria")) {
            if name == code || name == category || code == category { return Err("Cabeçalhos ambíguos em Base DRE.".into()); }
            header = Some((index, name, code, category));
            break;
        }
    }
    let (header_index, name_col, code_col, category_col) = header.ok_or("Cabeçalhos Produto, Código e Categoria não encontrados em Base DRE.")?;
    let mut rows = Vec::new();
    let mut used_codes = BTreeSet::new();
    for (index, row) in range.rows().enumerate().skip(header_index + 1) {
        if rows.len() > 10_000 { return Err("Catálogo acima do limite de 10.000 linhas.".into()); }
        let name = row.get(name_col).map(text).unwrap_or_default();
        if name.is_empty() { continue; }
        // O consolidado contém rodapé "Total Unitário" em B152, não é produto.
        if key(&name) == "total unitario" && row.get(code_col).map(text).unwrap_or_default().is_empty() {
            break;
        }
        let raw_code = row.get(code_col).unwrap_or(&Data::Empty);
        let code = external_code(raw_code);
        let category = row.get(category_col).map(text).unwrap_or_default();
        let issue = if code.is_none() {
            Some(format!("Código inválido ou ausente ({}) — cadastro não mapeado", text(raw_code)))
        } else if category.is_empty() {
            return Err(format!("Linha {}: categoria ausente em cadastro com código válido.", offset + index + 1));
        } else { None };
        if let Some(ref c) = code {
            if !used_codes.insert(c.clone()) { return Err(format!("Código externo duplicado na Base DRE: {c}.")); }
        }
        rows.push(LegacyRow { row_number: offset + index + 1, raw: row.iter().map(text).collect(), external_code: code, name, category, issue });
    }
    if !rows.iter().any(|r| r.external_code.is_some()) { return Err("Base DRE sem códigos válidos.".into()); }
    Ok(LegacyCatalog { file, rows })
}

pub fn save_legacy_catalog(db: &mut Connection, catalog: LegacyCatalog) -> Result<CatalogImportSummary, String> {
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let exists: i64 = tx.query_row("SELECT COUNT(*) FROM legacy_catalog_imports WHERE store_id=1", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if exists != 0 {
        return Err("Já existe um catálogo legado nesta loja; substituição controlada ainda não está disponível. Nenhum código foi sobrescrito.".into());
    }
    let valid = catalog.rows.iter().filter(|r| r.issue.is_none()).count();
    let skipped = catalog.rows.len() - valid;
    tx.execute("INSERT INTO legacy_catalog_imports(store_id,filename,file_sha256,file_size_bytes,original_bytes,valid_rows,skipped_rows) VALUES(1,?1,?2,?3,?4,?5,?6)",
        params![catalog.file.filename,catalog.file.sha256,catalog.file.raw_bytes.len() as i64,&catalog.file.raw_bytes,valid as i64,skipped as i64])
        .map_err(|e| e.to_string())?;
    let catalog_id = tx.last_insert_rowid();
    for row in &catalog.rows {
        let product_id = if let Some(ref code) = row.external_code {
            let existing: Option<i64> = tx.query_row("SELECT product_id FROM product_external_codes WHERE store_id=1 AND external_code=?1", [code], |r| r.get(0))
                .optional().map_err(|e| e.to_string())?;
            if let Some(id) = existing { Some(id) } else {
                tx.execute("INSERT INTO products(store_id,display_name,category_name) VALUES (1,?1,?2)", params![row.name,row.category]).map_err(|e| e.to_string())?;
                let id = tx.last_insert_rowid();
                tx.execute("INSERT INTO product_external_codes(store_id,product_id,external_code) VALUES (1,?1,?2)", params![id,code]).map_err(|e| e.to_string())?;
                Some(id)
            }
        } else { None };
        tx.execute("INSERT INTO legacy_catalog_rows(catalog_import_id,source_sheet,source_row,raw_cells_json,external_code,imported_product_id,is_skipped,issue) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![catalog_id,SOURCE_SHEET,row.row_number as i64,serde_json::to_string(&row.raw).map_err(|e| e.to_string())?,row.external_code,product_id,i64::from(row.issue.is_some()),row.issue])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(CatalogImportSummary {
        filename: catalog.file.filename,
        mapped_codes_imported: valid,
        skipped_rows: skipped,
        warning: "Somente códigos, nomes e categorias históricas foram aproveitados. CMV, receitas e custos não foram cadastrados ou validados.".into(),
    })
}

pub fn mapping_overview(db: &Connection, period: &str) -> Result<MappingOverview, String> {
    let mut statement = db.prepare("SELECT r.external_code,r.product_name,r.category_name,r.quantity,r.value_cents
        FROM import_product_rows r JOIN imports i ON i.id=r.import_id JOIN periods p ON p.id=i.period_id
        WHERE p.store_id=1 AND p.year_month=?1 AND i.kind='PRODUCTS' AND r.row_type='SALE'")
        .map_err(|e| e.to_string())?;
    let mut candidates: BTreeMap<String, UnmappedProduct> = BTreeMap::new();
    let data = statement.query_map([period], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,i64>(3)?,r.get::<_,i64>(4)?)))
        .map_err(|e| e.to_string())?;
    for item in data {
        let (code, name, category, quantity, cents) = item.map_err(|e| e.to_string())?;
        let entry = candidates.entry(code.clone()).or_insert(UnmappedProduct { external_code: code, name, category, quantity: 0, sales_cents: 0 });
        entry.quantity = entry.quantity.checked_add(quantity).ok_or("Soma de quantidades excedeu limite")?;
        entry.sales_cents = entry.sales_cents.checked_add(cents).ok_or("Soma de vendas excedeu limite")?;
    }
    if candidates.is_empty() { return Err("Nenhum relatório de produtos importado para esta competência.".into()); }
    let mut unmapped = Vec::new();
    for (code, entry) in &candidates {
        let exists: Option<i64> = db.query_row("SELECT product_id FROM product_external_codes WHERE store_id=1 AND external_code=?1", [code], |r| r.get(0))
            .optional().map_err(|e| e.to_string())?;
        if exists.is_none() { unmapped.push(entry.clone()); }
    }
    Ok(MappingOverview { sold_product_codes: candidates.len(), mapped_product_codes: candidates.len() - unmapped.len(), unmapped_products: unmapped })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;
    fn fixture() -> std::path::PathBuf { Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/base-dre-set-2026.xlsx") }
    #[test]
    fn legacy_catalog_respects_n_a_and_135_codes() {
        let data = parse_legacy_catalog(&fixture()).unwrap();
        assert_eq!(data.rows.iter().filter(|r| r.issue.is_none()).count(), 135);
        assert_eq!(data.rows.iter().filter(|r| r.issue.is_some()).count(), 14);
    }
    #[test]
    fn persisted_catalog_status_survives_reopening_sqlite() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("catalog-status.sqlite");
        {
            let mut db = database::open_database(&file).unwrap();
            assert!(!catalog_status(&db).unwrap().loaded);
            save_legacy_catalog(&mut db, parse_legacy_catalog(&fixture()).unwrap()).unwrap();
        }
        let db = database::open_database(&file).unwrap();
        let status = catalog_status(&db).unwrap();
        assert!(status.loaded);
        assert_eq!(status.valid_codes, 135);
        assert_eq!(status.skipped_rows, 14);
        assert_eq!(status.filename.as_deref(), Some("base-dre-set-2026.xlsx"));
    }
    #[test]
    fn persisted_catalog_corruption_is_not_silently_displayed() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = database::open_database(&temp.path().join("corrupted.sqlite")).unwrap();
        save_legacy_catalog(&mut db, parse_legacy_catalog(&fixture()).unwrap()).unwrap();
        db.execute("UPDATE legacy_catalog_imports SET original_bytes=x'01'", []).unwrap();
        assert!(catalog_status(&db).unwrap_err().contains("Integridade"));
    }
    #[test]
    fn persisted_catalog_missing_row_is_not_silently_displayed() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = database::open_database(&temp.path().join("lost-row.sqlite")).unwrap();
        save_legacy_catalog(&mut db, parse_legacy_catalog(&fixture()).unwrap()).unwrap();
        db.execute("DELETE FROM legacy_catalog_rows WHERE id=(SELECT MIN(id) FROM legacy_catalog_rows)", []).unwrap();
        assert!(catalog_status(&db).unwrap_err().contains("Integridade"));
    }
    #[test]
    fn external_code_trims_text_but_rejects_invalid_formats() {
        assert_eq!(external_code(&Data::String(" 10113 ".into())).as_deref(), Some("10113"));
        assert!(external_code(&Data::String("00113".into())).is_none());
        assert!(external_code(&Data::String("#N/A".into())).is_none());
    }
    #[test]
    fn after_reference_catalog_29_sold_codes_remain_unmapped() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = database::open_database(&temp.path().join("data.sqlite")).unwrap();
        let c = parse_legacy_catalog(&fixture()).unwrap();
        let saved = save_legacy_catalog(&mut db, c).unwrap();
        assert_eq!(saved.mapped_codes_imported, 135);
        assert_eq!(saved.skipped_rows, 14);
        assert!(save_legacy_catalog(&mut db, parse_legacy_catalog(&fixture()).unwrap()).is_err());
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures");
        database::save_reports(&mut db, "2026-09",
            importer::parse_products(&dir.join("produtos-set-2026.xlsx")).unwrap(),
            importer::parse_payments(&dir.join("pagamentos-set-2026.xlsx")).unwrap()).unwrap();
        let stats = mapping_overview(&db, "2026-09").unwrap();
        assert_eq!(stats.sold_product_codes, 120);
        assert_eq!(stats.mapped_product_codes, 91);
        assert_eq!(stats.unmapped_products.len(), 29);
        assert_eq!(stats.unmapped_products.iter().map(|p| p.sales_cents).sum::<i64>(), 365370);
    }
}
