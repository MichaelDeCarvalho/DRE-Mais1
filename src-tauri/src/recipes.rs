//! Fichas tecnicas por produto e competencia. Calculos racionais em centavos.
//! Sem preco de venda ou estoque real: nunca confundir CMV teorico com contabil.
use rusqlite::{params,Connection,OptionalExtension};
use serde::Serialize;

#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct RecipeCost {
 pub product_code:String,pub period:String,pub total_cost_cents:f64,pub ingredient_count:usize,
}
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct RecipeLineDetail {
 pub ingredient_code:String,pub ingredient_name:String,pub unit:String,
 pub quantity_used:i64,pub quantity_purchased:i64,
 pub purchase_total_cents:i64,pub cost_used_cents:f64,
}
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct RecipeDetail {
 pub product_code:String,pub product_name:String,pub period:String,
 pub lines:Vec<RecipeLineDetail>,pub total_cost_cents:f64,
}
pub fn recipe_detail(db:&Connection,period:&str,product_code:&str)->Result<RecipeDetail,String>{
 if !valid_period(period)||product_code.trim().is_empty(){return Err("Competencia ou codigo invalido.".into());}
 let name:String=db.query_row("SELECT p.display_name FROM products p JOIN product_external_codes pc ON pc.product_id=p.id WHERE pc.store_id=1 AND pc.external_code=?1",
 [product_code],|r|r.get(0)).optional().map_err(|e|e.to_string())?.ok_or("Codigo do produto nao cadastrado")?;
 let mut stmt=db.prepare("SELECT i.code,i.name,i.base_unit,l.quantity_base,c.quantity_base,c.purchase_cents,c.freight_cents,c.st_cents
 FROM recipe_lines l JOIN recipe_versions rv ON rv.id=l.recipe_id
 JOIN product_external_codes pc ON pc.product_id=rv.product_id AND pc.store_id=1
 JOIN ingredients i ON i.id=l.ingredient_id AND i.store_id=1
 LEFT JOIN ingredient_purchase_costs c ON c.ingredient_id=i.id AND c.period=rv.period
 WHERE rv.period=?1 AND pc.external_code=?2 ORDER BY i.code").map_err(|e|e.to_string())?;
 let rows=stmt.query_map(params![period,product_code],|r|Ok((
 r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,
 r.get::<_,i64>(3)?,r.get::<_,Option<i64>>(4)?,
 r.get::<_,Option<i64>>(5)?,r.get::<_,Option<i64>>(6)?,r.get::<_,Option<i64>>(7)?)))
 .map_err(|e|e.to_string())?;
 let mut lines=Vec::new();let mut total=0.0f64;
 for row in rows {
  let (code,name,unit,used,bought,price,freight,st)=row.map_err(|e|e.to_string())?;
  let bought=bought.ok_or(format!("Insumo {code} sem custo na competencia"))?;
  let price=price.ok_or("Preco ausente")?;let freight=freight.ok_or("Frete ausente")?;let st=st.ok_or("ST ausente")?;
  let sum=price.checked_add(freight).and_then(|v|v.checked_add(st)).ok_or("Custo fora do limite")?;
  if bought<=0||used<=0{return Err(format!("Quantidade invalida do insumo {code}"));}
  let cost=used as f64*sum as f64/bought as f64;
  if !cost.is_finite(){return Err("Custo calculado invalido".into());}
  total+=cost;
  if !total.is_finite(){return Err("Total da receita excedeu limite".into());}
  lines.push(RecipeLineDetail{ingredient_code:code,ingredient_name:name,unit,quantity_used:used,quantity_purchased:bought,purchase_total_cents:sum,cost_used_cents:cost});
 }
 if lines.is_empty(){return Err("Ficha tecnica nao cadastrada para produto e competencia.".into());}
 Ok(RecipeDetail{product_code:product_code.into(),product_name:name,period:period.into(),lines,total_cost_cents:total})
}
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ProductCostRow {
 pub product_code:String,pub product_name:String,
 pub quantity_sold:i64,pub sales_cents:i64,
 pub unit_cost_cents:Option<f64>,pub total_theoretical_cents:Option<f64>,
 pub status:String, pub sale_price_cents:Option<i64>, pub cmv_percent:Option<f64>,
}
pub fn monthly_cost_overview(db:&Connection,period:&str)->Result<Vec<ProductCostRow>,String>{
 if !valid_period(period){return Err("Competencia invalida.".into());}
 let mut stmt=db.prepare("SELECT r.external_code,MAX(r.product_name),SUM(r.quantity),SUM(r.value_cents)
 FROM import_product_rows r JOIN imports i ON i.id=r.import_id JOIN periods p ON p.id=i.period_id
 WHERE p.store_id=1 AND p.year_month=?1 AND i.kind='PRODUCTS'
 AND r.row_type='SALE' AND r.external_code IS NOT NULL
 GROUP BY r.external_code ORDER BY r.external_code").map_err(|e|e.to_string())?;
 let rows=stmt.query_map([period],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,i64>(2)?,r.get::<_,i64>(3)?)))
 .map_err(|e|e.to_string())?;
 let data=rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
 let mut out=Vec::new();
 for (code,name,qty,sales) in data {
  let mapped:Option<i64>=db.query_row("SELECT product_id FROM product_external_codes WHERE store_id=1 AND external_code=?1",[&code],|r|r.get(0))
   .optional().map_err(|e|e.to_string())?;
  if mapped.is_none(){
   out.push(ProductCostRow{product_code:code,product_name:name,quantity_sold:qty,sales_cents:sales,unit_cost_cents:None,total_theoretical_cents:None,status:"SEM_CADASTRO".into(),sale_price_cents:None,cmv_percent:None});
   continue;
  }
  let price=crate::sale_prices::get(db,period,&code)?.map(|p|p.price_cents);
  // Sem ficha completa validada, nao emitir custo numerico falso.
  match recipe_detail(db,period,&code) {
   Ok(detail)=>{
    let total=detail.total_cost_cents*qty as f64;
    if !total.is_finite(){return Err("CMV teorico excedeu limite".into());}
    out.push(ProductCostRow{product_code:code,product_name:name,quantity_sold:qty,sales_cents:sales,unit_cost_cents:Some(detail.total_cost_cents),total_theoretical_cents:Some(total),status:"FICHA_PARCIAL_NAO_HOMOLOGADA".into(),sale_price_cents:price,cmv_percent:price.map(|p|100.0*detail.total_cost_cents/p as f64)});
   },
   Err(_)=>out.push(ProductCostRow{product_code:code,product_name:name,quantity_sold:qty,sales_cents:sales,unit_cost_cents:None,total_theoretical_cents:None,status:"SEM_FICHA_OU_CUSTO".into(),sale_price_cents:price,cmv_percent:None}),
  }
 }
 if out.is_empty(){return Err("Nenhuma venda importada para a competencia.".into());}
 Ok(out)
}
fn valid_period(p:&str)->bool {
 let v=p.split('-').collect::<Vec<_>>();
 v.len()==2 && v[0].len()==4 && v[0].chars().all(|c|c.is_ascii_digit())
 && v[1].len()==2 && v[1].parse::<u8>().map(|m|(1..=12).contains(&m)).unwrap_or(false)
}
pub fn set_line(db:&mut Connection,period:&str,product_code:&str,ingredient_code:&str,qty:i64)->Result<RecipeCost,String>{
 if !valid_period(period)||product_code.trim().is_empty()||ingredient_code.trim().is_empty()||qty<=0 {
  return Err("Informe competencia valida, codigos e quantidade consumida positiva na unidade basica.".into());
 }
 let tx=db.transaction().map_err(|e|e.to_string())?;
 let product_id:i64=tx.query_row("SELECT product_id FROM product_external_codes WHERE store_id=1 AND external_code=?1",
  [product_code],|r|r.get(0)).optional().map_err(|e|e.to_string())?.ok_or("Codigo do produto nao cadastrado")?;
 let ingredient_id:i64=tx.query_row("SELECT id FROM ingredients WHERE store_id=1 AND code=?1",
  [ingredient_code],|r|r.get(0)).optional().map_err(|e|e.to_string())?.ok_or("Codigo do insumo nao cadastrado")?;
 let has_cost:i64=tx.query_row("SELECT COUNT(*) FROM ingredient_purchase_costs WHERE ingredient_id=?1 AND period=?2",
  params![ingredient_id,period],|r|r.get(0)).map_err(|e|e.to_string())?;
 if has_cost==0{return Err("Insumo sem custo validado nesta competencia; ficha nao cadastrada.".into());}
 tx.execute("INSERT INTO recipe_versions(product_id,period) VALUES(?1,?2) ON CONFLICT(product_id,period) DO NOTHING",
 params![product_id,period]).map_err(|e|e.to_string())?;
 let recipe_id:i64=tx.query_row("SELECT id FROM recipe_versions WHERE product_id=?1 AND period=?2",
 params![product_id,period],|r|r.get(0)).map_err(|e|e.to_string())?;
 tx.execute("INSERT INTO recipe_lines(recipe_id,ingredient_id,quantity_base) VALUES(?1,?2,?3)",
 params![recipe_id,ingredient_id,qty]).map_err(|_|"Insumo ja registrado nessa ficha; sobrescrita bloqueada.".to_string())?;
 tx.commit().map_err(|e|e.to_string())?;
 recipe_cost(db,period,product_code)
}
pub fn recipe_cost(db:&Connection,period:&str,product_code:&str)->Result<RecipeCost,String>{
 if !valid_period(period){return Err("Competencia invalida.".into());}
 let mut st=db.prepare("SELECT l.quantity_base,c.quantity_base,c.purchase_cents,c.freight_cents,c.st_cents FROM recipe_lines l
 JOIN recipe_versions rv ON rv.id=l.recipe_id
 JOIN products p ON p.id=rv.product_id
 JOIN product_external_codes pc ON pc.product_id=p.id AND pc.store_id=1
 LEFT JOIN ingredient_purchase_costs c ON c.ingredient_id=l.ingredient_id AND c.period=rv.period
 WHERE rv.period=?1 AND pc.external_code=?2").map_err(|e|e.to_string())?;
 let lines=st.query_map(params![period,product_code],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,Option<i64>>(1)?,r.get::<_,Option<i64>>(2)?,r.get::<_,Option<i64>>(3)?,r.get::<_,Option<i64>>(4)?)))
 .map_err(|e|e.to_string())?;
 let mut count=0usize;let mut total=0.0f64;
 for line in lines {
  let (use_qty,buy_qty,price,freight,st)=line.map_err(|e|e.to_string())?;
  let (buy_qty,price,freight,st)=(buy_qty.ok_or("Custo do insumo ausente")?,
   price.ok_or("Preco do insumo ausente")?,freight.ok_or("Frete do insumo ausente")?,st.ok_or("ST do insumo ausente")?);
  if buy_qty<=0{return Err("Quantidade de compra invalida".into());}
  let sum=price.checked_add(freight).and_then(|v|v.checked_add(st)).ok_or("Custo excedeu limite")?;
  total+=use_qty as f64*sum as f64/buy_qty as f64;
  if !total.is_finite(){return Err("CMV fora do limite".into());}
  count+=1;
 }
 if count==0{return Err("Ficha tecnica nao cadastrada para o produto/competencia.".into());}
 Ok(RecipeCost{product_code:product_code.into(),period:period.into(),total_cost_cents:total,ingredient_count:count})
}
#[cfg(test)]
mod tests{
 use super::*;use crate::{database,ingredients};
 #[test] fn monthly_overview_never_calls_missing_recipe_zero_cost(){
  use crate::importer;
  let temp=tempfile::tempdir().unwrap();
  let mut db=database::open_database(&temp.path().join("overview.sqlite")).unwrap();
  let dir=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures");
  database::save_reports(&mut db,"2026-09",
   importer::parse_products(&dir.join("produtos-set-2026.xlsx")).unwrap(),
   importer::parse_payments(&dir.join("pagamentos-set-2026.xlsx")).unwrap()).unwrap();
  let overview=monthly_cost_overview(&db,"2026-09").unwrap();
  assert_eq!(overview.len(),120);
  assert!(overview.iter().all(|p|p.unit_cost_cents.is_none() && p.total_theoretical_cents.is_none()));
  assert!(overview.iter().all(|p|p.status=="SEM_CADASTRO"));
 }
 #[test] fn recipe_is_historical_and_blocks_duplicate(){
  let t=tempfile::tempdir().unwrap();let mut db=database::open_database(&t.path().join("recipe.sqlite")).unwrap();
  db.execute("INSERT INTO products(store_id,display_name) VALUES(1,'Cafe com leite')",[]).unwrap();
  db.execute("INSERT INTO product_external_codes(store_id,product_id,external_code) VALUES(1,1,'1234')",[]).unwrap();
  ingredients::register(&mut db,"2026-09","LEITE","Leite","ML",1000,520).unwrap();
  ingredients::register(&mut db,"2026-10","LEITE","Leite","ML",1000,720).unwrap();
  let cost=set_line(&mut db,"2026-09","1234","LEITE",150).unwrap();
  assert!((cost.total_cost_cents-78.0).abs()<1e-9);
  let detail=recipe_detail(&db,"2026-09","1234").unwrap();
  assert_eq!(detail.lines.len(),1);
  assert_eq!(detail.lines[0].quantity_used,150);
  assert_eq!(detail.lines[0].purchase_total_cents,520);
  assert!((detail.total_cost_cents-78.0).abs()<1e-9);
  assert!(set_line(&mut db,"2026-09","1234","LEITE",150).is_err());
  assert!(recipe_cost(&db,"2026-10","1234").is_err());
  assert!((recipe_cost(&db,"2026-09","1234").unwrap().total_cost_cents-78.0).abs()<1e-9);
 }
}
