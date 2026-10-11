# PROJECT CONTEXT — DRE Mais1

Objetivo: substituir gradualmente as planilhas do fechamento de loja por aplicação desktop offline, com regras explícitas e núcleo Rust. Este diretório contém a fundação e a importação dos dois relatórios XLS/XLSX da loja referentes a setembro/2026. Requisitos primários: Prompt Mestre do Projeto e os dois arquivos de origem.

Escopo ativo: selecionar relatórios, ler localmente, validar estrutura e período, normalizar pagamentos, calcular totais em centavos, conciliar, listar códigos sem cadastro e preservar os dados originais. Fora de escopo: CMV, DRE, fechamento definitivo, usuários, licença, nuvem, histórico anual.

Fontes verificadas:
- `tests/fixtures/produtos-set-2026.xlsx`: 122 linhas, 120 códigos vendidos, R$ 24.944,63.
- `tests/fixtures/pagamentos-set-2026.xlsx`: 9 linhas, competência explícita 09/2026, R$ 24.944,63.

Fonte não disponível nesta sessão: `09 - DRE - SET_2026 - LOJA SJP(1).xlsx` (consolidado) — necessária para verificar os 29 códigos não mapeados em relação à base antiga.

O projeto ainda não possui repositório Git remoto, build completo ou executável instalado. Banco e UI preparados no código, execução desktop pendente de validação no host com Rust.

---

## 2026-10-10 — Fonte consolidada analisada

Recebida `09 - DRE - SET_2026 - LOJA SJP.xlsx`. **10 abas reais**, 5.133 células com fórmula, 63 erros de cache; `Planilha1` não está neste arquivo. Confronto com os dois modelos originais confirmou setembro com totais de produtos/pagamentos R$ 24.944,63, 29 códigos vendidos sem entrada em `Base DRE` (R$ 3.653,70) e 42 categorias alteradas manualmente para `PARA COMER`. Fonte técnica: `docs/WORKBOOK_AUDIT_2026_09.md`, `DEPENDENCY_MAP_2026_09.md`, `DATA_MODEL_REVIEW_2026_09.md`, `IMPLEMENTATION_ROADMAP_REVIEW.md`. A arquitetura Tauri/React/Rust/SQLite e a migration 0001 foram preservadas; nenhum cálculo final de CMV/DRE é aprovado.


## Continuidade de 2026-10-11
Marco 1.2: está em preparação a carga opcional da planilha consolidada como cadastro legado de códigos, separada dos dois relatórios mensais, e a consulta de conciliação previamente salva. Migration 0002, `catalog.rs`, comandos Tauri e UI adicionados, mas compilação Rust/Tauri não testada. O Simples Nacional por faixa foi confirmado como **estimativa futura**; DAS efetivo por competência será mantido separado e média aproximada de R$ 1.800 não será aplicada automaticamente. Sem CMV/DRE até homologar o Marco 1.
