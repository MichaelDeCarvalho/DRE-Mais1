use calamine::{open_workbook_auto_from_rs, Data, Range, Reader};
use regex::Regex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::{BTreeMap, BTreeSet}, fs, io::Cursor, path::Path};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

pub const PARSER_VERSION: &str = "2026-10-m1.3";
pub const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct OriginalFile {
    pub filename: String,
    pub raw_bytes: Vec<u8>,
    pub sha256: String,
}
#[derive(Debug, Clone)]
pub struct ProductRow {
    pub sheet: String,
    pub source_row: usize,
    pub original_cells: Vec<String>,
    pub external_code: Option<String>,
    pub name: String,
    pub category: String,
    pub quantity: i64,
    pub value_cents: i64,
    pub row_type: &'static str,
}
#[derive(Debug, Clone)]
pub struct PaymentRow {
    pub sheet: String,
    pub source_row: usize,
    pub original_cells: Vec<String>,
    pub raw_method: String,
    pub normalized_method: &'static str,
    pub entry_type: &'static str,
    pub period: String,
    pub value_cents: i64,
}
#[derive(Debug)]
pub struct ProductReport {
    pub file: OriginalFile,
    pub headers: Vec<String>,
    pub rows: Vec<ProductRow>,
    pub total_cents: i64,
    pub positive_cents: i64,
    pub adjustments_cents: i64,
    pub warnings: Vec<String>,
}
#[derive(Debug)]
pub struct PaymentReport {
    pub file: OriginalFile,
    pub headers: Vec<String>,
    pub rows: Vec<PaymentRow>,
    pub period: String,
    pub total_cents: i64,
    pub warnings: Vec<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodTotal {
    pub code: String,
    pub label: String,
    pub total_cents: i64,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnmappedProduct {
    pub external_code: String,
    pub name: String,
    pub category: String,
    pub quantity: i64,
    pub sales_cents: i64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub period: String,
    pub payment_report_period: String,
    pub products_report_has_independent_period: bool,
    pub products_total_cents: i64,
    pub payments_total_cents: i64,
    pub difference_cents: i64,
    pub reconciled: bool,
    pub positive_sales_cents: i64,
    pub adjustments_cents: i64,
    pub product_rows: usize,
    pub payment_rows: usize,
    pub sold_product_codes: usize,
    pub mapped_product_codes: usize,
    pub unmapped_products: Vec<UnmappedProduct>,
    pub payment_methods: Vec<MethodTotal>,
    pub warnings: Vec<String>,
}

fn label_key(s: &str) -> String {
    s.nfd().filter(|c| !is_combining_mark(*c))
        .collect::<String>().to_lowercase()
        .split_whitespace().collect::<Vec<_>>().join(" ")
}
fn cell_text(data: &Data) -> String {
    match data {
        Data::Empty => String::new(),
        Data::String(s) => s.trim().to_string(),
        _ => data.to_string().trim().to_string(),
    }
}
fn is_empty_row(row: &[Data]) -> bool { row.iter().all(|c| cell_text(c).is_empty()) }
fn value_at<'a>(row: &'a [Data], col: usize) -> &'a Data {
    row.get(col).unwrap_or(&Data::Empty)
}
fn required_text(row: &[Data], col: usize, line: usize, field: &str) -> Result<String, String> {
    let s = cell_text(value_at(row, col));
    if s.is_empty() { Err(format!("Linha {line}: campo '{field}' obrigatório ausente.")) } else { Ok(s) }
}
fn integer_at(row: &[Data], col: usize, line: usize, field: &str) -> Result<i64, String> {
    let raw = required_text(row, col, line, field)?;
    let f = raw.parse::<f64>().map_err(|_| format!("Linha {line}: '{field}' inválido: {raw}"))?;
    if !f.is_finite() || f < 0.0 || f > i64::MAX as f64 || f.fract() != 0.0 {
        return Err(format!("Linha {line}: '{field}' não é inteiro não negativo: {raw}"));
    }
    Ok(f as i64)
}
fn parse_money(raw: &str) -> Result<i64, String> {
    let value = raw.trim().replace("R$", "").replace('\u{a0}', "").replace(' ', "");
    if value.is_empty() { return Err("valor monetário vazio".to_string()); }
    let (sign, digits) = if let Some(v) = value.strip_prefix('-') { (-1_i64, v) }
        else if let Some(v) = value.strip_prefix('+') { (1_i64, v) } else { (1_i64, value.as_str()) };
    let normalized = if digits.contains(',') {
        let (whole, fractional) = digits.split_once(',').ok_or("formato monetário inválido")?;
        if fractional.contains(',') || fractional.is_empty() || fractional.len() > 2 ||
           !fractional.chars().all(|c| c.is_ascii_digit()) {
            return Err(format!("centavos inválidos: {raw}"));
        }
        let groups: Vec<_> = whole.split('.').collect();
        if groups.len() > 1 && (groups[0].is_empty() || groups[0].len() > 3 ||
            groups.iter().skip(1).any(|group| group.len() != 3)) {
            return Err(format!("separador de milhares inválido: {raw}"));
        }
        if groups.iter().any(|g| !g.chars().all(|c| c.is_ascii_digit())) {
            return Err(format!("valor monetário inválido: {raw}"));
        }
        format!("{}.{}", groups.concat(), fractional)
    } else {
        // Sem vírgula, só aceitar ponto como separador decimal quando não ambíguo.
        // "1.234" não pode ser interpretado silenciosamente como 1,23 ou 1234.
        if digits.matches('.').count() > 1 || digits.split_once('.').is_some_and(|(_, dec)| dec.len() > 2) {
            return Err(format!("valor monetário ambíguo: {raw}"));
        }
        digits.to_string()
    };
    let chunks: Vec<_> = normalized.split('.').collect();
    if chunks.len() > 2 || chunks[0].is_empty() || chunks.iter().any(|c| c.chars().any(|x| !x.is_ascii_digit())) {
        return Err(format!("valor monetário inválido: {raw}"));
    }
    let cents = match chunks.get(1) {
        None => 0,
        Some(dec) if dec.is_empty() => return Err(format!("centavos inválidos: {raw}")),
        Some(dec) if dec.len() == 1 => dec.parse::<i64>().map_err(|_| format!("centavos inválidos: {raw}"))? * 10,
        Some(dec) if dec.len() == 2 => dec.parse::<i64>().map_err(|_| format!("centavos inválidos: {raw}"))?,
        _ => return Err(format!("centavos inválidos: {raw}")),
    };
    let whole = chunks[0].parse::<i64>().map_err(|_| format!("valor alto demais: {raw}"))?;
    whole.checked_mul(100).and_then(|v| v.checked_add(cents))
        .and_then(|v| v.checked_mul(sign))
        .ok_or_else(|| format!("valor monetário excede o limite: {raw}"))
}

fn money_at(row: &[Data], col: usize, line: usize) -> Result<i64, String> {
    let cell = value_at(row, col);
    match cell {
        Data::Float(v) => {
            let cents = v * 100.0;
            if !cents.is_finite() || cents.abs() > (i64::MAX as f64) || (cents - cents.round()).abs() > 0.00001 {
                return Err(format!("Linha {line}: valor inválido, com fração de centavo: {v}"));
            }
            Ok(cents.round() as i64)
        }
        Data::Int(v) => v.checked_mul(100).ok_or_else(|| format!("Linha {line}: valor monetário excede limite")),
        Data::Error(_) | Data::Empty => Err(format!("Linha {line}: valor monetário ausente ou erro de planilha.")),
        _ => parse_money(&cell_text(cell)).map_err(|e| format!("Linha {line}: {e}")),
    }
}
pub(crate) fn original_file(path: &Path) -> Result<OriginalFile, String> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if ext != "xls" && ext != "xlsx" { return Err("Formato inválido. Selecione XLS ou XLSX.".into()); }
    let metadata = fs::metadata(path).map_err(|e| format!("Arquivo inacessível: {e}"))?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_FILE_BYTES {
        return Err("Arquivo vazio, não regular ou maior que 20 MB.".into());
    }
    let raw_bytes = fs::read(path).map_err(|e| format!("Não foi possível ler arquivo local: {e}"))?;
    if raw_bytes.is_empty() || raw_bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("O arquivo foi modificado durante a leitura ou excedeu 20 MB.".into());
    }
    let sha256 = format!("{:x}", Sha256::digest(&raw_bytes));
    let filename = path.file_name().map(|x| x.to_string_lossy().into_owned())
        .ok_or("O nome do arquivo é inválido.")?;
    Ok(OriginalFile { filename, raw_bytes, sha256 })
}
fn column_index(header: &[Data], target: &str) -> Option<usize> {
    header.iter().position(|c| {
        let key = label_key(&cell_text(c));
        match target {
            "product_code" => key == "id",
            "product_name" => key == "produto",
            "product_category" => key == "categoria",
            "product_quantity" => key == "quantidade",
            "value" => key == "valor",
            "payment_method" => key == "metodo de pagamento",
            "total" => key == "total",
            _ => false,
        }
    })
}
fn validate_unique_required_headers(row: &[Data], fields: &[(&str, &str)], sheet: &str) -> Result<(), String> {
    for (field, human_name) in fields {
        let repeats = row.iter().filter(|cell| {
            column_index(std::slice::from_ref(*cell), field).is_some()
        }).count();
        if repeats > 1 {
            return Err(format!("Coluna obrigatória duplicada: {human_name} (aba {sheet})."));
        }
    }
    Ok(())
}
fn find_table(file: &OriginalFile, fields: &[(&str, &str)]) -> Result<(String, Vec<String>, Vec<(usize, Vec<Data>)>, BTreeMap<String, usize>), String> {
    // A fonte do parser é a MESMA sequência de bytes preservada no SQLite.
    // Abrir novamente o caminho permitiria que uma edição concorrente gerasse
    // hash de um arquivo e valores processados de outro (TOCTOU).
    let mut workbook = open_workbook_auto_from_rs(Cursor::new(file.raw_bytes.as_slice()))
        .map_err(|e| format!("Não foi possível abrir a planilha: {e}"))?;
    let mut found = Vec::new();
    for name in workbook.sheet_names().to_vec() {
        let sheet: Range<Data> = workbook.worksheet_range(&name)
            .map_err(|e| format!("Erro na aba '{name}': {e}"))?;
        for (idx, row) in sheet.rows().take(50).enumerate() {
            if let Some(indices) = fields.iter().map(|(id, _)| column_index(row, id).map(|x| ((*id).to_string(), x)))
                .collect::<Option<BTreeMap<_, _>>>() {
                validate_unique_required_headers(row, fields, &name)?;
                let offset = sheet.start().map(|p| p.0 as usize).unwrap_or(0);
                let physical_header_row = offset + idx + 1;
                let headers = row.iter().map(cell_text).collect::<Vec<_>>();
                let rows = sheet.rows().skip(idx + 1).enumerate()
                    .filter(|(_, r)| !is_empty_row(r))
                    .map(|(i, r)| (physical_header_row + i + 1, r.to_vec()))
                    .collect::<Vec<_>>();
                found.push((name.clone(), headers, rows, indices));
                break;
            }
        }
    }
    if found.len() > 1 { return Err("Foram encontradas várias abas com cabeçalhos compatíveis; selecione relatório sem ambiguidade.".into()); }
    found.pop().ok_or_else(|| format!("Cabeçalhos obrigatórios ausentes. Esperado: {}.",
        fields.iter().map(|(_, label)| *label).collect::<Vec<_>>().join(", ")))
}
fn add_amount(sum: &mut i64, amount: i64) -> Result<(), String> {
    *sum = sum.checked_add(amount).ok_or("Soma monetária excedeu limite de centavos.")?;
    Ok(())
}
fn warn_extra_headers(headers: &[String], known: &[&str]) -> Vec<String> {
    let known = known.iter().map(|s| label_key(s)).collect::<BTreeSet<_>>();
    let extra: Vec<_> = headers.iter().filter(|x| !x.trim().is_empty() && !known.contains(&label_key(x))).cloned().collect();
    if extra.is_empty() { Vec::new() } else { vec![format!("Colunas adicionais preservadas em dados brutos: {}", extra.join(", "))] }
}

pub fn parse_products(path: &Path) -> Result<ProductReport, String> {
    let file = original_file(path)?;
    let (sheet, headers, data, indices) = find_table(&file, &[
        ("product_code", "ID"), ("product_name", "Produto"), ("product_category", "Categoria"),
        ("product_quantity", "Quantidade"), ("value", "Valor")
    ])?;
    let mut rows = Vec::new(); let mut total = 0; let mut positive = 0; let mut adjustments = 0;
    for (line, row) in data {
        let name = required_text(&row, indices["product_name"], line, "Produto")?;
        let category = required_text(&row, indices["product_category"], line, "Categoria")?;
        let code = required_text(&row, indices["product_code"], line, "ID")?;
        let qty = integer_at(&row, indices["product_quantity"], line, "Quantidade")?;
        let cents = money_at(&row, indices["value"], line)?;
        let row_type = if code == "0" {
            if qty != 0 { return Err(format!("Linha {line}: ID 0 não pode representar produto vendido.")); }
            if label_key(&name) == "total de descontos e taxas" && cents <= 0 {
                "ADJUSTMENT"
            } else if label_key(&name) == "vendas lancadas manualmente" && cents == 0 {
                "PLACEHOLDER"
            } else { return Err(format!("Linha {line}: ID 0 com tipo/valor não reconhecido; requer validação.")); }
        } else {
            if !code.chars().all(|c| c.is_ascii_digit()) || code.starts_with('0') || qty == 0 {
                return Err(format!("Linha {line}: código ou quantidade inválidos no produto {name}."));
            }
            "SALE"
        };
        if row_type == "ADJUSTMENT" { add_amount(&mut adjustments, cents)?; }
        if row_type == "SALE" {
            if cents < 0 { return Err(format!("Linha {line}: venda com valor negativo; revisar regra.")); }
            add_amount(&mut positive, cents)?;
        }
        add_amount(&mut total, cents)?;
        rows.push(ProductRow {
            sheet: sheet.clone(), source_row: line, original_cells: row.iter().map(cell_text).collect(),
            external_code: if row_type == "SALE" { Some(code) } else { None },
            name, category, quantity: qty, value_cents: cents, row_type,
        });
    }
    if rows.is_empty() { return Err("Relatório de produtos sem registros.".into()); }
    let warnings = warn_extra_headers(&headers, &["Index", "ID", "Produto", "Categoria", "Copo Reutilizável", "Quantidade", "Itens", "Produtos vendidos", "Interno", "Valor"]);
    Ok(ProductReport { file, headers, rows, total_cents: total, positive_cents: positive, adjustments_cents: adjustments, warnings })
}

fn parse_method(raw: &str) -> Result<(String, &'static str, &'static str), String> {
    let re = Regex::new(r"^\s*(0[1-9]|1[0-2])/(20\d\d)\s*-\s*(.*?)\s*$").expect("regex estática");
    let parts = re.captures(raw).ok_or_else(|| format!("Método sem período válido MM/AAAA: {raw}"))?;
    let period = format!("{}-{}", &parts[2], &parts[1]);
    let (canonical, kind) = match label_key(&parts[3]).as_str() {
        "credito" => ("credit", "STANDARD"), "credito manual" => ("credit", "MANUAL"),
        "debito" => ("debit", "STANDARD"), "debito manual" => ("debit", "MANUAL"),
        "pix" => ("pix", "STANDARD"), "carteira digital" => ("wallet", "STANDARD"),
        "outro" => ("other", "STANDARD"), "dinheiro" => ("cash", "STANDARD"),
        "voucher" => ("voucher", "STANDARD"),
        _ => return Err(format!("PENDENTE DE VALIDAÇÃO: método de pagamento desconhecido '{raw}'")),
    };
    Ok((period, canonical, kind))
}
pub(crate) fn normalized_method_label(code: &str) -> &'static str {
    match code { "credit" => "Crédito", "debit" => "Débito", "pix" => "PIX", "wallet" => "Carteira Digital", "other" => "Outro", "cash" => "Dinheiro", "voucher" => "Voucher", _ => "Desconhecido" }
}
pub fn method_totals(rows: &[PaymentRow]) -> Result<Vec<MethodTotal>, String> {
    let mut totals: BTreeMap<String, i64> = BTreeMap::new();
    for row in rows { add_amount(totals.entry(row.normalized_method.to_string()).or_insert(0), row.value_cents)?; }
    Ok(totals.into_iter().map(|(code, cents)| MethodTotal { label: normalized_method_label(&code).to_string(), code, total_cents: cents }).collect())
}
pub fn parse_payments(path: &Path) -> Result<PaymentReport, String> {
    let file = original_file(path)?;
    let (sheet, headers, data, indices) = find_table(&file, &[("payment_method", "Método de Pagamento"), ("total", "Total")])?;
    let mut rows = Vec::new(); let mut total = 0; let mut period: Option<String> = None;
    for (line, row) in data {
        let method = required_text(&row, indices["payment_method"], line, "Método de Pagamento")?;
        let (found_period, normalized_method, kind) = parse_method(&method)
            .map_err(|e| format!("Linha {line}: {e}"))?;
        if period.as_ref().is_some_and(|p| p != &found_period) {
            return Err(format!("Linha {line}: período {found_period} diverge de {}.", period.as_deref().unwrap_or("")));
        }
        period = Some(found_period.clone());
        let cents = money_at(&row, indices["total"], line)?;
        if cents < 0 { return Err(format!("Linha {line}: valor de método de pagamento negativo requer validação.")); }
        add_amount(&mut total, cents)?;
        rows.push(PaymentRow { sheet: sheet.clone(), source_row: line, original_cells: row.iter().map(cell_text).collect(), raw_method: method,
            normalized_method, entry_type: kind, period: found_period, value_cents: cents });
    }
    if rows.is_empty() { return Err("Relatório de pagamentos sem registros.".into()); }
    let warnings = warn_extra_headers(&headers, &["Método de Pagamento", "Metodo de Pagamento", "Cliente", "Total", "Ticket Médio", "P.A.", "Produto por Atendimento"]);
    Ok(PaymentReport { file, headers, rows, period: period.ok_or("Período não localizado nos métodos de pagamento.")?, total_cents: total, warnings })
}
pub fn validate_selected_period(period: &str, reported: &str) -> Result<(), String> {
    let re = Regex::new(r"^20\d\d-(0[1-9]|1[0-2])$").expect("regex estática");
    if !re.is_match(period) { return Err("Período deve estar no formato AAAA-MM, com mês de 01 a 12.".into()); }
    if period != reported { return Err(format!("Período incompatível: selecionado {period}, pagamentos indicam {reported}. Importação bloqueada.")); }
    Ok(())
}
pub fn collect_unmapped_candidates(rows: &[ProductRow]) -> Result<BTreeMap<String, UnmappedProduct>, String> {
    let mut result: BTreeMap<String, UnmappedProduct> = BTreeMap::new();
    for r in rows.iter().filter(|r| r.row_type == "SALE") {
        let code = r.external_code.as_ref().ok_or("Produto vendido sem código externo")?;
        let entry = result.entry(code.clone()).or_insert_with(|| UnmappedProduct {
            external_code: code.clone(), name: r.name.clone(), category: r.category.clone(),
            quantity: 0, sales_cents: 0,
        });
        entry.quantity = entry.quantity.checked_add(r.quantity).ok_or("Quantidade excedeu limite")?;
        add_amount(&mut entry.sales_cents, r.value_cents)?;
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    #[test] fn money_with_decimals_and_invalid_values() {
        assert_eq!(parse_money("R$ 1.234,56").unwrap(), 123456);
        assert_eq!(parse_money("-3.426,07").unwrap(), -342607);
        assert_eq!(parse_money("12.3").unwrap(), 1230);
        assert_eq!(parse_money("1.234,56").unwrap(), 123456);
        assert!(parse_money("1.234").is_err()); // ambiguidade entre milhar e decimal
        assert!(parse_money("1.23,45").is_err()); // separador de milhar inválido
        assert!(parse_money("1..234,56").is_err());
        assert!(parse_money("3,456").is_err());
        assert!(parse_money("").is_err());
    }
    #[test] fn normalize_with_source_preservation() {
        assert_eq!(parse_method("09/2026 - Crédito Manual").unwrap(), ("2026-09".to_string(), "credit", "MANUAL"));
        assert_eq!(parse_method("09/2026 - Débito Manual").unwrap().1, "debit");
        assert!(parse_method("09/2026 - desconhecido").is_err());
    }
    #[test] fn period_mismatch_is_rejected() {
        assert!(validate_selected_period("2026-08", "2026-09").is_err());
        assert!(validate_selected_period("2026-13", "2026-13").is_err());
    }
    #[test]
    fn duplicate_mandatory_header_is_rejected() {
        let row = vec![
            Data::String("Método de Pagamento".into()),
            Data::String("Total".into()),
            Data::String("TOTAL".into()),
        ];
        assert!(validate_unique_required_headers(&row, &[("payment_method", "Método de Pagamento"), ("total", "Total")], "pagamentos").is_err());
    }
    #[test] fn missing_columns_fail() {
        let row = vec![Data::String("Produto".into()), Data::String("Valor".into())];
        assert!(column_index(&row, "product_code").is_none());
    }
    #[test] fn reject_missing_amount_instead_of_zero() {
        assert!(money_at(&[Data::Empty], 0, 2).is_err());
        assert_eq!(money_at(&[Data::Float(0.0)], 0, 2).unwrap(), 0);
    }
    fn fixture(name: &str) -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures").join(name) }
    #[test] fn september_product_fixture() {
        let p = parse_products(&fixture("produtos-set-2026.xlsx")).unwrap();
        assert_eq!(p.total_cents, 2494463);
        assert_eq!(p.positive_cents, 2837070);
        assert_eq!(p.adjustments_cents, -342607);
        assert_eq!(p.rows.len(), 122);
        assert_eq!(collect_unmapped_candidates(&p.rows).unwrap().len(), 120);
    }
    #[test] fn displaced_header_is_detected() {
        let p = parse_products(&fixture("produtos-cabecalho-deslocado.xlsx")).unwrap();
        assert_eq!(p.total_cents, 2494463);
        assert_eq!(p.rows[0].source_row, 5);
    }
    #[test] fn september_payments_fixture() {
        let p = parse_payments(&fixture("pagamentos-set-2026.xlsx")).unwrap();
        assert_eq!(p.period, "2026-09");
        assert_eq!(p.total_cents, 2494463);
        let map: BTreeMap<_, _> = method_totals(&p.rows).unwrap().into_iter().map(|x| (x.code, x.total_cents)).collect();
        for (key, value) in [("credit", 1137349),("debit",648785),("pix",500959),("wallet",118392),("other",47115),("cash",35790),("voucher",6073)] {
            assert_eq!(map.get(key).copied(), Some(value));
        }
    }
    #[test] fn invalid_structure_rejected() {
        assert!(parse_products(&fixture("missing-column-products.xlsx")).is_err());
        assert!(parse_payments(&fixture("mixed-month-payments.xlsx")).is_err());
        assert!(parse_payments(&fixture("missing-money-payments.xlsx")).is_err());
    }
    #[test]
    fn table_is_read_from_preserved_bytes_not_mutable_disk_path() {
        let file = original_file(&fixture("pagamentos-set-2026.xlsx")).unwrap();
        let path = tempfile::tempdir().unwrap();
        let mutable = path.path().join("pagamentos.xlsx");
        fs::write(&mutable, &file.raw_bytes).unwrap();
        let snapshot = original_file(&mutable).unwrap();
        fs::write(&mutable, b"alterado depois do snapshot").unwrap();
        let (_, _, records, _) = find_table(&snapshot, &[("payment_method", "Método de Pagamento"), ("total", "Total")]).unwrap();
        assert_eq!(records.len(), 9);
        assert_eq!(snapshot.raw_bytes, file.raw_bytes);
    }
    #[test] fn broken_file_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("invalid.xlsx");
        fs::write(&file, b"not an Excel spreadsheet").unwrap();
        assert!(parse_products(&file).is_err());
    }
}
