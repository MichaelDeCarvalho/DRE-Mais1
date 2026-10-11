# Evidências — Incremento 0.1.3 — 11/10/2026

## Ambiente
- Node: v22.16.0 disponível, TypeScript global disponível.
- `cargo`/`rustc`: comando não encontrado. Dependências React/Vite/Vitest não instaladas.
- `npm view vite version --fetch-retries=0 --fetch-timeout=6000`: falha DNS `EAI_AGAIN` ao acessar `registry.npmjs.org`. Sem instalação de dependências.

## Verificações realmente executadas
| Comando / verificação | Resultado | O que comprova |
|---|---|---|
| `python tools/verify_fixtures.py` | **13/13 PASS, exit 0** | Fixture setembro, totais, normalização, algumas constraints SQLite (independente de Rust) |
| `python tools/verify_legacy_catalog.py` | **9/9 PASS, exit 0** | 135 códigos históricos válidos, 14 códigos inválidos, 29 códigos vendidos sem mapeamento, R$ 3.653,70 (independente de Rust) |
| `python tools/verify_persistence_contract.py` | **8/8 PASS, exit 0** | Migration 0001/0002 e contrato SQL de detecção de dados alterados, com linhas sintéticas (não executa Rust) |
| `typescript.transpileModule` | **6/6 PASS de sintaxe** | Somente sintaxe dos 6 arquivos TS/TSX, não typecheck |
| Funções reais transpiladas de `src/format.ts`, executadas com Node | **4/4 PASS** | Formatação monetária e competência |
| `cd src-tauri && cargo test` | **exit 127** | Não executado por ausência de Cargo |
| `npm test` | **exit 127** | Vitest não instalado |
| `npm run build` | **exit 2** | TypeScript reporta React/JSX/Vitest/Vite e outras dependências não localizadas; não foi gerado build |
| `npm run tauri dev` | **não executado** | Não há Rust/toolchain nem dependências nativas homologadas |

## Alterações de código avaliadas mas NÃO compiladas
1. `src-tauri/src/importer.rs`: parsing via `Cursor<&[u8]>` do `OriginalFile`, rejeição de cabeçalho obrigatório duplicado, parsing de moeda mais estrito, testes Rust.
2. `src-tauri/src/catalog.rs`: mesmo snapshot para `Base DRE`.
3. `src-tauri/src/database.rs`: verificação de quantidade/soma/hash/bytes na recuperação, testes Rust.

A documentação oficial do Calamine 0.36.1 confirma a existência de `open_workbook_auto_from_rs` (ver https://docs.rs/calamine/latest/calamine/fn.open_workbook_auto_from_rs.html). Isso **não** equivale a compilar o projeto ou homologar XLSX específico em Rust.

## Critérios ainda necessários para o Marco 1 ser aceito
- [ ] `cargo test` real aprovado no host de desenvolvimento;
- [ ] `npm install`, lockfile versionado, `npm test` e `npm run build` aprovados;
- [ ] aplicativo Tauri inicia; SQLite criado em `app_data_dir`;
- [ ] relatórios e catálogo de setembro importados usando interface real;
- [ ] conciliação R$ 0,00, sete métodos normalizados, 29 códigos sem mapeamento, relatório salvo reabre corretamente;
- [ ] reimportação/duplicidade, período divergente, integridade persistida, arquivo inválido verificados de ponta a ponta.

Não iniciar CMV ou DRE enquanto não houver evidência dessa homologação.

## Retomada v0.1.4 — 11/10/2026

### Escopo novo
- Comando Rust `get_catalog_status`: depois da reinicialização, consulta SQLite e valida integridade SHA-256/tamanho do arquivo histórico e contagem das linhas válidas/inválidas antes de informar à interface que o cadastro está carregado.
- Bloqueio de alterações de período e abertura de arquivos durante processamento; estado de verificação inicial explícito; cancelamento do diálogo preserva a conciliação já exibida.
- Testes Rust adicionados para catálogo persistido, corrupção, linha excluída e código com espaços. **Não executados neste ambiente**.
- Workflow de CI `.github/workflows/verification.yml` **criado, mas ainda não publicado/executado**. Linux Ubuntu 22.04 com pré-requisitos Tauri 2 conforme documentação oficial. Só utilizar com repositório **privado** devido às fixtures internas; nenhuma implantação SaaS ou backend foi criada.

### Evidências novas, execução real (Python/Node)

| Verificação | Resultado | Limitação |
|---|---|---|
| `python tools/verify_fixtures.py -v` | **13/13 PASS** | Independente; não chama Rust |
| `python tools/verify_legacy_catalog.py -v` | **9/9 PASS** | Independente; não chama Rust |
| `python tools/verify_persistence_contract.py -v` | **8/8 PASS** | SQL independente; não chama Rust |
| `python tools/verify_catalog_status_contract.py -v` | **5/5 PASS** | SQL independente; consulta equivalente, não executa função Rust |
| `typescript.transpileModule` (6 arquivos) | **6/6 sem erro sintático** | Não é typecheck nem build |
| `src/format.ts` transpilado e executado com Node | **4/4 PASS** | Valida funções reais de formatação, não UI |
| Análise YAML do workflow com PyYAML | **PASS** | Formato analisado; workflow não executado |
| `cargo test` | **exit 127** | `cargo: command not found`; testes Rust não executados |
| `npm test` | **exit 127** | `vitest: not found`; testes Vitest não executados |
| `npm run build` | **exit 2** | Sem dependências React/Vite/JSX; build não concluído |
| `npm run tauri dev/build` | **NÃO EXECUTADO** | Requer Cargo e dependências nativas |

**Status:** O Marco 1 continua **NÃO HOMOLOGADO**. Testes independentes não provam a execução do importador Rust ou da interface. São necessários compilação, teste real do fluxo desktop e inspeção dos valores após reinicialização. Versões de dependências e lockfiles não foram travadas; concluir após ambiente online.

### Caminho de verificação reproduzível
1. Em computador com Rust/Cargo, Node e dependências nativas Tauri 2, extrair o código num diretório privado.
2. Gerar/versionar `package-lock.json` e `src-tauri/Cargo.lock` na primeira instalação online.
3. Executar `npm test`, `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml` (sem marcar PASS antes da execução).
4. Executar `npm run tauri dev`; carregar a Base DRE de setembro e os dois relatórios. Verificar conciliação zero e 29 códigos pendentes.
5. Fechar/reabrir aplicativo e verificar se a indicação de catálogo persistido e a consulta de período salvo permanecem íntegras; testar duplicidade e erro de arquivo/período.
