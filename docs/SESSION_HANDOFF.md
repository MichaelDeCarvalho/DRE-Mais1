# SESSION HANDOFF — Marco 1.4 — 2026-10-11

## Objetivo
Continuar homologação técnica do marco 1; NÃO iniciar CMV, DRE ou licenciamento. Simples Nacional por faixa permanece somente como decisão futura (ADR-008).

## Alterações entregues
- `src-tauri/src/catalog.rs`: `catalog_status`, validando arquivo original por hash/tamanho e contagens; código textual com espaço nas extremidades normalizado; regressões Rust (incluindo consulta após reconexão e corrupção).
- `src-tauri/src/lib.rs`: comando Tauri `get_catalog_status`.
- `src/App.tsx`, `src/types.ts`: consulta de catálogo existente ao abrir a tela; carregamento duplicado bloqueado; seleção de competência e arquivo indisponível durante operações; cancelamento do seletor preserva resultado anterior.
- `tools/verify_catalog_status_contract.py`: 5 novos testes SQLite independentes.
- `.github/workflows/verification.yml`: pipeline de validação Linux para uso em repositório privado. Não executado; instalação de dependências ainda exige rede.
- `docs/DECISIONS.md`, `README.md`, `docs/VERIFICATION_2026_10_11.md`: ADR-011 e estado real dos testes.
- Versão 0.1.4 atualizada nos manifests.

## Restrições e evidência
Não há Rust/Cargo nem dependências React/Vite no ambiente; por isso os testes Rust/Vitest, build e inicialização Tauri seguem não executados. Não confundir verificações SQLite/Python e checagem sintática com homologação desktop.

## Próximo passo
No computador/runner Linux/Windows com Rust e Node, instalar dependências, gerar e versionar `package-lock.json`/`Cargo.lock`, executar `cargo test`, `npm test`, `npm run build`, abrir Tauri e testar setembro. Confirmar catálogo persistido após reiniciar, reimportação bloqueada e conciliação. Depois disso, avançar para o mapeamento de produtos.

## Estado
Código preparado em pacote local; GitHub não foi alterado e o pipeline não rodou. Marco 1 **não homologado**.

## 2026-10-11 — Preparação 0.1.5: compilação nativa

- **Criado:** `tools/preflight.py`, `docs/HOMOLOGATION_DESKTOP.md`, workflow Windows+Linux com `tauri build --no-bundle --ci` e coleta de lockfiles.
- **Alterados:** `.github/workflows/verification.yml`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `README.md`, `docs/DECISIONS.md`.
- **Executado:** quatro suítes Python/SQLite (35/35 PASS); verificação local dos manifests; `npm install --offline` (ENOTCACHED); `cargo test` (cargo ausente); `npm test` (vitest ausente); `npm run build` (módulos npm ausentes); `python tools/preflight.py` (exit 2, host bloqueado).
- **Não executado:** testes Rust, build Tauri e workflow em GitHub; nenhum binário desktop gerado. Não afirmar homologação.
- **Próxima ação:** em estação com rede e dependências Tauri, instalar, gerar os lockfiles, executar os jobs de compilação, abrir a janela e homologar cenários A–J em `docs/HOMOLOGATION_DESKTOP.md`. Não avançar para CMV/DRE.


## Preparação de repositório — 2026-10-11
- Repositório remoto ainda não criado/publicado; o conector GitHub atual permite operar em repositórios existentes, mas não oferece criação de repositório.
- Pacote de publicação separado da versão local: `tests/fixtures/` substituídas por cenários totalmente sintéticos com totais de aceite; `docs/audit_evidence/` e `test-results/` não integram o pacote.
- Testes independentes reexecutados nesse pacote: 13 fixtures + 9 catálogo + 8 SQLite + 5 status = 35 aprovados. Rust/Cargo, npm/Vitest e GUI não executados.
- Próxima ação: criar repositório privado vazio (sem README inicial) e enviar código por integração GitHub; iniciar CI para erros reais e gerar lockfiles.


## 2026-10-11 — CI real aprovado; homologacao GUI pendente

- Repositorio confirmado: `MichaelDeCarvalho/DRE-Mais1`, privado, `main`.
- Evidencia efetiva: [GitHub Actions run 38113251969](https://github.com/MichaelDeCarvalho/DRE-Mais1/actions/runs/38113251969), commit `5ab7f68`, Linux e Windows **SUCCESS**.
- Testes executados: `npm test`/Vitest, `npm run build`/TypeScript+Vite, `cargo test` **25/25 em cada OS**, verificadores Python/SQLite portaveis, compilacao Tauri `--no-bundle --ci`.
- Artefato Windows gerado, nao instalador nem GUI homologada: [download GitHub](https://github.com/MichaelDeCarvalho/DRE-Mais1/actions/runs/38113251969/artifacts/11693050659) (retencao ate 18/10/2026).
- Falhas anteriores resolvidas por `2bfe680` (fixture divergente em -100 centavos) e `5ab7f68` (CI Python sem artifact_tool).
- Arquivos atuais extras: `docs/CI_VERIFIED_2026_10_11.md` e `tools/smoke_windows.ps1`; o ultimo entrou no CI como diagnostico Windows opcional, nao substitui GUI.
- Pendente: versionar os lockfiles gerados; `npm ci`/Cargo `--locked`; abrir executavel em Windows interativo e seguir cenarios A-J de `docs/HOMOLOGATION_DESKTOP.md` com relatorios de setembro em perfil de TESTE.
- CMV, DRE e licenciamento permanecem fora do primeiro marco; Simples por faixa continua decisao documentada sem codigo implementado.


## 2026-10-12 — Inicio da etapa de mapeamento manual (NAO HOMOLOGADA)

- Marco 1: usuario confirmou em Windows com arquivos reais a importacao/conciliacao, persistencia, bloqueio de duplicidade, erro de competencia, cabecalho invalido e manutencao de setembro. Foram informados 135 codigos de referencia e 29 pendentes.
- Migracao aditiva `0003_product_mapping.sql`: historico das decisoes de vinculacao manual; nunca altera linhas financeiras originais.
- `catalog::register_sold_product`: apenas para codigos realmente vendidos e ainda pendentes na competencia, validando codigo/nome/categoria, inserindo `products` + `product_external_codes` + auditoria na mesma transacao SQLite.
- `src-tauri/src/lib.rs`: comando Tauri `register_sold_product`; `src/App.tsx`: formulario explicito por codigo pendente.
- Teste Rust novo: primeira vinculacao reduz pendentes de 29 para 28, bloqueia codigo repetido/inexistente, preserva totais e persiste ao reabrir SQLite.
- Nao presumir resultado do novo CI antes da finalizacao. O executavel anterior v0.1.5 nao contem a funcionalidade nova.
- Proxima validacao: CI Windows/Linux com Rust e TypeScript; somente depois entregar novo executavel e validar manualmente em banco de testes com copia/backup do SQLite. Sem CMV/fichas tecnicas nesta etapa.

## 2026-10-12 — Homologacao usuario: 120/120 codigos vendidos mapeados

- Usuario confirmou importacao de setembro de 2026 com R$ 24.944,63 tanto em produtos quanto pagamentos e diferenca de R$ 0,00.
- Apos recuperar uma copia de backup do SQLite, o usuario confirmou 29 pendentes e testou cadastramento de um codigo: 28 pendentes persistindo apos reiniciar, totais preservados.
- Usuario informou ter concluido o cadastro dos restantes: **120 codigos vendidos, 120 mapeados, zero pendentes**. Evidencia e relato do operador, nao copia auditada do banco atual.
- Nao substituir nem migrar banco Windows automaticamente. Backup anterior a mapeamento (176 KB) e importante para restauracao; backup atualizado pos-mapeamento deve ser feito pelo usuario.
- Proxima etapa: consolidar integridade/backup pos-cadastro e projetar cadastros de insumos/fichas tecnicas com regras de unidade, rendimento, versoes de custo, custos por competencia e auditabilidade; NAO presumir CMV/DRE finalizado.

## 2026-10-12 — Etapa insumos e custos (codigo em validacao)

- Usuario confirmou backup atualizado de 120 codigos mapeados, pediu cadastro MANUAL E EXCEL.
- Migration 0004: ingredients, ingredient_purchase_costs por competencia, ingredient_excel_imports com bytes/sha256 do original. Migracao aditiva que preserva importacoes, produtos e periodos anteriores.
- Backend ingredients.rs: unidade basica G/ML/UN, quantidade de compra positiva inteira na unidade basica, custo de compra em centavos inteiros, rejeita nome/unidade divergentes para codigo ja cadastrado, rejeita duplicidade de custo por competencia, Excel transacional all-or-nothing.
- Planilha Excel deve ter na PRIMEIRA ABA colunas exatas e nesta ordem: Codigo, Insumo, Unidade, QuantidadeCompra, CustoCompraCentavos. Exemplo: LEITE,Leite,ML,1000,650 (R$6,50 por litro). Nao tratar 650 como R$650,00.
- Interface React: secao 06 com formulario manual, importar Excel e listar por competencia. Sem CMV ou fichas tecnicas ate validacao.
- Aguardando CI Windows e Linux da HEAD; NOVO executavel NAO homologado. Nunca apontar usuario para nova versao antes de status aprovado e backup verificado.

## 2026-10-12 — Fichas tecnicas fase 1 (em CI, nao homologadas)

- User pediu continuidade e execucao com CorSys Coding; insumos e compras: primeira verificacao previa falhou no Rust, correcao de teste por codigo publicada e execução 38291335604 teve Linux SUCCESS; Windows estava em andamento.
- Schema novo `0006_recipes.sql`: recipe_versions por produto/competencia e recipe_lines por insumo, preservando dados anteriores; user_version=6.
- `src-tauri/src/recipes.rs`: cadastro de um insumo na ficha (codigo externo de produto ja mapeado; insumo com custo na mesma competencia; quantidade inteira >0 em unidade basica). Custo unitario teorico calculado proporcionalmente sobre custo+frete+ST da compra, sem alterar vendas/importacoes. Linha duplicada bloqueada (sem edicao).
- `src-tauri/src/lib.rs`: comandos set_recipe_line e get_recipe_cost; `src/App.tsx`: secao inicial 07.
- Nao assume custos importados da Base DRE antiga; nao calcula DRE/CMV mensal/estoque; sem afirmacao de homologacao GUI. Pendente CI da HEAD, teste de rollback e UX completo das fichas.

## 2026-10-12 — Frontend profissional (primeira iteracao; CI pendente)

- Usuario homologou em Windows isolado: 120 codigos mapeados, R$ 24.944,63 conciliados, insumo sintético LEITE_TESTE R$5,60 persistido, ficha de 150ml R$0,84, aprovacao/status e CMV incompleto, preco teste R$10 e taxa 8,40%, despesas sinteticas FIXA R$2.500, VARIAVEL R$150, TRIBUTO R$800, persistencia OK.
- Correção `Total registrado` em DRE na versao seguinte: R$ 3.450,00 no teste. CI da correção anterior estava em progresso, substituido por novos commits.
- Preferencia explicita: tema ESCURO por padrao, configuracoes com escuro/claro/acompanhar Windows.
- `src/App.tsx` com menu lateral por modulos e Configuracoes/Aparencia; preferência gravada em localStorage (apenas UI, sem dados financeiros). `src/styles.css` com tokens de temas e regras responsivas.
- Aguarda CI desta HEAD antes de distribuir nova versao. Manter banco principal intocado; homologacao via identificador distinto.
- Concluir refinamento visual, auditar legibilidade/contraste e revisar fluxo de produtos; entregar para homologacao em copia isolada somente apos CI.
