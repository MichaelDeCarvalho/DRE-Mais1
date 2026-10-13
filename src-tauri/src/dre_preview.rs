//! Previa gerencial somente leitura. Nao fecha DRE e nao supoe despesas.
use rusqlite::Connection;
use serde::Serialize;
use crate::{database,recipes,expenses,financial_rules};

#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct DrePreview {
 pub period:String,
 pub revenue_cents:i64,
 pub payments_cents:i64,
 pub difference_cents:i64,
 pub reconciled:bool,
 pub approved_cmv_cents:Option<f64>,
 pub contribution_before_other_expenses_cents:Option<f64>,
 pub pending_product_codes:usize,
 pub approved_product_codes:usize,
 pub status:String,
 pub unregistered_components:Vec<String>,
 pub recorded_variable_cents:i64,
 pub recorded_fixed_cents:i64,
 pub recorded_tax_cents:i64,
 pub recorded_expense_count:usize,
 pub estimated_royalties_cents:i64,
 pub estimated_payment_fees:Vec<financial_rules::PaymentFeeEstimate>,
}
pub fn preview(db:&Connection,period:&str)->Result<DrePreview,String>{
 let sales=database::load_period_summary(db,period)?;
 let registered=expenses::list(db,period)?;
 let royalties=financial_rules::royalties_cents(sales.products_total_cents)?;
 let fees=financial_rules::calculate_fees(&sales.payment_methods)?;
 let mut variable=0_i64;let mut fixed=0_i64;let mut tax=0_i64;
 for x in &registered {let bucket=match x.expense_kind.as_str(){"VARIAVEL"=>&mut variable,"FIXA"=>&mut fixed,"TRIBUTO"=>&mut tax,_=>return Err("Tipo de despesa desconhecido".into())};*bucket=bucket.checked_add(x.amount_cents).ok_or("Total de despesas excedeu limite")?;}
 let coverage=recipes::monthly_cmv_summary(db,period)?;
 let complete=sales.reconciled&&coverage.complete&&coverage.product_codes==sales.sold_product_codes;
 let approved_cmv=if complete{Some(coverage.approved_cost_cents)}else{None};
 let contribution=approved_cmv.map(|v|sales.products_total_cents as f64-v);
 Ok(DrePreview{
  period:period.into(),revenue_cents:sales.products_total_cents,payments_cents:sales.payments_total_cents,
  difference_cents:sales.difference_cents,reconciled:sales.reconciled,
  approved_cmv_cents:approved_cmv,contribution_before_other_expenses_cents:contribution,
  pending_product_codes:coverage.pending_codes,
  approved_product_codes:coverage.approved_codes,
  status:if !sales.reconciled{"RECONCILIACAO_PENDENTE"}else if !complete{"CMV_INCOMPLETO"}else{"CMV_APROVADO_DRE_INCOMPLETA"}.into(),
  estimated_royalties_cents:royalties,estimated_payment_fees:fees,
  recorded_variable_cents:variable,recorded_fixed_cents:fixed,recorded_tax_cents:tax,recorded_expense_count:registered.len(),
  unregistered_components:vec!["Despesas variaveis e taxas".into(),"Tributos".into(),"Despesas fixas".into(),"Estoque fisico e CMV contabil".into()],
 })
}
#[cfg(test)]
mod tests{
 use super::*;
 use crate::importer;
 #[test]fn missing_recipes_block_dre_cmv(){
  let temp=tempfile::tempdir().unwrap();let mut db=database::open_database(&temp.path().join("dre.sqlite")).unwrap();
  let dir=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures");
  database::save_reports(&mut db,"2026-09",
   importer::parse_products(&dir.join("produtos-set-2026.xlsx")).unwrap(),
   importer::parse_payments(&dir.join("pagamentos-set-2026.xlsx")).unwrap()).unwrap();
  let view=preview(&db,"2026-09").unwrap();
  assert!(view.reconciled);
  assert_eq!(view.revenue_cents,2494463);
  assert_eq!(view.pending_product_codes,120);
  assert!(view.approved_cmv_cents.is_none());
  assert!(view.contribution_before_other_expenses_cents.is_none());
  assert_eq!(view.status,"CMV_INCOMPLETO");
  assert_eq!(view.recorded_expense_count,0);
  assert_eq!(view.estimated_royalties_cents,174612);
 }
}
