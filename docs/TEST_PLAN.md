# TEST PLAN — Marco 1

## Evidências desta sessão

**EXECUTADO / PASS (verificação independente Python, NÃO o parser Rust):** `python tools/verify_fixtures.py` — 13/13 testes incluindo cabeçalho deslocado, leitura de modelos XLSX, cabeçalhos, 120 códigos vendidos, 122 linhas, receitas positivas/ajustes/líquida, 9 pagamentos, competência 09/2026, normalização por método, conciliação em R$0 e migration SQLite com FK/unicidade.

**EXECUTADO / PASS (verificação de sintaxe frontend e função real):** transpile de 6 arquivos TS/TSX sem erros sintáticos e 4 asserções sobre `src/format.ts` executadas com Node.js + TypeScript global. Isso não substitui typecheck React nem build Vite.

**NÃO EXECUTADO:** Rust `cargo test`; TypeScript `npm test`; compilação frontend; `npm run tauri dev` e `tauri build` por ausência de dependências locais. Testes estão codificados, mas não é legítimo declará-los PASS.

## Cobertura Rust (programada para execução no host com toolchain)

- `importer.rs`: dinheiro em centavos incluindo negativo, rejeição de valores ausentes/fracionários, normalização manual e método desconhecido, mês divergente, cabeçalho faltante, cabeçalho deslocado, fixture setembro 120 códigos/valores, rejeição de competência mista, dinheiro vazio e arquivo corrompido.
- `database.rs`: migration, persistência do par, blob bruto salvo, idempotência/duplicata, atomicidade do erro de período, divergência persistida com status explícito, código mapeado detectado pelo ID externo.
- `format.test.ts`: formatação de centavos/negativo, rejeição de centavos não inteiros e rótulo de competência.

## Verificação manual obrigatória, após build

Abrir desktop, selecionar setembro, escolher ambos os arquivos; inspecionar total R$24.944,63 em cada, diferença R$0, sete métodos normalizados, 120 códigos não cadastrados num banco vazio. Repetir importação e verificar erro sem duplicação. Selecionar agosto e verificar bloqueio. Testar arquivos corrompidos, ausência de coluna, campos monetários ausentes e competência mista. Confirmar local físico do SQLite e que bytes dos arquivos e linhas permanecem acessíveis. Não iniciar CMV nem DRE nesta fase.

---

## 2026-10-10 — Novos testes de aceitação derivados do consolidado

- [ ] Banco catalogado com 135 códigos históricos (candidatos) identifica **29** códigos vendidos que não estão na base, sem criar receita ou custo fictício.
- [ ] Ingestão de XLS original preserva categoria original (10 categorias) e modelo de classificação reproduz `PARA COMER` para as 42 linhas observadas, com regra explícita e reversível.
- [ ] Auditoria de imports reprocessados não duplica dados nem altera arquivos originais.
- [ ] `COPO REUTILIZAVEL GELADOS` com dois registros distingue por ID; ficha usa exatamente o insumo escolhido.
- [ ] Preço `R$ -` e custo/volume ausente produzem pendência, não zero.
- [ ] Consumo teórico usa os mesmos itens/versionamentos da ficha técnica do CMV.
- [ ] Alterar custo/preço de outubro não muda o snapshot de setembro.
- [ ] Período agosto selecionado com pagamentos setembro bloqueia confirmação.
- [ ] Receita bruta 28.370,70, descontos -3.426,07, receita líquida 24.944,63; pagamentos 24.944,63, diferença 0.

**Executados nesta auditoria:** verificações independentes em Python da estrutura OOXML e de arquivos originais (ver `AUDIT_VERIFICATION.md` e `verify_audit.py`). **Não executados:** `cargo test`, `npm test`, integração Tauri; precisam ser rodados com toolchain preparada.


## Execução no incremento de 2026-10-11 (independente do parser Rust)
- `python tools/verify_legacy_catalog.py`: **9/9 PASS**, inclui contagem real de 135 referências válidas, 14 linhas `#N/A`, 120 vendas, 29 sem referência, R$ 3.653,70, conciliação e constraints/migração 0002.
- `python tools/verify_fixtures.py`: **13/13 PASS**, reproduz cálculos de origem, casos negativos e constraints da migration 0001.
- Parser TS/TSX com TypeScript global: **6/6 sintaxe PASS**. **Não é** typecheck, nem Vitest/React build.
- `cargo test`: **NOT EVALUATED** (`cargo` não instalado). `npm test`: **BLOCKED** (dependência Vitest indisponível). `npm view vite`: `EAI_AGAIN` (DNS npm). UI Tauri: **NOT EVALUATED** (Rust/WebKitGTK indisponíveis).
- Testes Rust acrescentados para catálogo histórico + 29 pendências e recuperação de importação armazenada, ainda pendentes de execução real.
- **Validação manual para homologar:** instalar toolchain, executar `cargo test`, `npm ci` quando houver lockfile, `npm test`, `npm run build`, `npm run tauri dev`; carregar consolidação opcional, depois os dois relatórios, verificar 29 pendências/centavos e consulta de período salvo após reiniciar.

## Marco 1.3 — Novos cenários de integridade
- [x] **Executado:** testes SQLite independentes (`python tools/verify_persistence_contract.py`) 8/8 PASS; cobrem BLOB original, hash/tamanho, valores alterados, linhas ausentes, competência e duplicidade, com dados sintéticos.
- [ ] **Rust não executado:** `importer::tests::table_is_read_from_preserved_bytes_not_mutable_disk_path`.
- [ ] **Rust não executado:** `database::tests::rejects_corrupted_persisted_amount_instead_of_showing_false_reconciliation`, `rejects_missing_rows_even_when_the_summary_totals_exist`, `rejects_modified_original_bytes_after_import`.
- [ ] **Rust não executado:** casos adicionais de rejeição de `1.234` e `1.23,45`, cabeçalhos duplicados; adicionar fixture específica se o parser Rust passar nos smoke tests.
- [ ] **Não executado:** compilação Rust, testes UI/Vitest, build e execução Tauri.
- [ ] **Manual:** confirmar UI de setembro e leitura persistida sem alterar BLOB, inclusive depois de reiniciar.

### Evidência adicional disponível
Consultar `docs/VERIFICATION_2026_10_11.md` para saída/escopo e códigos reais dos comandos executados em 11/10/2026. Os novos testes Rust continuam **NOT EVALUATED**.

## Incremento 1.4 — Persistência e interação
- [x] SQL independente: sem catálogo retorna estado não carregado; após reiniciar SQLite mantém arquivo e totais; falhas de hash/bytes/linhas/contador geram erro (5 testes executados).
- [ ] Testar em Rust `catalog::tests::persisted_catalog_status_survives_reopening_sqlite`.
- [ ] Testar em Rust corrupção de arquivo original e remoção de uma linha do catálogo.
- [ ] Testar em Tauri/React que cancelar diálogo de arquivo preserva conciliação existente.
- [ ] Testar em Tauri/React que o ano/mês permanece imutável durante importação, enquanto a operação estiver pendente.
- [ ] Testar reabertura do desktop com catálogo legado existente e botão de importação opcional bloqueado.
- [ ] Executar pipeline GitHub Actions no **repositório privado** e versionar lockfiles após primeira instalação válida.
