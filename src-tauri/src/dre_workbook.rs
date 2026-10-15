//! Espelho auditavel da aba DRE MENSAL. Registro documental: nunca contabiliza
//! novamente totais, subtotais, formulas ou rubricas em managerial_expenses.
use crate::{database,importer,rubric_review};
use calamine::{open_workbook_auto_from_rs,Data,Reader};
use rusqlite::{params,Connection,OptionalExtension};
use serde::Serialize;
use sha2::{Digest,Sha256};
use std::{io::Cursor,path::Path};

const SHEET:&str="DRE MENSAL";
const CONFIRMATION:&str="VALIDADO_PELO_OPERADOR";

#[derive(Debug,Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct SourceRow {
 pub source_row:usize,pub label:String,pub raw_auxiliary:String,
 pub raw_value:String,pub value_cents:Option<i64>,pub value_kind:String,
}
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct SourceView{
 pub period:String,pub filename:String,pub sha256:String,
 pub source_month_label:String,pub revenue_cents:i64,
 pub confirmation:String,pub rows:Vec<SourceRow>,
 pub rubric_review:rubric_review::RubricReview,
}
pub struct ParsedSource{ pub file:importer::OriginalFile,pub source_month_label:String,
 pub revenue_cents:i64,pub rows:Vec<SourceRow> }

fn cell_text(value:&Data)->String{
 match value {Data::Empty=>String::new(),Data::String(s)=>s.trim().to_string(),_=>value.to_string().trim().to_string()}
}
fn number(value:&Data)->Option<f64>{match value{
 Data::Float(v)=>Some(*v),
 Data::Int(v)=>Some(*v as f64),
 _=>None,
}}
fn money_cents(value:f64)->Result<i64,String>{
 if !value.is_finite()||value.abs()>90_000_000_000_000.0{return Err("Valor monetario fora do limite".into());}
 let cents=(value*100.0).round();
 if cents.abs()>i64::MAX as f64{return Err("Valor excedeu limite de centavos".into());}
 Ok(cents as i64)
}
fn percentage_row(row:usize)->bool{[4,51,53,76,106].contains(&row)}
fn column_cell<'a>(row:&'a [Data],start_col:usize,col:usize)->&'a Data{
 col.checked_sub(start_col).and_then(|i|row.get(i)).unwrap_or(&Data::Empty)
}
fn source_row(row:usize,label:&Data,aux:&Data,value:&Data)->Result<Option<SourceRow>,String>{
 let label=cell_text(label);
 if label.is_empty(){return Ok(None);}
 let raw_value=cell_text(value);
 let value_num=number(value);
 let (value_kind,value_cents)=if matches!(value,Data::Empty) {("SEM_VALOR",None)}
 else if let Some(num)=value_num{
  if !num.is_finite(){return Err(format!("Linha {row}: numero nao finito"));}
  if percentage_row(row){("PERCENTUAL",None)}
  else{("MONETARIO",Some(money_cents(num)?))}
 }else{("TEXTO",None)};
 Ok(Some(SourceRow{source_row:row,label,raw_auxiliary:cell_text(aux),
  raw_value,value_cents,value_kind:value_kind.into()}))
}
pub fn parse(path:&Path)->Result<ParsedSource,String>{
 let file=importer::original_file(path)?;
 let mut wb=open_workbook_auto_from_rs(Cursor::new(file.raw_bytes.as_slice()))
  .map_err(|e|format!("Planilha DRE ilegivel: {e}"))?;
 if !wb.sheet_names().iter().any(|s|s==SHEET){return Err("Arquivo sem a aba DRE MENSAL".into());}
 let range=wb.worksheet_range(SHEET).map_err(|e|format!("Falha na aba DRE MENSAL: {e}"))?;
 let (row_offset,col_offset)=range.start().ok_or("Aba DRE MENSAL vazia")?;

 let mut rows=Vec::new();let mut revenue=None;let mut source_month_label=String::new();
 for (index,cells) in range.rows().enumerate(){
  let line=row_offset as usize+index+1;
  if line>106{break;}
  if line==5{source_month_label=cell_text(column_cell(cells,col_offset as usize,3));}
  if line==7{
   let label=cell_text(column_cell(cells,col_offset as usize,1));
   if !label.eq_ignore_ascii_case("Receita Total"){return Err("DRE MENSAL!B7 deve identificar Receita Total".into());}
   revenue=Some(money_cents(number(column_cell(cells,col_offset as usize,3)).ok_or("Receita DRE MENSAL!D7 nao numerica")?)?);
  }
  if let Some(row)=source_row(line,column_cell(cells,col_offset as usize,1),column_cell(cells,col_offset as usize,2),column_cell(cells,col_offset as usize,3))?{
   rows.push(row);
  }
 }
 let revenue_cents=revenue.ok_or("Receita Total ausente da DRE MENSAL!D7")?;
 if revenue_cents<=0{return Err("Receita Total nao positiva".into());}
 if rows.len()<35{return Err("DRE MENSAL incompleta: menos de 35 rubricas".into());}
 Ok(ParsedSource{file,source_month_label,revenue_cents,rows})
}

pub fn save(db:&mut Connection,period:&str,parsed:ParsedSource)->Result<SourceView,String>{
 let summary=database::load_period_summary(db,period)
  .map_err(|_|"Importe primeiro o relatorio de vendas e pagamentos desta competencia para conciliar a DRE.".to_string())?;
 if !summary.reconciled || summary.products_total_cents!=parsed.revenue_cents{
  return Err("Receita da planilha difere da receita conciliada nesta competencia; importacao bloqueada.".into());
 }
 let exists:i64=db.query_row("SELECT COUNT(*) FROM dre_workbook_sources WHERE store_id=1 AND period=?1",[period],|r|r.get(0)).map_err(|e|e.to_string())?;
 if exists!=0{return Err("Ja existe DRE de referencia registrada nesta competencia. Substituicao e duplicacao bloqueadas.".into());}
 let sha=format!("{:x}",Sha256::digest(&parsed.file.raw_bytes));
 if sha!=parsed.file.sha256{return Err("Integridade do arquivo original invalida.".into());}
 let tx=db.transaction().map_err(|e|e.to_string())?;
 tx.execute("INSERT INTO dre_workbook_sources(store_id,period,filename,file_sha256,original_bytes,source_sheet,source_month_label,revenue_cents,confirmation) VALUES(1,?1,?2,?3,?4,?5,?6,?7,?8)",
  params![period,parsed.file.filename,sha,&parsed.file.raw_bytes,SHEET,parsed.source_month_label,parsed.revenue_cents,CONFIRMATION]).map_err(|e|format!("Falha ao preservar fonte DRE: {e}"))?;
 let id=tx.last_insert_rowid();
 for row in &parsed.rows{
  tx.execute("INSERT INTO dre_workbook_rows(source_id,source_row,label,raw_auxiliary,raw_value,value_cents,value_kind) VALUES(?1,?2,?3,?4,?5,?6,?7)",
   params![id,row.source_row as i64,row.label,row.raw_auxiliary,row.raw_value,row.value_cents,row.value_kind]).map_err(|e|e.to_string())?;
 }
 tx.commit().map_err(|e|e.to_string())?;
 load(db,period)?.ok_or("DRE registrada, mas nao foi possivel recarregar".into())
}
pub fn load(db:&Connection,period:&str)->Result<Option<SourceView>,String>{
 let source:Option<(i64,String,String,String,i64,String,Vec<u8>)>=db.query_row(
  "SELECT id,filename,file_sha256,source_month_label,revenue_cents,confirmation,original_bytes FROM dre_workbook_sources WHERE store_id=1 AND period=?1",
  [period],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?))
 ).optional().map_err(|e|e.to_string())?;
 let Some((id,filename,sha256,source_month_label,revenue_cents,confirmation,bytes))=source else{return Ok(None)};
 if format!("{:x}",Sha256::digest(&bytes))!=sha256{return Err("Arquivo da DRE salvo nao passou na verificacao de integridade.".into());}
 let mut st=db.prepare("SELECT source_row,label,raw_auxiliary,raw_value,value_cents,value_kind FROM dre_workbook_rows WHERE source_id=?1 ORDER BY source_row").map_err(|e|e.to_string())?;
 let rows=st.query_map([id],|r|Ok(SourceRow{source_row:r.get::<_,i64>(0)? as usize,label:r.get(1)?,raw_auxiliary:r.get(2)?,raw_value:r.get(3)?,value_cents:r.get(4)?,value_kind:r.get(5)?})).map_err(|e|e.to_string())?
  .collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
 if rows.len()<35 || !rows.iter().any(|r|r.source_row==7&&r.value_cents==Some(revenue_cents)){
  return Err("Espelho DRE incompleto ou com receita inconsistente.".into());
 }
 let inputs=rows.iter().map(|row|rubric_review::RubricInput{
  source_row:row.source_row,label:&row.label,value_kind:&row.value_kind,value_cents:row.value_cents
 }).collect::<Vec<_>>();
 let rubric_review=rubric_review::analyze(&inputs);
 Ok(Some(SourceView{period:period.into(),filename,sha256,source_month_label,revenue_cents,confirmation,rows,rubric_review}))
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test] fn parse_rows_distinguishes_monetary_percentage_and_absence(){
  let money=source_row(33,&Data::String("Alíquota Simples Nacional".into()),&Data::Float(0.08),&Data::Float(1995.5704)).unwrap().unwrap();
  assert_eq!(money.raw_auxiliary,"0.08");
  assert_eq!(money.value_cents,Some(199557));
  let percent=source_row(106,&Data::String("Lucratividade (%)".into()),&Data::Empty,&Data::Float(0.16608)).unwrap().unwrap();
  assert_eq!(percent.value_kind,"PERCENTUAL");
  assert_eq!(percent.value_cents,None);
  assert_eq!(source_row(45,&Data::String("Marketing Local".into()),&Data::Float(0.02),&Data::Empty).unwrap().unwrap().value_kind,"SEM_VALOR");
  assert!(source_row(10,&Data::String("CMV".into()),&Data::Empty,&Data::Float(f64::NAN)).is_err());
 }
 #[test]fn workbook_reference_persists_and_never_posts_expenses(){
  let t=tempfile::tempdir().unwrap();let mut db=database::open_database(&t.path().join("source.sqlite")).unwrap();
  let dir=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures");
  let products=crate::importer::parse_products(&dir.join("produtos-set-2026.xlsx")).unwrap();
  let payments=crate::importer::parse_payments(&dir.join("pagamentos-set-2026.xlsx")).unwrap();
  database::save_reports(&mut db,"2026-09",products,payments).unwrap();
  let revenue=database::load_period_summary(&db,"2026-09").unwrap().products_total_cents;
  let raw=vec![1,2,3,4];let sha=format!("{:x}",Sha256::digest(&raw));
  let rows=(1..=40).map(|n|SourceRow{source_row:n,label:if n==7{"Receita Total".into()}else{format!("Linha {n}")},raw_auxiliary:String::new(),raw_value:format!("{n}"),value_cents:if n==7{Some(revenue)}else{Some(n as i64)},value_kind:"MONETARIO".into()}).collect();
  let source=ParsedSource{file:importer::OriginalFile{filename:"exemplo-sintetico.xlsx".into(),raw_bytes:raw,sha256:sha},source_month_label:"Agosto".into(),revenue_cents:revenue,rows};
  save(&mut db,"2026-09",source).unwrap();
  let loaded=load(&db,"2026-09").unwrap().unwrap();
  assert_eq!(loaded.rows.len(),40);
  assert_eq!(loaded.rubric_review.recognized,1);
  assert_eq!(loaded.rubric_review.not_classified,35);
  assert_eq!(loaded.rubric_review.review_required,4);
  let another_bytes=vec![5,6,7,8];
  let another_sha=format!("{:x}",Sha256::digest(&another_bytes));
  let duplicate=ParsedSource{
   file:importer::OriginalFile{filename:"outro_sintetico.xlsx".into(),raw_bytes:another_bytes,sha256:another_sha},
   source_month_label:"Setembro".into(),revenue_cents:revenue,
   rows:(1..=40).map(|n|SourceRow{source_row:n,label:if n==7{"Receita Total".into()}else{format!("Linha {n}")},
    raw_auxiliary:String::new(),raw_value:n.to_string(),value_cents:if n==7{Some(revenue)}else{Some(n as i64)},value_kind:"MONETARIO".into()}).collect(),
  };
  assert!(save(&mut db,"2026-09",duplicate).is_err(),"Nao deve duplicar nem substituir a DRE");
  let count:i64=db.query_row("SELECT COUNT(*) FROM managerial_expenses",[],|r|r.get(0)).unwrap();
  assert_eq!(count,0);
  assert!(db.execute("UPDATE dre_workbook_rows SET value_cents=100 WHERE source_row=7",[]).is_err());
  drop(db);
  let reopened=database::open_database(&t.path().join("source.sqlite")).unwrap();
  assert_eq!(load(&reopened,"2026-09").unwrap().unwrap().revenue_cents,revenue);
 }
}
