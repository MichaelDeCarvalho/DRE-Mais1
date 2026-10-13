import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { brl, periodLabel } from './format';
import type { ImportSummary, CatalogImportSummary, CatalogStatus, MappingOverview } from './types';

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 1))) }));
type ReportKind = 'products' | 'payments';
function fileBaseName(path: string) { return path.replaceAll('\\', '/').split('/').at(-1) || path; }
function explainError(reason: unknown): string {
  return typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : 'Erro inesperado. Verifique os arquivos e tente novamente.';
}

export function App() {
  const [year, setYear] = useState('2026');
  const [month, setMonth] = useState('09');
  const [productsPath, setProductsPath] = useState<string | null>(null);
  const [paymentsPath, setPaymentsPath] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [filter, setFilter] = useState('');
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus | null>(null);
  const [catalogStatusLoading, setCatalogStatusLoading] = useState(true);
  const [catalogInfo, setCatalogInfo] = useState<CatalogImportSummary | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [recipeProduct, setRecipeProduct] = useState('');
  const [recipeIngredient, setRecipeIngredient] = useState('');
  const [recipeQty, setRecipeQty] = useState('');
  const [recipeError, setRecipeError] = useState('');
  const [recipeCost, setRecipeCost] = useState<{ productCode:string; period:string; totalCostCents:number; ingredientCount:number } | null>(null);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [recipeApprovalNote,setRecipeApprovalNote] = useState('');
  const [recipeApprovalMessage,setRecipeApprovalMessage] = useState('');
  const [costRows,setCostRows] = useState<Array<{productCode:string;productName:string;quantitySold:number;salesCents:number;unitCostCents:number|null;totalTheoreticalCents:number|null;status:string;salePriceCents:number|null;cmvPercent:number|null}>>([]);
  const [costBusy,setCostBusy] = useState(false);
  const [salePriceCode,setSalePriceCode] = useState('');
  const [salePriceCents,setSalePriceCents] = useState('');
  const [salePriceBusy,setSalePriceBusy] = useState(false);
  const [salePriceNotice,setSalePriceNotice] = useState('');
  const [costError,setCostError] = useState('');
  const [dreBusy,setDreBusy] = useState(false);
  const [dreError,setDreError] = useState('');
  const [drePreview,setDrePreview] = useState<{period:string;revenueCents:number;paymentsCents:number;differenceCents:number;reconciled:boolean;approvedCmvCents:number|null;contributionBeforeOtherExpensesCents:number|null;pendingProductCodes:number;approvedProductCodes:number;status:string;unregisteredComponents:string[]} | null>(null);
  const [cmvSummary,setCmvSummary] = useState<{period:string;productCodes:number;approvedCodes:number;pendingCodes:number;approvedQuantity:number;approvedCostCents:number;complete:boolean} | null>(null);

  const [recipeDetail, setRecipeDetail] = useState<{
    productCode:string;productName:string;period:string;totalCostCents:number;
    lines:Array<{ingredientCode:string;ingredientName:string;unit:string;quantityUsed:number;quantityPurchased:number;purchaseTotalCents:number;costUsedCents:number}>
  } | null>(null);
  const [ingredientCode, setIngredientCode] = useState('');
  const [ingredientName, setIngredientName] = useState('');
  const [ingredientUnit, setIngredientUnit] = useState('G');
  const [ingredientQty, setIngredientQty] = useState('');
  const [ingredientCost, setIngredientCost] = useState('');
  const [ingredientSupplier, setIngredientSupplier] = useState('');
  const [ingredientFreight, setIngredientFreight] = useState('0');
  const [ingredientSt, setIngredientSt] = useState('0');
  const [ingredients, setIngredients] = useState<Array<{ code: string; name: string; baseUnit: string; quantityBase: number; purchaseCents: number; origin: string; supplier: string; freightCents: number; stCents: number; totalCents: number }>>([]);
  const [ingredientError, setIngredientError] = useState('');
  const [ingredientInfo, setIngredientInfo] = useState('');
  const [ingredientBusy, setIngredientBusy] = useState(false);
  const period = `${year}-${month}`;
  const [mappingSaving, setMappingSaving] = useState(false);
  const busy = pending || catalogLoading || dialogBusy || mappingSaving;
  const canSubmit = /^20\d\d$/.test(year) && Boolean(productsPath && paymentsPath) && !busy;
  useEffect(() => {
    let active = true;
    invoke<CatalogStatus>('get_catalog_status').then(status => {
      if (active) setCatalogStatus(previous => previous?.loaded ? previous : status);
    }).catch(reason => {
      if (active) setCatalogError(explainError(reason));
    }).finally(() => {
      if (active) setCatalogStatusLoading(false);
    });
    return () => { active = false; };
  }, []);
  async function selectFile(which: ReportKind) {
    if (busy) return;
    setError(null);
    setDialogBusy(true);
    try {
      const chosen = await open({ multiple: false, directory: false, title: which === 'products' ? 'Selecione o relatório de produtos' : 'Selecione o relatório de pagamentos', filters: [{ name: 'Planilhas Excel', extensions: ['xls', 'xlsx'] }] });
      if (typeof chosen === 'string') {
        setResult(null);
        setEditingCode(null);
        if (which === 'products') setProductsPath(chosen);
        else setPaymentsPath(chosen);
      }
    } catch (e) { setError(explainError(e)); }
    finally { setDialogBusy(false); }
  }
  async function selectCatalog() {
    if (busy || catalogStatusLoading || catalogStatus?.loaded || catalogError) return;
    setCatalogError(null);
    setDialogBusy(true);
    try {
      const chosen = await open({ multiple: false, directory: false, title: 'Selecionar planilha consolidada com Base DRE', filters: [{ name: 'Planilha Excel', extensions: ['xls', 'xlsx'] }] });
      if (typeof chosen !== 'string') return;
      setDialogBusy(false);
      setCatalogLoading(true);
      const data = await invoke<CatalogImportSummary>('import_legacy_catalog', { catalogPath: chosen });
      setCatalogInfo(data);
      setCatalogStatus({ loaded: true, filename: data.filename, validCodes: data.mappedCodesImported, skippedRows: data.skippedRows });
      if (result) {
        const mapping = await invoke<MappingOverview>('review_mappings', { period });
        setResult(previous => previous ? {
          ...previous, soldProductCodes: mapping.soldProductCodes,
          mappedProductCodes: mapping.mappedProductCodes, unmappedProducts: mapping.unmappedProducts,
        } : null);
      }
    } catch (e) { setCatalogError(explainError(e)); }
    finally { setCatalogLoading(false); setDialogBusy(false); }
  }
  function beginMapping(code: string, name: string, category: string) {
    setEditingCode(code);
    setEditedName(name);
    setEditedCategory(category);
    setError(null);
  }
  async function saveMapping() {
    if (!editingCode || busy) return;
    const code = editingCode;
    setMappingSaving(true);
    setError(null);
    try {
      const mapping = await invoke<MappingOverview>('register_sold_product', {
        period, externalCode: code, displayName: editedName,
        managerialCategory: editedCategory,
      });
      setResult(previous => previous ? {
        ...previous, soldProductCodes: mapping.soldProductCodes,
        mappedProductCodes: mapping.mappedProductCodes,
        unmappedProducts: mapping.unmappedProducts,
      } : previous);
      setEditingCode(null);
      setEditedName('');
      setEditedCategory('');
    } catch (reason) { setError(explainError(reason)); }
    finally { setMappingSaving(false); }
  }
  async function reloadIngredients() {
    try {
      setIngredients(await invoke<typeof ingredients>('list_ingredients', { period }));
      setIngredientError('');
    } catch (e) { setIngredientError(explainError(e)); }
  }
  async function saveIngredient() {
    if (ingredientBusy) return;
    setIngredientBusy(true); setIngredientError(''); setIngredientInfo('');
    try {
      if (!/^\d+$/.test(ingredientQty) || !/^\d+$/.test(ingredientCost) || !/^\d+$/.test(ingredientFreight) || !/^\d+$/.test(ingredientSt)) throw new Error('Quantidade e custo em centavos devem ser inteiros sem pontos ou vírgulas.');
      await invoke('register_ingredient', {
        period, code: ingredientCode, name: ingredientName, baseUnit: ingredientUnit,
        quantityBase: Number(ingredientQty), purchaseCents: Number(ingredientCost), supplier: ingredientSupplier, freightCents: Number(ingredientFreight), stCents: Number(ingredientSt),
      });
      setIngredientInfo('Insumo e custo cadastrados nesta competência.');
      setIngredientCode('');setIngredientName('');setIngredientQty('');setIngredientCost('');setIngredientSupplier('');setIngredientFreight('0');setIngredientSt('0');
      await reloadIngredients();
    } catch (e) { setIngredientError(explainError(e)); }
    finally { setIngredientBusy(false); }
  }
  async function importIngredientFile() {
    if (ingredientBusy) return;
    setIngredientBusy(true);setIngredientError('');setIngredientInfo('');
    try {
      const chosen = await open({ multiple: false, directory: false, title: 'Planilha de insumos e custos', filters: [{ name: 'Excel', extensions: ['xls', 'xlsx'] }] });
      if (typeof chosen !== 'string') return;
      const data = await invoke<{ imported: number; filename: string }>('import_ingredients_excel', { period, path: chosen });
      setIngredientInfo(`${data.imported} insumos importados de ${data.filename}.`);
      await reloadIngredients();
    } catch (e) { setIngredientError(explainError(e)); }
    finally { setIngredientBusy(false); }
  }
  async function saveRecipeLine() {
    if (recipeBusy) return;
    setRecipeBusy(true);setRecipeError('');
    try {
      if (!/^\d+$/.test(recipeQty) || !Number.isSafeInteger(Number(recipeQty)) || Number(recipeQty) < 1) throw new Error('Informe uma quantidade inteira positiva na unidade basica do insumo.');
      const result = await invoke<typeof recipeCost>('set_recipe_line', {
        period, productCode: recipeProduct.trim(), ingredientCode: recipeIngredient.trim(), quantityBase: Number(recipeQty),
      });
      setRecipeCost(result);setRecipeIngredient('');setRecipeQty('');
      setRecipeDetail(await invoke<typeof recipeDetail>('get_recipe_detail',{period,productCode:recipeProduct.trim()}));
    } catch(e) {setRecipeError(explainError(e));}
    finally {setRecipeBusy(false);}
  }
  async function approveCurrentRecipe(){
    if(recipeBusy)return;
    setRecipeBusy(true);setRecipeError('');setRecipeApprovalMessage('');
    try{
      await invoke('approve_recipe',{period,productCode:recipeProduct.trim(),note:recipeApprovalNote.trim()});
      setRecipeApprovalMessage('Ficha aprovada nesta competencia. Os ingredientes ficaram bloqueados.');
      setRecipeApprovalNote('');setCostRows([]);
    }catch(e){setRecipeError(explainError(e));}
    finally{setRecipeBusy(false);}
  }
  async function inspectRecipe() {
    if(recipeBusy)return;
    setRecipeBusy(true);setRecipeError('');setRecipeCost(null);setRecipeDetail(null);
    try {
      setRecipeCost(await invoke<typeof recipeCost>('get_recipe_cost',{period,productCode:recipeProduct.trim()}));
      setRecipeDetail(await invoke<typeof recipeDetail>('get_recipe_detail',{period,productCode:recipeProduct.trim()}));
    }catch(e){setRecipeError(explainError(e));}
    finally{setRecipeBusy(false);}
  }
  async function saveSalePrice(){
    if(salePriceBusy)return;
    setSalePriceBusy(true);setSalePriceNotice('');
    try{
      if(!/^\d+$/.test(salePriceCents)||!Number.isSafeInteger(Number(salePriceCents))||Number(salePriceCents)<=0)throw new Error('Informe preco positivo em centavos inteiros.');
      await invoke('register_sale_price',{period,productCode:salePriceCode.trim(),priceCents:Number(salePriceCents)});
      setSalePriceNotice('Preco salvo sem alterar competencias anteriores. Consulte novamente a previa de CMV.');
      setSalePriceCode('');setSalePriceCents('');setCostRows([]);
    }catch(e){setSalePriceNotice(explainError(e));}
    finally{setSalePriceBusy(false);}
  }
  async function consultDrePreview(){
    if(dreBusy)return;
    setDreBusy(true);setDreError('');setDrePreview(null);
    try{setDrePreview(await invoke<typeof drePreview>('get_dre_preview',{period}));}
    catch(e){setDreError(explainError(e));}
    finally{setDreBusy(false);}
  }
  async function consultCostOverview(){
    if(costBusy)return;
    setCostBusy(true);setCostError('');setCostRows([]);setCmvSummary(null);
    try{
      setCostRows(await invoke<typeof costRows>('monthly_cost_overview',{period}));
      setCmvSummary(await invoke<typeof cmvSummary>('monthly_cmv_summary',{period}));
    }
    catch(e){setCostError(explainError(e));}
    finally{setCostBusy(false);}
  }
  async function submit() {
    if (!productsPath || !paymentsPath || !canSubmit) return;
    setPending(true); setError(null); setResult(null); setEditingCode(null); setFilter('');
    try {
      const data = await invoke<ImportSummary>('import_reports', { period, productsPath, paymentsPath });
      setResult(data);
    } catch (e) { setError(explainError(e)); }
    finally { setPending(false); }
  }
  async function loadSaved() {
    if (busy || !/^20\d\d$/.test(year)) return;
    setPending(true); setError(null); setResult(null); setFilter('');
    try { setResult(await invoke<ImportSummary>('load_period_summary', { period })); }
    catch (e) { setError(explainError(e)); }
    finally { setPending(false); }
  }
  const visibleProducts = result?.unmappedProducts.filter((p) => `${p.externalCode} ${p.name} ${p.category}`.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR'))) || [];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">D</div><div><strong>DRE Mais1</strong><small>Sistema desktop · Marco 1</small></div></div>
        <nav aria-label="Navegação principal"><span className="nav-active">▤ <span>Importação mensal</span></span></nav>
        <div className="sidebar-bottom"><span className="status-dot" /> Dados armazenados localmente <small>CMV e DRE: não habilitados neste marco</small></div>
      </aside>
      <main className="content">
        <header className="page-header"><div><span className="eyebrow">MARCO FUNCIONAL 01</span><h1>Importação e conciliação</h1><p>Selecione os relatórios originais e valide a movimentação do mês.</p></div><div className="header-tag">Processamento offline</div></header>
        <section className="section-block" aria-labelledby="period-heading">
          <div className="section-heading"><span className="step">01</span><div><h2 id="period-heading">Período de referência</h2><p>O mês selecionado deve coincidir com o período indicado pelos pagamentos.</p></div></div>
          <div className="selectors"><label>Ano<input type="text" inputMode="numeric" maxLength={4} value={year} disabled={busy} onChange={(e) => { setYear(e.target.value); setResult(null); setEditingCode(null); }} aria-label="Ano" /></label><label>Mês<select value={month} disabled={busy} onChange={(e) => { setMonth(e.target.value); setResult(null); setEditingCode(null); }} aria-label="Mês">{months.map(m => <option key={m.value} value={m.value}>{m.label[0].toUpperCase() + m.label.slice(1)}</option>)}</select></label><div className="selected-period">Competência <strong>{periodLabel(period)}</strong></div><button type="button" className="outline-button" disabled={busy || !/^20\d\d$/.test(year)} onClick={loadSaved}>Consultar importação salva</button></div>
        </section>
        <section className="section-block catalog-section" aria-labelledby="catalog-heading">
          <div className="section-heading"><span className="step">A</span><div><h2 id="catalog-heading">Cadastro legado de referência (opcional)</h2><p>Carregue uma única vez a planilha consolidada com a aba Base DRE, para identificar códigos já conhecidos. Não importa fichas técnicas nem valores de CMV.</p></div></div>
          <div className="catalog-action">
            <div><strong>Base DRE — somente códigos, nomes e categorias</strong><p>Os registros com código inválido são preservados e contabilizados como pendências; não serão mapeados automaticamente.</p></div>
            <button type="button" className="outline-button" onClick={selectCatalog} disabled={busy || catalogStatusLoading || Boolean(catalogStatus?.loaded) || Boolean(catalogError)}>{catalogLoading ? 'Analisando cadastro…' : catalogStatusLoading ? 'Verificando catálogo…' : catalogStatus?.loaded ? 'Catálogo já carregado' : 'Carregar cadastro de referência'}</button>
          </div>
          {catalogStatus?.loaded && !catalogInfo && <div className="feedback feedback-info" role="status"><strong>Catálogo já cadastrado: {catalogStatus.validCodes} códigos válidos • {catalogStatus.skippedRows} pendências</strong><p>Arquivo: {catalogStatus.filename}. Os dados estão preservados no SQLite local.</p></div>}
          {catalogInfo && <div className="feedback feedback-info" role="status"><strong>{catalogInfo.mappedCodesImported} códigos válidos • {catalogInfo.skippedRows} linhas com pendência</strong><p>{catalogInfo.warning}</p></div>}
          {catalogError && <div className="feedback feedback-error" role="alert"><strong>Cadastro não carregado</strong><p>{catalogError}</p></div>}
        </section>
        <section className="section-block" aria-labelledby="upload-heading">
          <div className="section-heading"><span className="step">02</span><div><h2 id="upload-heading">Arquivos para importação</h2><p>Os arquivos não são enviados à internet. Os dados originais serão preservados.</p></div></div>
          <div className="file-grid">
            <article className="file-card"><div className="file-icon">▤</div><div><h3>Relatório de produtos</h3><p>Operacional → Produtos · XLS / XLSX</p><strong className={productsPath ? 'selected-file' : 'empty-file'}>{productsPath ? fileBaseName(productsPath) : 'Nenhum arquivo selecionado'}</strong></div><button type="button" className="outline-button" onClick={() => selectFile('products')} disabled={busy}>Selecionar arquivo</button></article>
            <article className="file-card"><div className="file-icon">▣</div><div><h3>Relatório de pagamentos</h3><p>Faturamento → Métodos de Pagamento · XLS / XLSX</p><strong className={paymentsPath ? 'selected-file' : 'empty-file'}>{paymentsPath ? fileBaseName(paymentsPath) : 'Nenhum arquivo selecionado'}</strong></div><button type="button" className="outline-button" onClick={() => selectFile('payments')} disabled={busy}>Selecionar arquivo</button></article>
          </div>
          <div className="action-line"><p>A importação registra os dois arquivos juntos e bloqueia duplicatas.</p><button type="button" className="primary-button" onClick={submit} disabled={!canSubmit}>{pending ? 'Processando…' : 'Validar e importar relatórios'} <span aria-hidden="true">→</span></button></div>
          {error && <div className="feedback feedback-error" role="alert"><strong>Importação não concluída</strong><p>{error}</p></div>}
        </section>
        {result ? <>
          <section className="section-block" aria-labelledby="reconciliation-heading">
            <div className="section-heading"><span className="step">03</span><div><h2 id="reconciliation-heading">Resultado da conciliação</h2><p>Período detectado nos pagamentos: {result.paymentReportPeriod}</p></div></div>
            <div className="metric-grid"><div className="metric"><small>Vendas líquidas</small><strong>{brl(result.productsTotalCents)}</strong><span>{result.productRows} linhas de origem</span></div><div className="metric"><small>Pagamentos</small><strong>{brl(result.paymentsTotalCents)}</strong><span>{result.paymentRows} métodos originais</span></div><div className={`metric ${result.reconciled ? 'metric-ok' : 'metric-bad'}`}><small>Diferença</small><strong>{brl(result.differenceCents)}</strong><span>{result.reconciled ? '✓ Conciliação exata' : '⚠ Divergência identificada'}</span></div></div>
            <div className="breakdown"><div><span>Receita positiva</span><strong>{brl(result.positiveSalesCents)}</strong></div><div><span>Descontos e ajustes</span><strong>{brl(result.adjustmentsCents)}</strong></div></div>
            {result.warnings.map((message, index) => <div key={index} className="feedback feedback-info" role="note">{message}</div>)}
          </section>
          <section className="section-block" aria-labelledby="methods-heading"><div className="section-heading"><span className="step">04</span><div><h2 id="methods-heading">Métodos de pagamento normalizados</h2><p>Crédito Manual e Débito Manual são agrupados, mantendo o detalhe original no banco.</p></div></div><div className="methods">{result.paymentMethods.map(m => <div key={m.code}><span>{m.label}</span><strong>{brl(m.totalCents)}</strong></div>)}</div></section>
          <section className="section-block" aria-labelledby="products-heading"><div className="section-heading"><span className="step">05</span><div><h2 id="products-heading">Produtos sem mapeamento</h2><p>Identificados por código externo, não por semelhança de nome.</p></div></div>
            <div className="mapping-stats"><div><strong>{result.soldProductCodes}</strong><span>Códigos vendidos</span></div><div><strong>{result.mappedProductCodes}</strong><span>Mapeados</span></div><div><strong>{result.unmappedProducts.length}</strong><span>Sem cadastro</span></div></div>
            <div className="table-header"><h3>Pendências de cadastro</h3><input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar código, produto ou categoria" aria-label="Filtrar produtos pendentes" /></div>
            {editingCode && <div className="feedback feedback-info" role="region" aria-label="Cadastrar produto pendente">
              <strong>Cadastro manual do código {editingCode}</strong>
              <p>Confirme nome e categoria gerencial. A venda original e a categoria de origem não serão modificadas.</p>
              <div className="selectors">
                <label>Nome do produto<input value={editedName} maxLength={200} disabled={busy} onChange={e => setEditedName(e.target.value)} /></label>
                <label>Categoria gerencial<input value={editedCategory} maxLength={120} disabled={busy} onChange={e => setEditedCategory(e.target.value)} /></label>
                <button type="button" className="primary-button" disabled={busy || !editedName.trim() || !editedCategory.trim()} onClick={saveMapping}>Salvar cadastro</button>
                <button type="button" className="outline-button" disabled={busy} onClick={() => setEditingCode(null)}>Cancelar</button>
              </div>
              {error && <div className="feedback feedback-error" role="alert">{error}</div>}
            </div>}
            {result.unmappedProducts.length > 0 ? <><div className="scroll-table"><table><thead><tr><th>Código</th><th>Produto</th><th>Categoria</th><th className="num">Quantidade</th><th className="num">Vendas</th><th>Status</th><th>Ação</th></tr></thead><tbody>{visibleProducts.map(p => <tr key={p.externalCode}><td className="mono">{p.externalCode}</td><td>{p.name}</td><td>{p.category}</td><td className="num">{p.quantity}</td><td className="num">{brl(p.salesCents)}</td><td><span className="pending-tag">Não mapeado</span></td><td><button type="button" className="outline-button" disabled={busy} onClick={() => beginMapping(p.externalCode, p.name, p.category)}>Cadastrar</button></td></tr>)}</tbody></table></div><p className="footnote">{visibleProducts.length} de {result.unmappedProducts.length} pendências exibidas. O resultado depende dos códigos atualmente cadastrados. A Base DRE pode ser carregada pela seção opcional acima; os códigos com erro permanecem pendentes.</p></> : <div className="empty-state">Nenhum código externo pendente de mapeamento.</div>}
          </section>
        </> : <section className="empty-state"><strong>Pronto para validar setembro de 2026</strong><p>Escolha os dois arquivos e execute a importação. A conciliação aparecerá aqui.</p></section>}
        <section className="section-block" aria-labelledby="ingredient-heading">
          <div className="section-heading"><span className="step">06</span><div><h2 id="ingredient-heading">Insumos e custos de compra — cadastro inicial</h2><p>Independente dos relatórios de venda. Custos por competência, sem calcular CMV.</p></div></div>
          <p>Unidades básicas: G (gramas), ML (mililitros) e UN (unidades). Quantidade de compra na unidade básica. Custo em centavos inteiros. Exemplo: pacote de 1 kg por R$ 25,90 → G, quantidade 1000, custo 2590.</p>
          <div className="selectors">
            <label>Código<input value={ingredientCode} maxLength={40} disabled={ingredientBusy} onChange={e => setIngredientCode(e.target.value)} /></label>
            <label>Insumo<input value={ingredientName} maxLength={200} disabled={ingredientBusy} onChange={e => setIngredientName(e.target.value)} /></label>
            <label>Fornecedor<input value={ingredientSupplier} maxLength={200} disabled={ingredientBusy} onChange={e => setIngredientSupplier(e.target.value)} /></label>
            <label>Frete (centavos)<input value={ingredientFreight} inputMode="numeric" disabled={ingredientBusy} onChange={e => setIngredientFreight(e.target.value)} /></label>
            <label>ST (centavos)<input value={ingredientSt} inputMode="numeric" disabled={ingredientBusy} onChange={e => setIngredientSt(e.target.value)} /></label>
            <label>Unidade<select value={ingredientUnit} disabled={ingredientBusy} onChange={e => setIngredientUnit(e.target.value)}><option>G</option><option>ML</option><option>UN</option></select></label>
            <label>Quantidade compra<input value={ingredientQty} inputMode="numeric" disabled={ingredientBusy} onChange={e => setIngredientQty(e.target.value)} placeholder="1000"/></label>
            <label>Custo compra (centavos)<input value={ingredientCost} inputMode="numeric" disabled={ingredientBusy} onChange={e => setIngredientCost(e.target.value)} placeholder="2590"/></label>
            <button type="button" className="primary-button" disabled={ingredientBusy || !ingredientCode.trim() || !ingredientName.trim() || !ingredientQty || !ingredientCost} onClick={saveIngredient}>Cadastrar insumo</button>
          </div>
          <div className="action-line">
            <p>Excel: primeira aba, cabeçalhos exatos Codigo, Insumo, Unidade, QuantidadeCompra, CustoCompraCentavos. Opcionalmente acrescente Fornecedor, FreteCentavos, STCentavos. Todos os custos são da competência selecionada; não há sobrescrita.</p>
            <button type="button" className="outline-button" disabled={ingredientBusy} onClick={importIngredientFile}>Importar insumos do Excel</button>
            <button type="button" className="outline-button" disabled={ingredientBusy} onClick={reloadIngredients}>Consultar insumos</button>
          </div>
          {ingredientError && <div className="feedback feedback-error" role="alert">{ingredientError}</div>}
          {ingredientInfo && <div className="feedback feedback-info" role="status">{ingredientInfo}</div>}
          {ingredients.length > 0 && <div className="scroll-table"><table><thead><tr><th>Código</th><th>Insumo</th><th>Unidade</th><th>Qtd. compra</th><th>Custo compra</th><th>Frete</th><th>ST</th><th>Custo total</th><th>Fornecedor</th><th>Origem</th></tr></thead><tbody>{ingredients.map(i => <tr key={i.code}><td>{i.code}</td><td>{i.name}</td><td>{i.baseUnit}</td><td className="num">{i.quantityBase}</td><td className="num">{brl(i.purchaseCents)}</td><td className="num">{brl(i.freightCents)}</td><td className="num">{brl(i.stCents)}</td><td className="num">{brl(i.totalCents)}</td><td>{i.supplier || 'Não informado'}</td><td>{i.origin}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="section-block" aria-labelledby="recipe-heading">
          <div className="section-heading"><span className="step">07</span><div><h2 id="recipe-heading">Ficha técnica — custo teórico unitário</h2><p>Vincule quantidades consumidas ao código do produto e ao insumo cadastrado. Não calcula estoque nem CMV contábil.</p></div></div>
          <div className="selectors">
            <label>Código do produto vendido<input value={recipeProduct} disabled={recipeBusy} onChange={e=>{setRecipeProduct(e.target.value);setRecipeCost(null);setRecipeDetail(null);}} placeholder="Código externo já mapeado"/></label>
            <label>Código do insumo<input value={recipeIngredient} disabled={recipeBusy} onChange={e=>setRecipeIngredient(e.target.value)} placeholder="Ex.: LEITE"/></label>
            <label>Consumo (G, ML ou UN)<input value={recipeQty} disabled={recipeBusy} inputMode="numeric" onChange={e=>setRecipeQty(e.target.value)} placeholder="150"/></label>
            <button type="button" className="primary-button" disabled={recipeBusy || !recipeProduct.trim() || !recipeIngredient.trim() || !recipeQty.trim()} onClick={saveRecipeLine}>Adicionar ingrediente à ficha</button>
            <button type="button" className="outline-button" disabled={recipeBusy || !recipeProduct.trim()} onClick={inspectRecipe}>Consultar custo da ficha</button>
          </div>
          <p>O vínculo de cada insumo é único por produto e competência. Correções de receitas existentes serão implementadas com versionamento e revisão controlada, não por sobrescrita silenciosa.</p>
          {recipeDetail && <div className="selectors">
            <label>Conferência da ficha (justificativa obrigatória)<input value={recipeApprovalNote} maxLength={500} disabled={recipeBusy} onChange={e=>setRecipeApprovalNote(e.target.value)} placeholder="Conferi todos os insumos e quantidades da receita"/></label>
            <button type="button" className="primary-button" disabled={recipeBusy||!recipeApprovalNote.trim()} onClick={approveCurrentRecipe}>Aprovar ficha desta competência</button>
          </div>}
          {recipeApprovalMessage && <div className="feedback feedback-info" role="status">{recipeApprovalMessage}</div>}
          {recipeError && <div className="feedback feedback-error" role="alert">{recipeError}</div>}
          {recipeDetail && <div className="scroll-table" aria-label="Composição detalhada da ficha técnica">
            <h3>Composição de {recipeDetail.productName} — {recipeDetail.period}</h3>
            <table><thead><tr><th>Código</th><th>Insumo</th><th>Unidade</th><th className="num">Consumo</th><th className="num">Quantidade comprada</th><th className="num">Custo compra</th><th className="num">Custo consumido</th></tr></thead>
            <tbody>{recipeDetail.lines.map(line=><tr key={line.ingredientCode}><td>{line.ingredientCode}</td><td>{line.ingredientName}</td><td>{line.unit}</td><td className="num">{line.quantityUsed}</td><td className="num">{line.quantityPurchased}</td><td className="num">{brl(line.purchaseTotalCents)}</td><td className="num">{brl(Math.round(line.costUsedCents))}</td></tr>)}</tbody></table>
            <p><strong>Custo unitário teórico: {brl(Math.round(recipeDetail.totalCostCents))}</strong>. Cálculo interno preserva frações de centavo até o total.</p>
          </div>}
          {recipeCost && <div className="feedback feedback-info" role="status"><strong>Ficha do produto {recipeCost.productCode}: {recipeCost.ingredientCount} insumo(s).</strong><p>Custo teórico unitário: {brl(Math.round(recipeCost.totalCostCents))}. Valor interno antes do arredondamento: {recipeCost.totalCostCents.toFixed(4)} centavos.</p></div>}
        </section>
        <section className="section-block" aria-labelledby="cmv-preview-heading">
          <div className="section-heading"><span className="step">08</span><div><h2 id="cmv-preview-heading">Prévia de custos teóricos mensais</h2><p>Somente diagnóstico: fichas parciais não representam CMV homologado nem fechamento DRE.</p></div></div>
          <div className="action-line"><p>Vendas por código e competência, relacionadas aos custos das receitas cadastradas.</p><button type="button" className="outline-button" disabled={costBusy} onClick={consultCostOverview}>{costBusy ? 'Consultando…' : 'Consultar custos por produto'}</button></div>
          {cmvSummary && <div className="feedback feedback-info" role="status">
            <strong>Fichas aprovadas: {cmvSummary.approvedCodes} de {cmvSummary.productCodes} códigos vendidos · {cmvSummary.pendingCodes} pendentes</strong>
            <p>Custo teórico dos produtos aprovados: {brl(Math.round(cmvSummary.approvedCostCents))} ({cmvSummary.approvedQuantity} unidades). {cmvSummary.complete ? 'Cobertura de fichas completa; não equivale à DRE fechada.' : 'CMV mensal INCOMPLETO — não utilizar como custo total da loja.'}</p>
          </div>}
          {costError && <div className="feedback feedback-error" role="alert">{costError}</div>}
          {costRows.length > 0 && <div className="scroll-table"><table><thead><tr><th>Código</th><th>Produto</th><th className="num">Vendido</th><th className="num">Vendas</th><th className="num">Custo técnico unitário</th><th className="num">Custo teórico × quantidade</th><th>Preço tabela</th><th>CMV unitário provisório</th><th>Situação</th></tr></thead><tbody>
            {costRows.map(row=><tr key={row.productCode}><td>{row.productCode}</td><td>{row.productName}</td><td className="num">{row.quantitySold}</td><td className="num">{brl(row.salesCents)}</td><td className="num">{row.unitCostCents===null?'—':brl(Math.round(row.unitCostCents))}</td><td className="num">{row.totalTheoreticalCents===null?'—':brl(Math.round(row.totalTheoreticalCents))}</td><td>{row.salePriceCents===null?'—':brl(row.salePriceCents)}</td><td>{row.cmvPercent===null?'—':`${row.cmvPercent.toFixed(2)}%`}</td><td>{row.status==='FICHA_APROVADA'?'Ficha aprovada':row.status==='FICHA_PARCIAL_NAO_HOMOLOGADA'?'Ficha parcial, custo provisório':row.status==='SEM_CADASTRO'?'Sem cadastro':'Sem ficha ou custo'}</td></tr>)}
          </tbody></table></div>}
          <p className="footnote">Esta prévia não totaliza CMV oficial enquanto houver fichas sem validação. O preço unitário de venda e o percentual de CMV ainda serão tratados separadamente.</p>
        </section>
        <section className="section-block" aria-labelledby="price-heading">
          <div className="section-heading"><span className="step">09</span><div><h2 id="price-heading">Preço de venda por competência</h2><p>Preço de tabela unitário, separado das vendas reais importadas. Não substitui os valores conciliados.</p></div></div>
          <div className="selectors">
            <label>Código do produto<input value={salePriceCode} disabled={salePriceBusy} onChange={e=>setSalePriceCode(e.target.value)} /></label>
            <label>Preço unitário (centavos)<input value={salePriceCents} inputMode="numeric" disabled={salePriceBusy} onChange={e=>setSalePriceCents(e.target.value)} placeholder="1840 = R$ 18,40"/></label>
            <button type="button" className="primary-button" disabled={salePriceBusy||!salePriceCode.trim()||!salePriceCents.trim()} onClick={saveSalePrice}>Salvar preço</button>
          </div>
          {salePriceNotice && <div className="feedback feedback-info" role="status">{salePriceNotice}</div>}
        </section>
        <section className="section-block" aria-labelledby="dre-preview-heading">
          <div className="section-heading"><span className="step">10</span><div><h2 id="dre-preview-heading">Prévia gerencial — DRE não fechada</h2><p>Consulta somente leitura. Não estima tributos, taxas, despesas nem estoque ausentes.</p></div></div>
          <div className="action-line"><p>Confira receita conciliada e cobertura das fichas aprovadas para a competência escolhida.</p><button type="button" className="outline-button" disabled={dreBusy} onClick={consultDrePreview}>{dreBusy?'Consultando…':'Consultar prévia gerencial'}</button></div>
          {dreError && <div className="feedback feedback-error" role="alert">{dreError}</div>}
          {drePreview && <div className="feedback feedback-info" role="status">
            <strong>Competência {drePreview.period}: {drePreview.status==='CMV_APROVADO_DRE_INCOMPLETA'?'CMV técnico coberto, DRE ainda incompleta':drePreview.status==='CMV_INCOMPLETO'?'CMV incompleto':'Conciliação pendente'}</strong>
            <p>Receita líquida importada: {brl(drePreview.revenueCents)} · Pagamentos: {brl(drePreview.paymentsCents)} · Diferença: {brl(drePreview.differenceCents)}.</p>
            <p>Fichas aprovadas: {drePreview.approvedProductCodes} · Pendentes: {drePreview.pendingProductCodes}.</p>
            <p>CMV técnico aprovado para a competência: {drePreview.approvedCmvCents===null?'Não disponível — cobertura incompleta':brl(Math.round(drePreview.approvedCmvCents))}.</p>
            <p>Receita menos CMV técnico (antes de outras despesas): {drePreview.contributionBeforeOtherExpensesCents===null?'Não disponível':brl(Math.round(drePreview.contributionBeforeOtherExpensesCents))}.</p>
            <p>Componentes ainda sem apuração: {drePreview.unregisteredComponents.join('; ')}. Nenhum resultado líquido ou lucro é calculado nesta prévia.</p>
          </div>}
        </section>
        <footer>Primeiro marco · Somente importação, validação e conciliação · Sem CMV ou DRE</footer>
      </main>
    </div>
  );
}
