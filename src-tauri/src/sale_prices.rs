use rusqlite::{Connection,OptionalExtension,params};
use serde::Serialize;
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct SalePrice { pub product_code:String,pub period:String,pub price_cents:i64 }
fn valid_period(s:&str)->bool {
 let p=s.split('-').collect::<Vec<_>>();
 p.len()==2&&p[0].len()==4&&p[0].chars().all(|c|c.is_ascii_digit())&&p[1].len()==2&&p[1].parse::<u8>().map(|v|(1..=12).contains(&v)).unwrap_or(false)
}
pub fn register(db:&mut Connection,period:&str,code:&str,cents:i64)->Result<SalePrice,String>{
 if !valid_period(period)||code.trim().is_empty()||cents<=0 {return Err("Informe competencia, codigo e preco de venda positivo em centavos.".into());}
 let tx=db.transaction().map_err(|e|e.to_string())?;
 let id:i64=tx.query_row("SELECT product_id FROM product_external_codes WHERE store_id=1 AND external_code=?1",[code],|r|r.get(0))
  .optional().map_err(|e|e.to_string())?.ok_or("Codigo de produto nao cadastrado")?;
 tx.execute("INSERT INTO product_sale_prices(store_id,product_id,period,price_cents,origin) VALUES(1,?1,?2,?3,'MANUAL')",params![id,period,cents])
  .map_err(|_|"Preco ja cadastrado para este produto e competencia; sobrescrita bloqueada.".to_string())?;
 tx.commit().map_err(|e|e.to_string())?;
 Ok(SalePrice{product_code:code.into(),period:period.into(),price_cents:cents})
}
pub fn get(db:&Connection,period:&str,code:&str)->Result<Option<SalePrice>,String>{
 if !valid_period(period){return Err("Competencia invalida".into());}
 db.query_row("SELECT s.price_cents FROM product_sale_prices s JOIN product_external_codes pc ON pc.product_id=s.product_id AND pc.store_id=1 WHERE s.store_id=1 AND s.period=?1 AND pc.external_code=?2",
 params![period,code],|r|r.get::<_,i64>(0)).optional().map_err(|e|e.to_string())
 .map(|v|v.map(|price_cents|SalePrice{product_code:code.into(),period:period.into(),price_cents}))
}
#[cfg(test)]
mod tests{
 use super::*;use crate::database;
 #[test]fn price_is_historical_and_non_overwritable(){
 let t=tempfile::tempdir().unwrap();let mut db=database::open_database(&t.path().join("sale_price.sqlite")).unwrap();
 db.execute("INSERT INTO products(store_id,display_name) VALUES(1,'Teste')",[]).unwrap();
 db.execute("INSERT INTO product_external_codes(store_id,product_id,external_code) VALUES(1,1,'123')",[]).unwrap();
 register(&mut db,"2026-09","123",1840).unwrap();
 assert!(register(&mut db,"2026-09","123",1900).is_err());
 register(&mut db,"2026-10","123",1900).unwrap();
 assert_eq!(get(&db,"2026-09","123").unwrap().unwrap().price_cents,1840);
 assert_eq!(get(&db,"2026-10","123").unwrap().unwrap().price_cents,1900);
 assert!(register(&mut db,"2026-09","NAO_EXISTE",1840).is_err());
 }
}
