//! Insumos e custos de compra; nao calcula CMV nem altera relatorios.
use calamine::{open_workbook_auto_from_rs, Data, Reader};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use std::{collections::BTreeSet,io::Cursor,path::Path};
use crate::importer;

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct IngredientView {
 pub code: String, pub name: String, pub base_unit: String,
 pub period: String, pub quantity_base: i64, pub purchase_cents: i64,
 pub origin: String,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct ExcelSummary { pub imported: usize, pub filename: String }

fn check(period:&str,code:&str,name:&str,unit:&str,qty:i64,cents:i64)->Result<(),String>{
 let months=period.split('-').collect::<Vec<_>>();
 if months.len()!=2 || months[0].len()!=4 || !months[0].chars().all(|c|c.is_ascii_digit()) ||
    months[1].len()!=2 || !(1..=12).contains(&months[1].parse::<u8>().unwrap_or(0)) {
    return Err("Competencia invalida; use AAAA-MM.".into());
 }
 if code.is_empty() || code.len()>40 || name.is_empty() || name.len()>200 ||
  !["G","ML","UN"].contains(&unit) || qty<=0 || cents<0 {
    return Err("Insumo invalido: codigo/nome obrigatorios, unidade G/ML/UN, quantidade positiva e custo nao negativo.".into());
 }
 Ok(())
}
fn insert(tx:&Transaction<'_>,period:&str,code:&str,name:&str,unit:&str,qty:i64,cents:i64,origin:&str)->Result<(),String>{
 check(period,code,name,unit,qty,cents)?;
 let existing:Option<(i64,String,String)>=tx.query_row(
  "SELECT id,name,base_unit FROM ingredients WHERE store_id=1 AND code=?1",[code],
  |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
 let id=if let Some((id,old_name,old_unit))=existing {
   if old_name!=name || old_unit!=unit{return Err(format!("Insumo {code}: nome ou unidade divergente do cadastro existente."));}
   id
 }else{
  tx.execute("INSERT INTO ingredients(store_id,code,name,base_unit) VALUES(1,?1,?2,?3)",
    params![code,name,unit]).map_err(|e|e.to_string())?;
  tx.last_insert_rowid()
 };
 tx.execute("INSERT INTO ingredient_purchase_costs(ingredient_id,period,quantity_base,purchase_cents,origin) VALUES(?1,?2,?3,?4,?5)",
    params![id,period,qty,cents,origin])
  .map_err(|_|format!("Custo do insumo {code} ja cadastrado para {period}; sobrescrita bloqueada."))?;
 Ok(())
}
pub fn register(db:&mut Connection,period:&str,code:&str,name:&str,unit:&str,qty:i64,cents:i64)->Result<(),String>{
 let (code,name)=(code.trim(),name.trim());
 let tx=db.transaction().map_err(|e|e.to_string())?;
 insert(&tx,period,code,name,unit,qty,cents,"MANUAL")?;
 tx.commit().map_err(|e|e.to_string())
}
pub fn list(db:&Connection,period:&str)->Result<Vec<IngredientView>,String>{
 let mut st=db.prepare("SELECT i.code,i.name,i.base_unit,c.period,c.quantity_base,c.purchase_cents,c.origin FROM ingredients i JOIN ingredient_purchase_costs c ON c.ingredient_id=i.id WHERE i.store_id=1 AND c.period=?1 ORDER BY i.code").map_err(|e|e.to_string())?;
 let rows=st.query_map([period],|r|Ok(IngredientView{code:r.get(0)?,name:r.get(1)?,base_unit:r.get(2)?,period:r.get(3)?,quantity_base:r.get(4)?,purchase_cents:r.get(5)?,origin:r.get(6)?}))
 .map_err(|e|e.to_string())?;
 rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())
}
fn cell(c:&Data)->String{match c{Data::Empty=>String::new(),Data::String(s)=>s.trim().into(),_=>c.to_string().trim().into()}}
fn int_cell(c:&Data,field:&str,line:usize)->Result<i64,String>{
 let raw=cell(c);
 if raw.is_empty()||!raw.chars().all(|ch|ch.is_ascii_digit()){return Err(format!("Linha {line}: {field} deve ser inteiro em unidades basicas/centavos, sem separadores."));}
 raw.parse::<i64>().map_err(|_|format!("Linha {line}: {field} fora do limite"))
}
pub fn import_excel(db:&mut Connection,period:&str,path:&Path)->Result<ExcelSummary,String>{
 check(period,"TESTE","TESTE","UN",1,0)?;
 let file=importer::original_file(path)?;
 let mut workbook=open_workbook_auto_from_rs(Cursor::new(file.raw_bytes.as_slice())).map_err(|e|format!("Excel invalido: {e}"))?;
 let sheet=workbook.sheet_names().first().cloned().ok_or("Excel sem abas")?;
 let range=workbook.worksheet_range(&sheet).map_err(|e|e.to_string())?;
 let mut iter=range.rows();let headers=iter.next().ok_or("Excel vazio")?;
 let expected=["Codigo","Insumo","Unidade","QuantidadeCompra","CustoCompraCentavos"];
 if headers.len()<5||expected.iter().enumerate().any(|(i,h)|cell(&headers[i])!=*h){
  return Err("Cabecalho esperado: Codigo, Insumo, Unidade, QuantidadeCompra, CustoCompraCentavos (nesta ordem).".into());
 }
 let mut entries=Vec::new();let mut seen=BTreeSet::new();
 for (idx,row) in iter.enumerate(){
  if row.iter().all(|c|cell(c).is_empty()){continue;}
  if entries.len()>=10_000{return Err("Limite de 10.000 insumos por Excel.".into());}
  let line=idx+2;
  let get=|i|row.get(i).unwrap_or(&Data::Empty);
  let code=cell(get(0));let name=cell(get(1));let unit=cell(get(2)).to_uppercase();
  let qty=int_cell(get(3),"QuantidadeCompra",line)?;let cents=int_cell(get(4),"CustoCompraCentavos",line)?;
  check(period,&code,&name,&unit,qty,cents).map_err(|e|format!("Linha {line}: {e}"))?;
  if !seen.insert(code.clone()){return Err(format!("Codigo duplicado no Excel: {code}"));}
  entries.push((code,name,unit,qty,cents));
 }
 if entries.is_empty(){return Err("Excel sem insumos para importar.".into());}
 let tx=db.transaction().map_err(|e|e.to_string())?;
 for (code,name,unit,qty,cents) in &entries {insert(&tx,period,code,name,unit,*qty,*cents,"EXCEL")?;}
 tx.execute("INSERT INTO ingredient_excel_imports(store_id,period,filename,file_sha256,original_bytes,rows_imported) VALUES(1,?1,?2,?3,?4,?5)",
  params![period,file.filename,file.sha256,file.raw_bytes,entries.len() as i64]).map_err(|e|format!("Falha ao registrar arquivo original: {e}"))?;
 tx.commit().map_err(|e|e.to_string())?;
 Ok(ExcelSummary{imported:entries.len(),filename:file.filename})
}
#[cfg(test)]
mod tests {
 use super::*;
 use crate::database;
 #[test]
 fn manual_costs_persist_and_never_overwrite(){
  let t=tempfile::tempdir().unwrap();
  let p=t.path().join("insumos.sqlite");
  {let mut db=database::open_database(&p).unwrap();
   register(&mut db,"2026-09","LEITE","Leite","ML",1000,650).unwrap();
   assert!(register(&mut db,"2026-09","LEITE","Leite","ML",1000,999).is_err());
   assert!(register(&mut db,"2026-10","LEITE","Leite","G",1000,650).is_err());
   register(&mut db,"2026-10","LEITE","Leite","ML",1000,720).unwrap();
  }
  let db=database::open_database(&p).unwrap();
  assert_eq!(list(&db,"2026-09").unwrap()[0].purchase_cents,650);
  assert_eq!(list(&db,"2026-10").unwrap()[0].purchase_cents,720);
 }
}
