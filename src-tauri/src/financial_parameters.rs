use rusqlite::{params,Connection,OptionalExtension};
use serde::Serialize;

#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct FinancialRule {
 pub code:String,pub name:String,pub category:String,pub calculation_base:String,
 pub effective_from:Option<String>,pub basis_points:Option<i64>,pub source:Option<String>,
}
fn valid_period(p:&str)->bool {
 let b=p.as_bytes(); b.len()==7 && &b[0..2]==b"20" && b[2..4].iter().all(u8::is_ascii_digit)
 && b[4]==b'-' && b[5..7].iter().all(u8::is_ascii_digit) && (1..=12).contains(&p[5..7].parse::<u8>().unwrap_or(0))
}
pub fn list(db:&Connection,period:&str)->Result<Vec<FinancialRule>,String>{
 if !valid_period(period){return Err("Competência inválida".into());}
 let mut stmt=db.prepare("SELECT r.rule_code,r.display_name,r.category,r.calculation_base,v.effective_from,v.basis_points,v.source FROM financial_rules r LEFT JOIN financial_rule_versions v ON v.id=(SELECT id FROM financial_rule_versions WHERE rule_id=r.id AND effective_from<=?1 ORDER BY effective_from DESC LIMIT 1) ORDER BY r.category,r.display_name").map_err(|e|e.to_string())?;
 let rows=stmt.query_map([period],|x|Ok(FinancialRule{code:x.get(0)?,name:x.get(1)?,category:x.get(2)?,calculation_base:x.get(3)?,effective_from:x.get(4)?,basis_points:x.get(5)?,source:x.get(6)?})).map_err(|e|e.to_string())?;
 rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())
}
pub fn register(db:&mut Connection,code:&str,name:&str,category:&str,base:&str,period:&str,basis_points:i64,source:&str,note:&str)->Result<(),String>{
 if !valid_period(period)||code.is_empty()||code.len()>64||!code.bytes().all(|c|c.is_ascii_uppercase()||c.is_ascii_digit()||c==b'_')
 ||name.trim().is_empty()||name.len()>120||source.trim().is_empty()||source.len()>200||note.len()>500
 ||!(0..=10000).contains(&basis_points)
 ||!["ROYALTIES","PAYMENT_FEE","PLATFORM_FEE","TAX_ESTIMATE","OTHER"].contains(&category)
 ||!["NET_REVENUE","PAYMENT_METHOD","PLATFORM_SALES","DOCUMENTED","MANUAL"].contains(&base)
 {return Err("Parâmetros inválidos. Informe código em maiúsculas, vigência, percentual e origem.".into());}
 let tx=db.transaction().map_err(|e|e.to_string())?;
 let previous:Option<(i64,String,String)>=tx.query_row("SELECT id,category,calculation_base FROM financial_rules WHERE rule_code=?1",[code],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
 let id=if let Some((id,old_category,old_base))=previous{
  if old_category!=category||old_base!=base{return Err("Categoria e base já cadastradas. Crie nova regra para mudar a natureza do cálculo.".into());}
  id
 }else{
  tx.execute("INSERT INTO financial_rules(rule_code,display_name,category,calculation_base) VALUES(?1,?2,?3,?4)",params![code,name.trim(),category,base]).map_err(|e|e.to_string())?;
  tx.last_insert_rowid()
 };
 tx.execute("INSERT INTO financial_rule_versions(rule_id,effective_from,basis_points,source,note) VALUES(?1,?2,?3,?4,?5)",params![id,period,basis_points,source.trim(),note.trim()]).map_err(|_|"Já existe uma versão desta regra para esta competência; histórico preservado.".to_string())?;
 tx.commit().map_err(|e|e.to_string())
}
#[cfg(test)]
mod tests {
 use super::*;use crate::database;
 #[test]fn versions_are_immutable_and_period_resolved(){
 let t=tempfile::tempdir().unwrap();let mut db=database::open_database(&t.path().join("parameters.sqlite")).unwrap();
 assert_eq!(list(&db,"2026-09").unwrap().len(),7);
 register(&mut db,"CREDITO","Crédito","PAYMENT_FEE","PAYMENT_METHOD","2026-11",250,"operador","2,5%").unwrap();
 assert_eq!(list(&db,"2026-10").unwrap().into_iter().find(|x|x.code=="CREDITO").unwrap().basis_points,Some(200));
 assert_eq!(list(&db,"2026-11").unwrap().into_iter().find(|x|x.code=="CREDITO").unwrap().basis_points,Some(250));
 let synthetic=vec![crate::importer::MethodTotal{code:"credit".into(),label:"Crédito".into(),total_cents:10_000}];
 assert_eq!(crate::financial_rules::calculate_configured_fees(&db,"2026-10",&synthetic).unwrap()[0].estimated_fee_cents,Some(200));
 assert_eq!(crate::financial_rules::calculate_configured_fees(&db,"2026-11",&synthetic).unwrap()[0].estimated_fee_cents,Some(250));
 register(&mut db,"ROYALTIES","Royalties","ROYALTIES","NET_REVENUE","2026-11",750,"contrato","teste").unwrap();
 assert_eq!(crate::financial_rules::configured_royalties(&db,"2026-10",10000).unwrap(),700);
 assert_eq!(crate::financial_rules::configured_royalties(&db,"2026-11",10000).unwrap(),750);
 assert!(register(&mut db,"CREDITO","Crédito","PAYMENT_FEE","PAYMENT_METHOD","2026-09",999,"operador","").is_err());
 assert!(db.execute("UPDATE financial_rule_versions SET basis_points=999 WHERE effective_from='2026-09'",[]).is_err());
 assert!(db.execute("DELETE FROM financial_rule_versions",[]).is_err());
 assert!(register(&mut db,"ERRADO","Erro","PAYMENT_FEE","PAYMENT_METHOD","2026-13",100,"operador","").is_err());
 }
}
