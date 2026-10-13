use rusqlite::{params,Connection};
use serde::Serialize;
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Expense{pub id:i64,pub period:String,pub expense_kind:String,pub category:String,pub description:String,pub amount_cents:i64,pub reference:String}
fn valid_period(p:&str)->bool{let v=p.split('-').collect::<Vec<_>>();v.len()==2&&v[0].len()==4&&v[0].chars().all(|c|c.is_ascii_digit())&&v[1].len()==2&&v[1].parse::<u8>().map(|m|(1..=12).contains(&m)).unwrap_or(false)}
pub fn add(db:&mut Connection,period:&str,kind:&str,category:&str,description:&str,amount:i64,reference:&str)->Result<(),String>{
 if !valid_period(period)||!["VARIAVEL","FIXA","TRIBUTO"].contains(&kind)||category.trim().is_empty()||category.len()>120||description.trim().is_empty()||description.len()>200||amount<0||reference.len()>200{return Err("Informe competencia, tipo, categoria, descricao e valor valido em centavos.".into());}
 let tx=db.transaction().map_err(|e|e.to_string())?;
 tx.execute("INSERT INTO managerial_expenses(store_id,period,expense_kind,category,description,amount_cents,reference) VALUES(1,?1,?2,?3,?4,?5,?6)",params![period,kind,category.trim(),description.trim(),amount,reference.trim()])
  .map_err(|_|"Lancamento duplicado ou invalido; nenhuma despesa foi sobrescrita.".to_string())?;
 tx.commit().map_err(|e|e.to_string())
}
pub fn list(db:&Connection,period:&str)->Result<Vec<Expense>,String>{
 if !valid_period(period){return Err("Competencia invalida".into());}
 let mut stmt=db.prepare("SELECT id,period,expense_kind,category,description,amount_cents,reference FROM managerial_expenses WHERE store_id=1 AND period=?1 ORDER BY expense_kind,category,description,id").map_err(|e|e.to_string())?;
 let rows=stmt.query_map([period],|r|Ok(Expense{id:r.get(0)?,period:r.get(1)?,expense_kind:r.get(2)?,category:r.get(3)?,description:r.get(4)?,amount_cents:r.get(5)?,reference:r.get(6)?})).map_err(|e|e.to_string())?;
 rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())
}
#[cfg(test)]
mod tests{
 use super::*;use crate::database;
 #[test]fn expenses_are_period_specific_and_duplicate_blocked(){
 let t=tempfile::tempdir().unwrap();let mut db=database::open_database(&t.path().join("expense.sqlite")).unwrap();
 add(&mut db,"2026-09","FIXA","ALUGUEL","Aluguel loja",250000,"RECIBO-1").unwrap();
 assert!(add(&mut db,"2026-09","FIXA","ALUGUEL","Aluguel loja",100,"RECIBO-1").is_err());
 add(&mut db,"2026-10","FIXA","ALUGUEL","Aluguel loja",260000,"RECIBO-2").unwrap();
 assert_eq!(list(&db,"2026-09").unwrap()[0].amount_cents,250000);
 assert_eq!(list(&db,"2026-10").unwrap()[0].amount_cents,260000);
 }
}
