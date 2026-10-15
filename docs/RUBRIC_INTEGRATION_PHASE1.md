# Integração de rubricas da DRE — fase 1 (somente leitura)

**Data:** 2026-10-14  
**Status:** implementação proposta em branch; não homologada em Windows.

## Objetivo e limites

Exibir, junto ao espelho documental já validado, uma primeira classificação **estritamente informativa** de oito células da aba `DRE MENSAL`. Este incremento não recalcula a DRE, não insere despesas e não altera tabelas ou migrations. A classificação é derivada toda vez que `get_validated_dre_workbook` lê o arquivo preservado no SQLite.

## Contrato puro de domínio

`src-tauri/src/rubric_review.rs` recebe apenas `source_row`, `label`, `value_kind` e `value_cents`, sem dependência de SQLite, HTTP ou Tauri. A decisão de exibição não depende da posição de uma coluna alterável nem apenas de nome semelhante: **célula e rótulo esperado devem coincidir**. Divergência de rótulo ou ausência de valor monetário gera estado de revisão, jamais zero implícito.

| Célula | Rótulo esperado | Papel documental |
|---|---|---|
| D7 | Receita Total | RECEITA_DOCUMENTAL |
| D13 | DESCONTOS | AJUSTE_DE_RECEITA |
| D15 | Despesas Variáveis | SUBTOTAL_VARIAVEIS |
| D33 | Alíquota Simples Nacional | COMPONENTE_TRIBUTO |
| D34 | Royalties | COMPONENTE_ROYALTIES |
| D52 | Despesas Fixas | SUBTOTAL_FIXAS |
| D75 | Folha de Pagamento | COMPONENTE_FOLHA |
| D105 | Resultado | RESULTADO_DOCUMENTAL |

As demais células são `SEM_CLASSIFICACAO`, situação normal durante a análise das rubricas restantes e **não** uma falha do importador nem permissão de lançamento.

Todos os itens recebem a política `NAO_LANCAR_AUTOMATICAMENTE`. Os campos de revisão aparecem como `rubricReview` no `SourceView` existente, evitando novo comando Tauri e mantendo a consulta e o arquivo originais intocados.

## Garantias contábeis

- `dre_workbook_sources` e `dre_workbook_rows` continuam imutáveis (migration 0013).
- Nenhuma escrita na tabela `managerial_expenses`, nenhuma migration, nenhum novo cálculo de CMV, folha, royalties ou tributos.
- Não somar despesas variáveis + componentes individuais, nem despesas fixas + folha: o papel documental explica esses componentes **sem contabilizá-los**.
- A referência de setembro/2026 permanece R$ 24.944,63 de receita; R$ 11.895,31 de despesas variáveis; R$ 9.288,76 de despesas fixas; resultado **informado** R$ 3.760,57. Valores para comparação do espelho, não para fechamento operacional.
- Nenhuma inferência automática de lançamentos por semelhança textual; importação e conciliação originais permanecem como estavam.

## Próximas fases (não incluídas nesta entrega)

1. Inventariar os detalhes financeiros da planilha e confirmar sua natureza, cobertura dos subtotais e relação com categorias da operação.
2. Definir chaves de origem e associação auditável com registros operacionais já existentes, com regras explícitas para `1:1`, `1:N`, componentes e pagamentos efetivos.
3. Desenvolver fluxo administrativo de associação/reconciliação sem criação implícita de lançamentos; validar idempotência e impossibilidade de dupla contabilização em dados sintéticos.
4. Revalidar a GUI no Windows com cópia do SQLite já conciliado. A homologação e o banco de referência atual não são substituídos por esta branch.

## Testes e critérios de aceite

- Rust: classificar apenas rótulo + célula conhecidos; sinalizar valor ausente e rótulo divergente; não classificar rubrica desconhecida como despesa automática.
- Regressão: `dre_workbook::save` preserva dados e bloqueia segunda importação; `dre_workbook::load` retorna os indicadores e revisão sem gravar despesas.
- Frontend: a tabela original continua exibindo as mesmas cifras e adiciona campos de papel/situação.
- Executar CI `cargo test`, `npm test`, `npm run build` e builds Linux/Windows; coletar status reais antes de declarar PASS.
