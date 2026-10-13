mod catalog;
mod database;
mod importer;
mod ingredients;
mod recipes;

use rusqlite::Connection;
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;

struct AppState { db: Mutex<Connection> }

#[tauri::command]
async fn import_reports(
    app: tauri::AppHandle, period: String, products_path: String, payments_path: String,
) -> Result<importer::ImportSummary, String> {
    // Executa leitura local e validações fora da thread da interface.
    tauri::async_runtime::spawn_blocking(move || {
        let product_path = PathBuf::from(&products_path);
        let payment_path = PathBuf::from(&payments_path);
        if product_path == payment_path {
            return Err("Escolha dois arquivos diferentes, um para produtos e outro para pagamentos.".into());
        }
        // Somente a transação final grava; qualquer erro anterior mantém o banco intacto.
        let products = importer::parse_products(&product_path)?;
        let payments = importer::parse_payments(&payment_path)?;
        let state = app.state::<AppState>();
        let mut db = state.db.lock().map_err(|_| "Banco bloqueado por falha interna".to_string())?;
        database::save_reports(&mut db, &period, products, payments)
    }).await.map_err(|e| format!("Falha ao executar importação: {e}"))?
}

#[tauri::command]
async fn import_legacy_catalog(app: tauri::AppHandle, catalog_path: String) -> Result<catalog::CatalogImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let parsed = catalog::parse_legacy_catalog(&PathBuf::from(catalog_path))?;
        let state = app.state::<AppState>();
        let mut db = state.db.lock().map_err(|_| "Banco temporariamente inacessível".to_string())?;
        catalog::save_legacy_catalog(&mut db, parsed)
    }).await.map_err(|e| format!("Falha ao importar catálogo: {e}"))?
}

#[tauri::command]
async fn get_catalog_status(app: tauri::AppHandle) -> Result<catalog::CatalogStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let db = state.db.lock().map_err(|_| "Banco temporariamente inacessível".to_string())?;
        catalog::catalog_status(&db)
    }).await.map_err(|e| format!("Falha ao consultar catálogo: {e}"))?
}

#[tauri::command]
async fn review_mappings(app: tauri::AppHandle, period: String) -> Result<catalog::MappingOverview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let db = state.db.lock().map_err(|_| "Banco temporariamente inacessível".to_string())?;
        catalog::mapping_overview(&db, &period)
    }).await.map_err(|e| format!("Falha ao consultar mapeamentos: {e}"))?
}

#[tauri::command]
async fn register_sold_product(
    app: tauri::AppHandle, period: String, external_code: String,
    display_name: String, managerial_category: String,
) -> Result<catalog::MappingOverview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut db = state.db.lock().map_err(|_| "Banco temporariamente inacessivel".to_string())?;
        catalog::register_sold_product(&mut db, &period, &external_code, &display_name, &managerial_category)
    }).await.map_err(|e| format!("Falha ao cadastrar produto: {e}"))?
}

#[tauri::command]
async fn load_period_summary(app: tauri::AppHandle, period: String) -> Result<importer::ImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let db = state.db.lock().map_err(|_| "Banco temporariamente inacessível".to_string())?;
        database::load_period_summary(&db, &period)
    }).await.map_err(|e| format!("Falha ao consultar período: {e}"))?
}

#[tauri::command]
async fn register_ingredient(app: tauri::AppHandle, period: String, code: String, name: String,
 base_unit: String, quantity_base: i64, purchase_cents: i64, supplier: String, freight_cents: i64, st_cents: i64) -> Result<(), String> {
 tauri::async_runtime::spawn_blocking(move || {
  let state=app.state::<AppState>();
  let mut db=state.db.lock().map_err(|_|"Banco indisponivel".to_string())?;
  ingredients::register_detailed(&mut db,&period,&code,&name,&base_unit,quantity_base,purchase_cents,&supplier,freight_cents,st_cents)
 }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn list_ingredients(app: tauri::AppHandle, period: String) -> Result<Vec<ingredients::IngredientView>,String> {
 tauri::async_runtime::spawn_blocking(move || {
  let state=app.state::<AppState>();
  let db=state.db.lock().map_err(|_|"Banco indisponivel".to_string())?;
  ingredients::list(&db,&period)
 }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn import_ingredients_excel(app: tauri::AppHandle, period: String, path: String) -> Result<ingredients::ExcelSummary,String> {
 tauri::async_runtime::spawn_blocking(move || {
  let file=PathBuf::from(path);
  let state=app.state::<AppState>();
  let mut db=state.db.lock().map_err(|_|"Banco indisponivel".to_string())?;
  ingredients::import_excel(&mut db,&period,&file)
 }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn set_recipe_line(app: tauri::AppHandle,period:String,product_code:String,ingredient_code:String,quantity_base:i64)->Result<recipes::RecipeCost,String>{
 tauri::async_runtime::spawn_blocking(move||{
  let state=app.state::<AppState>();
  let mut db=state.db.lock().map_err(|_|"Banco indisponivel".to_string())?;
  recipes::set_line(&mut db,&period,&product_code,&ingredient_code,quantity_base)
 }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn get_recipe_cost(app: tauri::AppHandle,period:String,product_code:String)->Result<recipes::RecipeCost,String>{
 tauri::async_runtime::spawn_blocking(move||{
  let state=app.state::<AppState>();
  let db=state.db.lock().map_err(|_|"Banco indisponivel".to_string())?;
  recipes::recipe_cost(&db,&period,&product_code)
 }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn get_recipe_detail(app:tauri::AppHandle,period:String,product_code:String)->Result<recipes::RecipeDetail,String>{
 tauri::async_runtime::spawn_blocking(move||{
  let state=app.state::<AppState>();
  let db=state.db.lock().map_err(|_|"Banco indisponivel".to_string())?;
  recipes::recipe_detail(&db,&period,&product_code)
 }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn monthly_cost_overview(app:tauri::AppHandle,period:String)->Result<Vec<recipes::ProductCostRow>,String>{
 tauri::async_runtime::spawn_blocking(move||{
  let state=app.state::<AppState>();
  let db=state.db.lock().map_err(|_|"Banco indisponivel".to_string())?;
  recipes::monthly_cost_overview(&db,&period)
 }).await.map_err(|e|e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let path = app.path().app_data_dir()?;
            std::fs::create_dir_all(&path)?;
            let db = database::open_database(&path.join("dre-mais1.sqlite"))
                .map_err(std::io::Error::other)?;
            app.manage(AppState { db: Mutex::new(db) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![import_reports, import_legacy_catalog, get_catalog_status, review_mappings, load_period_summary, register_sold_product, register_ingredient, list_ingredients, import_ingredients_excel, set_recipe_line, get_recipe_cost, get_recipe_detail, monthly_cost_overview])
        .run(tauri::generate_context!())
        .expect("Falha ao iniciar DRE Mais1");
}
