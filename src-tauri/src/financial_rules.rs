//! Simulacao gerencial: taxas informadas, nao comprovacao de tarifas debitadas.
use serde::Serialize;
use crate::importer::MethodTotal;
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct PaymentFeeEstimate {
 pub code:String,pub label:String,pub base_cents:i64,
 pub rate_basis_points:Option<i64>,pub estimated_fee_cents:Option<i64>,
 pub status:String,
}
pub fn calculate_fees(methods:&[MethodTotal])->Result<Vec<PaymentFeeEstimate>,String>{
 methods.iter().map(|m|{
  let rate=match m.code.as_str(){
   "credit"=>Some(200_i64),"debit"=>Some(100),"pix"=>Some(100),"wallet"=>Some(300),
   "cash"=>Some(0),
   // Voucher pode ser vale-refeicao OU outro beneficio: pedir classificacao.
   "voucher"|"other"=>None,
   _=>None,
  };
  let fee=match rate {
   Some(r)=>Some(i64::try_from(((m.total_cents as i128)*(r as i128)+5000)/10000).map_err(|_|"Taxa fora do limite")?),
   None=>None,
  };
  Ok(PaymentFeeEstimate{code:m.code.clone(),label:m.label.clone(),base_cents:m.total_cents,
   rate_basis_points:rate,estimated_fee_cents:fee,
   status:if rate.is_some(){"ESTIMADO".into()}else{"CLASSIFICACAO_PENDENTE".into()}})
 }).collect()
}
pub fn royalties_cents(revenue_cents:i64)->Result<i64,String>{
 if revenue_cents<0{return Err("Receita negativa nao suportada para royalties".into());}
 i64::try_from(((revenue_cents as i128)*7+50)/100).map_err(|_|"Royalties fora do limite".into())
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn royalties_and_fees_follow_confirmed_rates(){
 assert_eq!(royalties_cents(2_494_463).unwrap(),174_612);
 let rows=vec![
  MethodTotal{code:"credit".into(),label:"Credito".into(),total_cents:10_000},
  MethodTotal{code:"debit".into(),label:"Debito".into(),total_cents:10_000},
  MethodTotal{code:"pix".into(),label:"PIX".into(),total_cents:10_000},
  MethodTotal{code:"wallet".into(),label:"Carteira".into(),total_cents:10_000},
  MethodTotal{code:"voucher".into(),label:"Voucher".into(),total_cents:10_000},
  MethodTotal{code:"other".into(),label:"Outro".into(),total_cents:10_000},
 ];
 let v=calculate_fees(&rows).unwrap();
 assert_eq!(v.iter().map(|x|x.estimated_fee_cents.unwrap_or(0)).sum::<i64>(),700);
 assert!(v[4].estimated_fee_cents.is_none());
 assert!(v[5].estimated_fee_cents.is_none());
 }
}
