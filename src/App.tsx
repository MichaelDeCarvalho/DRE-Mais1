import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { brl, periodLabel } from './format';
import { consultPeriodModules, nextCompetence } from './competence';
import { parseQuantityMilliBase } from './quantity';
import { findRecipeCandidates, recipeStatusLabel } from './recipe_selection';
import type { ImportSummary, CatalogImportSummary, CatalogStatus, MappingOverview } from './types';

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 1))) }));
type ReportKind = 'products' | 'payments';
function fileBaseName(path: string) { return path.replaceAll('\\', '/').split('/').at(-1) || path; }
function explainError(reason: unknown): string {
  return typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : 'Erro inesperado. Verifique os arquivos e tente novamente.';
}

type ThemePreference = 'dark' | 'light' | 'system';
function initialTheme(): ThemePreference {
  try {
    const saved = window.localStorage.getItem('dremais1.theme');
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
  } catch { /* Preferencia local pode estar indisponivel. */ }
  return 'dark';
}
export function App() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(initialTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
  const [activeSection, setActiveSection] = useState('period-heading');
  const effectiveTheme = themePreference === 'system' ? (systemDark ? 'dark' : 'light') : themePreference;
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    try { window.localStorage.setItem('dremais1.theme', themePreference); } catch { /* Sem armazenamento persistente. */ }
  }, [themePreference, effectiveTheme]);
  useEffect(() => {
    const matcher = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!matcher) return;
    const update = () => setSystemDark(matcher.matches);
    matcher.addEventListener('change', update);
    return () => matcher.removeEventListener('change', update);
  }, []);
  function navigate(section: string) {
    setActiveSection(section);
    requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  type FinancialParameter = {code:string;name:string;category:string;calculationBase:string;effectiveFrom:string|null;basisPoints:number|null;source:string|null};
  const [parameters,setParameters] = useState<FinancialParameter[]>([]);
  const [paramMode,setParamMode] = useState<'new'|'version'|null>(null);
  const [paramCode,setParamCode] = useState('');
  const [paramName,setParamName] = useState('');
  const [paramCategory,setParamCategory] = useState('PAYMENT_FEE');
  const [paramBase,setParamBase] = useState('PAYMENT_METHOD');
  const [paramEffectiveFrom,setParamEffectiveFrom] = useState('');
  const [paramRate,setParamRate] = useState('');
  const [paramSource,setParamSource] = useState('Confirmado pelo operador');
  const [paramNote,setParamNote] = useState('');
  const [paramMessage,setParamMessage] = useState('');
  const [paramBusy,setParamBusy] = useState(false);
  const paramRateInput = useRef<HTMLInputElement>(null);

  function cancelParameterEdit(){
    setParamMode(null);setParamCode('');setParamName('');setParamCategory('PAYMENT_FEE');setParamBase('PAYMENT_METHOD');
    setParamEffectiveFrom('');setParamRate('');setParamSource('Confirmado pelo operador');setParamNote('');
    setParamMessage('');
  }
  function focusParameterForm(){
    requestAnimationFrame(() => { document.getElementById('parameter-edit-form')?.scrollIntoView({behavior:'smooth',block:'center'});paramRateInput.current?.focus(); });
  }
  function editNextVersion(p:FinancialParameter){
    setParamMode('version');setParamCode(p.code);setParamName(p.name);setParamCategory(p.category);setParamBase(p.calculationBase);
    setParamEffectiveFrom(p.effectiveFrom && period<=p.effectiveFrom ? nextCompetence(p.effectiveFrom) : period);
    setParamRate(p.basisPoints===null?'':(p.basisPoints/100).toFixed(2).replace('.',','));
    setParamSource('Confirmação do operador');setParamNote('');
    setParamMessage('');
    focusParameterForm();
  }
  function beginNewParameter(){
    cancelParameterEdit();setParamMode('new');setParamEffectiveFrom(period);
    focusParameterForm();
  }
  async function loadParameters(reference:string){
    if(paramBusy)return;
    setParamBusy(true);setParameters([]);setParamMessage('');
    try{setParameters(await invoke<FinancialParameter[]>('list_financial_parameters',{period:reference}));}
    catch(e){setParamMessage(explainError(e));}
    finally{setParamBusy(false);}
  }
  async function saveParameter(){
    if(!paramMode||paramBusy)return;
    const raw=paramRate.trim().replace(',','.');
    if(!/^\d{1,3}(\.\d{1,2})?$/.test(raw)||Number(raw)>100){
      setParamMessage('Informe percentual válido entre 0 e 100 com até 2 casas decimais.');return;
    }
    if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(paramEffectiveFrom)){
      setParamMessage('Informe a competência de início da nova vigência.');return;
    }
    setParamBusy(true);setParamMessage('');
    const savedPeriod=paramEffectiveFrom;
    try {
      await invoke('register_financial_parameter',{
        code:paramCode.trim().toUpperCase(),name:paramName,category:paramCategory,base:paramBase,
        period:savedPeriod,basisPoints:Math.round(Number(raw)*100),source:paramSource,note:paramNote
      });
    }catch(e){setParamMessage(explainError(e));setParamBusy(false);return;}
    cancelParameterEdit();
    setParamMessage(`Vigência cadastrada a partir de ${periodLabel(savedPeriod)}. Para conferir seu efeito, selecione essa competência e clique em Consultar competência. Versões anteriores preservadas.`);
    try {
      const refreshed=await invoke<FinancialParameter[]>('list_financial_parameters',{period});
      setParameters(refreshed);
    }catch(e){setParameters([]);setParamMessage(`Vigência salva em ${periodLabel(savedPeriod)}, mas a lista não pôde ser atualizada: ${explainError(e)}. Clique em Atualizar parâmetros.`);}
    if(viewedPeriod===period){
      try{setDrePreview(await invoke<typeof drePreview>('get_dre_preview',{period}));setDreError('');}
      catch(e){setDrePreview(null);setDreError(`Não foi possível atualizar a prévia: ${explainError(e)}`);}
    }
    setParamBusy(false);
  }
  const [viewedPeriod,setViewedPeriod] = useState<string|null>(null);
  const [periodNotice,setPeriodNotice] = useState('');
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
  const [recipeProductSearch, setRecipeProductSearch] = useState('');
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
  const [expenseKind,setExpenseKind] = useState('FIXA');
  const [expenseCategory,setExpenseCategory] = useState('');
  const [expenseDescription,setExpenseDescription] = useState('');
  const [expenseAmount,setExpenseAmount] = useState('');
  const [expenseReference,setExpenseReference] = useState('');
  const [expenseBusy,setExpenseBusy] = useState(false);
  const [expenseError,setExpenseError] = useState('');
  const [expenseNotice,setExpenseNotice] = useState('');
  const [expenseRows,setExpenseRows] = useState<Array<{id:number;period:string;expenseKind:string;category:string;description:string;amountCents:number;reference:string}>>([]);
  const [dreBusy,setDreBusy] = useState(false);
  const [dreError,setDreError] = useState('');
  type DreWorkbookSource={period:string;filename:string;sha256:string;sourceMonthLabel:string;revenueCents:number;confirmation:string;rows:Array<{sourceRow:number;label:string;rawAuxiliary:string;rawValue:string;valueCents:number|null;valueKind:string}>};
  const [dreWorkbook,setDreWorkbook]=useState<DreWorkbookSource|null>(null);
  const [dreWorkbookBusy,setDreWorkbookBusy]=useState(false);
  const [dreWorkbookMessage,setDreWorkbookMessage]=useState('');
  const [dreWorkbookError,setDreWorkbookError]=useState('');
  const [drePreview,setDrePreview] = useState<{period:string;revenueCents:number;paymentsCents:number;differenceCents:number;reconciled:boolean;approvedCmvCents:number|null;contributionBeforeOtherExpensesCents:number|null;pendingProductCodes:number;approvedProductCodes:number;status:string;unregisteredComponents:string[];recordedVariableCents:number;recordedFixedCents:number;recordedTaxCents:number;recordedExpenseCount:number;estimatedRoyaltiesCents:number|null;estimatedPaymentFees:Array<{code:string;label:string;baseCents:number;rateBasisPoints:number|null;estimatedFeeCents:number|null;status:string}>} | null>(null);
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
  const busy = pending || catalogLoading || dialogBusy || mappingSaving || recipeBusy || ingredientBusy || costBusy || salePriceBusy || dreBusy || expenseBusy || paramBusy || dreWorkbookBusy;
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
      const milliQuantity=parseQuantityMilliBase(recipeQty);
      const result = await invoke<typeof recipeCost>('set_recipe_line', {
        period, productCode: recipeProduct.trim(), ingredientCode: recipeIngredient.trim(), quantityMilliBase: milliQuantity,
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
  async function consultExpenses() {
    if(expenseBusy)return;
    setExpenseBusy(true);setExpenseError('');
    try{setExpenseRows(await invoke<typeof expenseRows>('list_expenses',{period}));}
    catch(e){setExpenseError(explainError(e));}
    finally{setExpenseBusy(false);}
  }
  async function saveExpense() {
    if(expenseBusy)return;
    setExpenseBusy(true);setExpenseError('');setExpenseNotice('');
    try {
      if(!/^\d+$/.test(expenseAmount)||!Number.isSafeInteger(Number(expenseAmount)))throw new Error('Informe o valor em centavos inteiros não negativos.');
      await invoke('register_expense',{period,expenseKind,category:expenseCategory,description:expenseDescription,amountCents:Number(expenseAmount),reference:expenseReference});
      setExpenseNotice('Lançamento salvo nesta competência; confira sua classificação.');
      setExpenseCategory('');setExpenseDescription('');setExpenseAmount('');setExpenseReference('');
      setExpenseRows(await invoke<typeof expenseRows>('list_expenses',{period}));
      setDrePreview(null);
    } catch(e){setExpenseError(explainError(e));}
    finally{setExpenseBusy(false);}
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
      await refreshPeriod(period);
    } catch (e) { setError(explainError(e)); }
    finally { setPending(false); }
  }
  /** Descarta resultados do mês anterior antes de trocar ano/mês ou consultar novamente. */
  function clearPeriodViews(clearInputs=false){
    setResult(null);setFilter('');setEditingCode(null);setEditedName('');setEditedCategory('');
    setIngredients([]);setIngredientError('');setIngredientInfo('');
    setRecipeCost(null);setRecipeDetail(null);setRecipeError('');setRecipeApprovalMessage('');
    setCostRows([]);setCmvSummary(null);setCostError('');
    setExpenseRows([]);setExpenseError('');setExpenseNotice('');
    setDrePreview(null);setDreError('');setSalePriceNotice('');
    setDreWorkbook(null);setDreWorkbookError('');setDreWorkbookMessage('');
    setParameters([]);setParamMessage('');
    setViewedPeriod(null);
    if(clearInputs){
      setProductsPath(null);setPaymentsPath(null);
      setRecipeProduct('');setRecipeProductSearch('');setRecipeIngredient('');setRecipeQty('');setRecipeApprovalNote('');
      setIngredientCode('');setIngredientName('');setIngredientQty('');setIngredientCost('');
      setIngredientSupplier('');setIngredientFreight('0');setIngredientSt('0');
      setSalePriceCode('');setSalePriceCents('');
      setExpenseCategory('');setExpenseDescription('');setExpenseAmount('');setExpenseReference('');
      cancelParameterEdit();
      setPeriodNotice('Competência alterada. Clique em Consultar competência para carregar os dados de todos os módulos.');
    }
  }
  async function refreshPeriod(reference:string){
    const records=await consultPeriodModules(reference,(command,args)=>invoke(command,args));
    const summary=records.load_period_summary;
    if(summary.status==='fulfilled')setResult(summary.value as ImportSummary);
    else setError(`Conciliação indisponível para ${reference}: ${explainError(summary.reason)}`);

    const ingredientResult=records.list_ingredients;
    if(ingredientResult.status==='fulfilled')setIngredients(ingredientResult.value as typeof ingredients);
    else setIngredientError(explainError(ingredientResult.reason));

    const costs=records.monthly_cost_overview;
    if(costs.status==='fulfilled')setCostRows(costs.value as typeof costRows);
    else setCostError(explainError(costs.reason));

    const cmv=records.monthly_cmv_summary;
    if(cmv.status==='fulfilled')setCmvSummary(cmv.value as typeof cmvSummary);
    else setCostError(previous=>[previous,explainError(cmv.reason)].filter(Boolean).join(' · '));

    const dre=records.get_dre_preview;
    if(dre.status==='fulfilled')setDrePreview(dre.value as typeof drePreview);
    else setDreError(explainError(dre.reason));

    const expenses=records.list_expenses;
    if(expenses.status==='fulfilled')setExpenseRows(expenses.value as typeof expenseRows);
    else setExpenseError(explainError(expenses.reason));

    const params=records.list_financial_parameters;
    if(params.status==='fulfilled')setParameters(params.value as FinancialParameter[]);
    else setParamMessage(explainError(params.reason));
    const reference=records.get_validated_dre_workbook;
    if(reference.status==='fulfilled')setDreWorkbook(reference.value as DreWorkbookSource|null);
    else setDreWorkbookError(explainError(reference.reason));
    const errors=Object.values(records).filter(item=>item.status==='rejected').length;
    setViewedPeriod(reference);
    setPeriodNotice(errors===0
      ? `Competência ${periodLabel(reference)} atualizada em todos os módulos.`
      : `Competência ${periodLabel(reference)} consultada. ${errors} módulo(s) sem dados ou com pendência; confira os avisos nas seções correspondentes.`);
  }
  async function importValidatedDreWorkbook(){
    if(busy||!/^20\d\d$/.test(year))return;
    setDreWorkbookError('');setDreWorkbookMessage('');
    try{
      const chosen=await open({multiple:false,directory:false,title:'Selecionar planilha DRE validada para a competência',filters:[{name:'Planilha Excel',extensions:['xlsx','xls']}]});
      if(typeof chosen!=='string')return;
      setDreWorkbookBusy(true);
      try{
        const saved=await invoke<DreWorkbookSource>('import_validated_dre_workbook',{period,path:chosen});
        setDreWorkbook(saved);
        setDreWorkbookMessage('Referência registrada com arquivo original e rubricas preservadas. Não foram criados lançamentos contábeis duplicados.');
      }catch(e){setDreWorkbookError(explainError(e));}
      finally{setDreWorkbookBusy(false);}
    }catch(e){setDreWorkbookError(explainError(e));}
  }
  function sourceValue(row:DreWorkbookSource['rows'][number]){
    if(row.valueKind==='MONETARIO'&&row.valueCents!==null)return brl(row.valueCents);
    if(row.valueKind==='PERCENTUAL'&&Number.isFinite(Number(row.rawValue)))return (Number(row.rawValue)*100).toFixed(2)+'%';
    return row.rawValue||'—';
  }
  async function loadSaved() {
    if (busy || !/^20\d\d$/.test(year)) return;
    setPending(true);setError(null);clearPeriodViews();
    try { await refreshPeriod(period); }
    catch(e){setError(explainError(e));}
    finally {setPending(false);}
  }
  const recipeCandidates=findRecipeCandidates(costRows,recipeProductSearch);
  const selectedRecipeRow=costRows.find(row=>row.productCode===recipeProduct);
  const selectedRecipeApproved=selectedRecipeRow?.status==='FICHA_APROVADA'||Boolean(recipeApprovalMessage);
  const hasTestIngredient=Boolean(recipeDetail?.lines.some(line=>line.ingredientCode.toUpperCase().includes('TESTE')));
  function selectRecipeProduct(code:string){
    setRecipeProduct(code);setRecipeProductSearch('');setRecipeIngredient('');setRecipeQty('');
    setRecipeCost(null);setRecipeDetail(null);setRecipeApprovalNote('');setRecipeApprovalMessage('');setRecipeError('');
  }
  const visibleProducts = result?.unmappedProducts.filter((p) => `${p.externalCode} ${p.name} ${p.category}`.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR'))) || [];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">D</div><div><strong>DRE Mais1</strong><small>Gestão financeira offline</small></div></div>
        <nav aria-label="Navegação principal" className="app-nav">
          {[
            ['period-heading','Competência'],['catalog-heading','Catálogo'],['ingredient-heading','Insumos'],['recipe-heading','Fichas técnicas'],
            ['cmv-preview-heading','CMV'],['price-heading','Preços de venda'],['expense-heading','Despesas'],['dre-preview-heading','Prévia da DRE'],
            ['parameters-heading','Parâmetros financeiros'],['validated-dre-heading','DRE da planilha'],['appearance-heading','Aparência'],
          ].map(([id,label]) => <button key={id} type="button" className={activeSection === id ? 'nav-link nav-active' : 'nav-link'} onClick={() => navigate(id)}>{label}</button>)}
        </nav>
        <div className="sidebar-bottom"><span className="status-dot" /> Dados armazenados localmente <small>DRE em validação · Sem fechamento definitivo</small></div>
      </aside>
      <main className="content">
        <header className="page-header"><div><span className="eyebrow">VISÃO GERENCIAL</span><h1>DRE Mais1</h1><p>Vendas, custos e despesas organizados por competência. Fechamento sujeito à validação.</p></div><div className="header-tag">Processamento offline</div></header>
        <section className="section-block" aria-labelledby="period-heading">
          <div className="section-heading"><span className="step">01</span><div><h2 id="period-heading">Período de referência</h2><p>O mês selecionado deve coincidir com o período indicado pelos pagamentos.</p></div></div>
          <div className="selectors"><label>Ano<input type="text" inputMode="numeric" maxLength={4} value={year} disabled={busy} onChange={(e) => { clearPeriodViews(true); setYear(e.target.value); }} aria-label="Ano" /></label><label>Mês<select value={month} disabled={busy} onChange={(e) => { clearPeriodViews(true); setMonth(e.target.value); }} aria-label="Mês">{months.map(m => <option key={m.value} value={m.value}>{m.label[0].toUpperCase() + m.label.slice(1)}</option>)}</select></label><div className="selected-period">Competência <strong>{periodLabel(period)}</strong></div><button type="button" className="primary-button" disabled={busy || !/^20\d\d$/.test(year)} onClick={loadSaved}>{pending?'Consultando todos os módulos…':'Consultar competência'}</button></div>
          {periodNotice && <p role="status" className="period-notice">{periodNotice}</p>}
          {viewedPeriod && <p className="footnote">Dados exibidos referentes à competência consultada: <strong>{periodLabel(viewedPeriod)}</strong>. A prévia da DRE permanece sujeita às validações de fechamento.</p>}
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
        </> : <section className="empty-state"><strong>Aguardando consulta de competência</strong><p>Clique em Consultar competência para atualizar os módulos ou selecione relatórios para uma nova importação.</p></section>}
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
          <div className="recipe-selection" role="region" aria-label="Selecionar produto vendido para ficha técnica">
            <label htmlFor="recipe-product-search">Localizar produto vendido pelo nome ou código</label>
            <input id="recipe-product-search" type="search" value={recipeProductSearch}
              disabled={recipeBusy||busy} onChange={e=>setRecipeProductSearch(e.target.value)}
              placeholder="Ex.: cappuccino, café ou código" />
            {costRows.length>0 ? <>
              <p className="footnote">Selecione um produto mapeado da competência {periodLabel(period)}. Prioridade para fichas pendentes. {recipeCandidates.length} opção(ões) exibidas.</p>
              {recipeCandidates.length>0
                ? <div className="recipe-choices">{recipeCandidates.map(product=><button
                    type="button" className={recipeProduct===product.productCode?'recipe-choice selected':'recipe-choice'}
                    key={product.productCode} disabled={busy} aria-pressed={recipeProduct===product.productCode}
                    onClick={()=>selectRecipeProduct(product.productCode)}>
                      <strong>{product.productName}</strong><span className="mono">{product.productCode}</span>
                      <small>{recipeStatusLabel(product.status)}</small>
                    </button>)}</div>
                : <p className="footnote">Nenhum produto mapeado encontrado nesta busca.</p>}
            </> : <p className="footnote">Clique em Consultar competência para carregar a lista de produtos vendidos. Enquanto isso, você ainda pode informar o código manualmente.</p>}
            {selectedRecipeRow && <p className="recipe-selected"><strong>Selecionado:</strong> {selectedRecipeRow.productName} · {selectedRecipeRow.productCode} · {recipeStatusLabel(selectedRecipeRow.status)}</p>}
          </div>
          <div className="selectors">
            <label>Código do produto vendido<input value={recipeProduct} disabled={recipeBusy||busy} onChange={e=>selectRecipeProduct(e.target.value)} placeholder="Selecione acima ou informe o código"/></label>
            <label>Código do insumo<input list="recipe-ingredient-options" value={recipeIngredient} disabled={recipeBusy||busy} onChange={e=>setRecipeIngredient(e.target.value)} placeholder="Busque código ou selecione abaixo"/></label>
            <datalist id="recipe-ingredient-options">{ingredients.map(ingredient=><option key={ingredient.code} value={ingredient.code} label={`${ingredient.name} — ${ingredient.baseUnit} — ${brl(ingredient.totalCents)}`}/>)}</datalist>
            <label>Consumo (G, ML ou UN) — aceita fração<input value={recipeQty} disabled={recipeBusy} inputMode="decimal" onChange={e=>setRecipeQty(e.target.value)} placeholder="Ex.: 11,5 ou 150" /></label>
            <button type="button" className="primary-button" disabled={busy || selectedRecipeApproved || !recipeProduct.trim() || !recipeIngredient.trim() || !recipeQty.trim()} onClick={saveRecipeLine}>Adicionar ingrediente à ficha</button>
            <button type="button" className="outline-button" disabled={busy || !recipeProduct.trim()} onClick={inspectRecipe}>Consultar custo da ficha</button>
          </div>
          <p>Consumo permite até três casas decimais com vírgula (ex.: 11,5 G ou 0,250 UN). Selecione apenas produtos mapeados e insumos com custo registrado na mesma competência. Fichas aprovadas permanecem bloqueadas.</p>
          {selectedRecipeApproved && <div className="feedback feedback-info" role="status">Ficha aprovada: não é possível adicionar ingredientes nem alterar a composição. Consulte os detalhes abaixo.</div>}
          {ingredients.length===0 && <p className="footnote">Não há insumos com custo carregados nesta competência. Cadastre custos de compra e consulte a competência antes de montar fichas reais.</p>}
          {hasTestIngredient && <div className="feedback feedback-error" role="alert">Ficha com insumo de teste identificado. Não aprove como receita real.</div>}
          {recipeDetail && <div className="selectors">
            <label>Conferência da ficha (justificativa obrigatória)<input value={recipeApprovalNote} maxLength={500} disabled={recipeBusy} onChange={e=>setRecipeApprovalNote(e.target.value)} placeholder="Conferi todos os insumos e quantidades da receita"/></label>
            <button type="button" className="primary-button" disabled={busy||selectedRecipeApproved||hasTestIngredient||!recipeApprovalNote.trim()} onClick={approveCurrentRecipe}>Aprovar ficha desta competência</button>
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
            <p>Royalties estimados (percentual vigente sobre receita conciliada): <strong>{drePreview.estimatedRoyaltiesCents === null ? 'Pendente — sem taxa histórica confirmada' : brl(drePreview.estimatedRoyaltiesCents)}</strong>. Valor calculado, não confirmado como lançamento.</p>
            <p>Taxas estimadas por meio de pagamento (sem incluir nas despesas registradas):</p>
            <div className="scroll-table"><table><thead><tr><th>Meio</th><th>Base</th><th>Taxa</th><th>Estimativa</th></tr></thead><tbody>{drePreview.estimatedPaymentFees.map(fee=><tr key={fee.code}><td>{fee.label}</td><td>{brl(fee.baseCents)}</td><td>{fee.rateBasisPoints===null?'Conferir':(fee.rateBasisPoints/100).toFixed(2)+'%'}</td><td>{fee.estimatedFeeCents===null?'Pendente':brl(fee.estimatedFeeCents)}</td></tr>)}</tbody></table></div>
            <p>Despesas registradas ({drePreview.recordedExpenseCount} lançamentos): variáveis {brl(drePreview.recordedVariableCents)}, fixas {brl(drePreview.recordedFixedCents)}, tributos {brl(drePreview.recordedTaxCents)}. Valores ainda não homologados como completos.</p>
            <p><strong>Total registrado: {brl(drePreview.recordedVariableCents + drePreview.recordedFixedCents + drePreview.recordedTaxCents)}</strong> — soma dos lançamentos classificados nesta competência, não representa o total definitivo de despesas.</p>
            <p>Componentes ainda sem apuração: {drePreview.unregisteredComponents.join('; ')}. Nenhum resultado líquido ou lucro é calculado nesta prévia.</p>
          </div>}
        </section>
        <section className="section-block" aria-labelledby="validated-dre-heading">
          <div className="section-heading"><span className="step">✓</span><div><h2 id="validated-dre-heading">DRE da planilha — referência validada</h2>
            <p>Espelho das rubricas e valores do Excel preservado no SQLite. Não soma subtotais nem transfere automaticamente estes valores para despesas ou CMV operacional.</p></div></div>
          <div className="action-line">
            <p>Competência: {periodLabel(period)} · Origem: aba DRE MENSAL.</p>
            <button type="button" className="outline-button" onClick={importValidatedDreWorkbook} disabled={busy||Boolean(dreWorkbook)}>
              {dreWorkbookBusy?'Registrando arquivo…':'Registrar planilha DRE validada'}
            </button>
          </div>
          {!dreWorkbook&&!dreWorkbookError&&<p className="footnote">Primeiro consulte a competência. O cadastro exige receita igual aos relatórios conciliados. Referências cadastradas são imutáveis.</p>}
          {dreWorkbookError&&<div className="feedback feedback-error" role="alert">{dreWorkbookError}</div>}
          {dreWorkbookMessage&&<div className="feedback feedback-info" role="status">{dreWorkbookMessage}</div>}
          {dreWorkbook&&<>
            <div className="feedback feedback-info" role="status">
              <strong>Arquivo preservado: {dreWorkbook.filename} · {periodLabel(dreWorkbook.period)}</strong>
              <p>Receita de referência: {brl(dreWorkbook.revenueCents)} · {dreWorkbook.rows.length} rubricas · SHA-256: <code>{dreWorkbook.sha256.slice(0,12)}…</code>.</p>
              <p>Rótulo de mês no arquivo: {dreWorkbook.sourceMonthLabel||'Não informado'}. Preservado sem ajustar os valores.</p>
            </div>
            <div className="scroll-table" aria-label="Valores originais validados da DRE">
              <table><thead><tr><th>Célula</th><th>Rubrica</th><th>Valor de referência</th><th>Auxiliar C</th><th>Tipo</th></tr></thead>
                <tbody>{dreWorkbook.rows.map(row=><tr key={row.sourceRow}>
                  <td className="mono">D{row.sourceRow}</td><td>{row.label}</td><td className="num">{sourceValue(row)}</td>
                  <td>{row.rawAuxiliary||'—'}</td><td>{row.valueKind==='MONETARIO'?'Monetário':row.valueKind==='PERCENTUAL'?'Percentual':row.valueKind==='SEM_VALOR'?'Sem valor':'Texto'}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <p className="footnote">Arquivo original preservado. Esta tabela é uma referência documental; totais, subtotais e percentuais não constituem lançamentos independentes.</p>
          </>}
        </section>
        <section className="section-block" aria-labelledby="expense-heading">
          <div className="section-heading"><span className="step">11</span><div><h2 id="expense-heading">Despesas por competência</h2><p>Lançamentos reais e identificados por categoria. Nenhuma alíquota tributária é presumida.</p></div></div>
          <div className="selectors">
            <label>Tipo<select value={expenseKind} disabled={expenseBusy} onChange={e=>setExpenseKind(e.target.value)}><option value="FIXA">Despesa fixa</option><option value="VARIAVEL">Despesa variável</option><option value="TRIBUTO">Tributo informado</option></select></label>
            <label>Categoria<input maxLength={120} value={expenseCategory} disabled={expenseBusy} onChange={e=>setExpenseCategory(e.target.value)} placeholder="Ex.: Aluguel" /></label>
            <label>Descrição<input maxLength={200} value={expenseDescription} disabled={expenseBusy} onChange={e=>setExpenseDescription(e.target.value)} /></label>
            <label>Valor em centavos<input inputMode="numeric" value={expenseAmount} disabled={expenseBusy} onChange={e=>setExpenseAmount(e.target.value)} placeholder="250000 = R$ 2.500,00" /></label>
            <label>Referência documental<input maxLength={200} value={expenseReference} disabled={expenseBusy} onChange={e=>setExpenseReference(e.target.value)} placeholder="Ex.: recibo 123" /></label>
            <button type="button" className="primary-button" disabled={expenseBusy||!expenseCategory.trim()||!expenseDescription.trim()||!expenseAmount.trim()} onClick={saveExpense}>Registrar despesa</button>
            <button type="button" className="outline-button" disabled={expenseBusy} onClick={consultExpenses}>Consultar lançamentos</button>
          </div>
          {expenseError && <div className="feedback feedback-error" role="alert">{expenseError}</div>}
          {expenseNotice && <div className="feedback feedback-info" role="status">{expenseNotice}</div>}
          {expenseRows.length>0 && <div className="scroll-table"><table><thead><tr><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Documento</th><th className="num">Valor</th></tr></thead><tbody>{expenseRows.map(row=><tr key={row.id}><td>{row.expenseKind}</td><td>{row.category}</td><td>{row.description}</td><td>{row.reference||'Não informado'}</td><td className="num">{brl(row.amountCents)}</td></tr>)}</tbody></table></div>}
          <p className="footnote">Os valores lançados representam apenas despesas registradas. É necessária conferência de completude antes do fechamento da DRE.</p>
        </section>
        <section className="section-block" aria-labelledby="parameters-heading">
          <div className="section-heading"><span className="step">%</span><div><h2 id="parameters-heading">Configurações · Parâmetros financeiros</h2><p>Taxas editáveis por competência, com histórico. Alterações não sobrescrevem meses anteriores.</p></div></div>
          <div className="action-line">
            <p>Referência consultada: {viewedPeriod===period?periodLabel(period):'Ainda não consultada'}. Percentuais não são despesas lançadas automaticamente.</p>
            <div className="parameter-actions">
              <button type="button" className="outline-button" disabled={busy} onClick={()=>loadParameters(period)}>{paramBusy?'Consultando…':'Atualizar parâmetros'}</button>
              <button type="button" className="primary-button" disabled={busy} onClick={beginNewParameter}>Cadastrar nova regra</button>
            </div>
          </div>
          {parameters.length>0 && <div className="scroll-table"><table><thead><tr><th>Regra</th><th>Categoria</th><th>Base</th><th>Vigência</th><th>Percentual</th><th>Ação</th></tr></thead><tbody>
            {parameters.map(p=><tr key={p.code}><td>{p.name} ({p.code})</td><td>{p.category}</td><td>{p.calculationBase}</td><td>{p.effectiveFrom||'Não vigente'}</td><td>{p.basisPoints===null?'Pendente':(p.basisPoints/100).toFixed(2)+'%'}</td>
              <td><button type="button" className="outline-button" disabled={busy} onClick={()=>editNextVersion(p)}>Nova vigência</button></td></tr>)}
          </tbody></table></div>}
          {paramMode && <div id="parameter-edit-form" className="parameter-edit-form" role="region" aria-label={paramMode==='version'?'Editar próxima vigência':'Cadastrar nova regra'}>
            <div className="parameter-edit-header">
              <div><strong>{paramMode==='version'?`Nova vigência de ${paramName}`:'Cadastro de nova regra financeira'}</strong>
                <p>{paramMode==='version'?'Identificação e categoria permanecem protegidas. Confira os campos destacados, ajuste a competência e o percentual e salve quando estiver pronto.':'Preencha os dados da regra, a competência inicial e o percentual. Nenhum valor é gravado antes de salvar.'}</p></div>
              <span className="edit-mode-tag">Em edição · ainda não salvo</span>
            </div>
            <div className="selectors parameter-fields">
              <label>Código único<input value={paramCode} maxLength={64} readOnly={paramMode==='version'} disabled={paramBusy} onChange={e=>setParamCode(e.target.value.toUpperCase())} placeholder="EX.: CREDITO" /></label>
              <label>Descrição<input value={paramName} maxLength={120} readOnly={paramMode==='version'} disabled={paramBusy} onChange={e=>setParamName(e.target.value)} placeholder="Ex.: Cartão de crédito" /></label>
              <label>Categoria<select value={paramCategory} disabled={paramBusy||paramMode==='version'} onChange={e=>setParamCategory(e.target.value)}><option value="PAYMENT_FEE">Taxa de pagamento</option><option value="ROYALTIES">Royalties</option><option value="PLATFORM_FEE">Taxa plataforma</option><option value="TAX_ESTIMATE">Estimativa tributária</option><option value="OTHER">Outra</option></select></label>
              <label>Base de cálculo<select value={paramBase} disabled={paramBusy||paramMode==='version'} onChange={e=>setParamBase(e.target.value)}><option value="PAYMENT_METHOD">Meio de pagamento</option><option value="NET_REVENUE">Receita após descontos</option><option value="PLATFORM_SALES">Vendas da plataforma</option><option value="DOCUMENTED">Valor documental</option><option value="MANUAL">Manual</option></select></label>
              <label className="parameter-required">Início da vigência (mês/ano) *<input type="month" required value={paramEffectiveFrom} disabled={paramBusy} onChange={e=>setParamEffectiveFrom(e.target.value)} aria-label="Competência de início da vigência" /></label>
              <label className="parameter-required">Percentual (%) *<input ref={paramRateInput} required inputMode="decimal" value={paramRate} disabled={paramBusy} onChange={e=>setParamRate(e.target.value)} placeholder="Ex.: 2,50" aria-label="Novo percentual da regra" /></label>
              <label className="parameter-required">Fonte da informação *<input required value={paramSource} maxLength={200} disabled={paramBusy} onChange={e=>setParamSource(e.target.value)} placeholder="Ex.: contrato, operador" /></label>
              <label>Justificativa (opcional)<input value={paramNote} maxLength={500} disabled={paramBusy} onChange={e=>setParamNote(e.target.value)} placeholder="Ex.: mudança contratual" /></label>
            </div>
            <p className="footnote">* Campos obrigatórios. Uma nova vigência não substitui uma regra cadastrada para o mesmo mês.</p>
            <div className="action-line">
              <p>Vigência a registrar: <strong>{paramEffectiveFrom || 'Selecione mês/ano'}</strong>. Ao cancelar, nada será gravado.</p>
              <div className="parameter-actions">
                <button type="button" className="outline-button" disabled={paramBusy} onClick={cancelParameterEdit}>Cancelar</button>
                <button type="button" className="primary-button" disabled={paramBusy||busy||!paramCode.trim()||!paramName.trim()||!paramRate.trim()||!paramEffectiveFrom||!paramSource.trim()} onClick={saveParameter}>{paramBusy?'Salvando…':paramMode==='version'?'Salvar nova vigência':'Salvar nova regra'}</button>
              </div>
            </div>
          </div>}
          {paramMessage && <div className="feedback feedback-info" role="status">{paramMessage}</div>}
        </section>
        <section className="section-block" aria-labelledby="appearance-heading">
          <div className="section-heading"><span className="step">⚙</span><div><h2 id="appearance-heading">Configurações · Aparência</h2><p>Escolha o visual do aplicativo. Sua preferência é lembrada neste computador.</p></div></div>
          <div className="theme-options" role="group" aria-label="Tema do aplicativo">
            <button type="button" aria-pressed={themePreference === 'dark'} className={themePreference === 'dark' ? 'theme-option selected' : 'theme-option'} onClick={() => setThemePreference('dark')}>☾ Escuro</button>
            <button type="button" aria-pressed={themePreference === 'light'} className={themePreference === 'light' ? 'theme-option selected' : 'theme-option'} onClick={() => setThemePreference('light')}>☀ Claro</button>
            <button type="button" aria-pressed={themePreference === 'system'} className={themePreference === 'system' ? 'theme-option selected' : 'theme-option'} onClick={() => setThemePreference('system')}>▣ Acompanhar Windows</button>
          </div>
        </section>
        <footer>DRE Mais1 · Dados locais · Fechamento gerencial condicionado à conferência</footer>
      </main>
    </div>
  );
}
