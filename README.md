# DRE Mais1 — Marco Funcional 1

Aplicativo desktop **offline** em **Tauri 2 + React/TypeScript/Vite + Rust + SQLite**.
Este marco cobre exclusivamente a importação local de dois relatórios XLS/XLSX, validação de período e estrutura, normalização de pagamentos, conciliação monetária e listagem de códigos vendidos sem mapeamento. **Não** contém CMV, DRE, licenciamento, servidor, SaaS nem histórico anual.

## Preparação e execução

Pré-requisitos: **Node.js**, **Rust/Cargo** e dependências nativas do Tauri compatíveis com o sistema operacional ([instruções oficiais](https://v2.tauri.app/start/prerequisites/)). O repositório deve permanecer privado porque inclui relatórios financeiros como fixtures.

```bash
npm install
npm run tauri dev
```

Na tela: selecionar **setembro de 2026**, escolher `tests/fixtures/produtos-set-2026.xlsx` e `tests/fixtures/pagamentos-set-2026.xlsx` (ou os arquivos XLS/XLSX originais exportados) e clicar em **Validar e importar relatórios**.

O ícone de janela é uma marcação gráfica neutra e provisória, sem alegação de identidade de marca definitiva.

O banco é criado automaticamente no diretório local de dados da aplicação resolvido por `app.path().app_data_dir()`; não dentro da pasta do executável.

**Reimportação**: se o par já foi importado, aparece erro explícito de duplicidade; não duplica vendas e não sobrescreve importações. Para validar novamente em ambiente de teste, use um perfil/diretório de dados limpo, **nunca apague o banco de produção para testar**.

## Comandos de qualidade

```bash
cd src-tauri && cargo test
cd .. && npm test
npm run build
npm run tauri build
```

O teste de verificação *independente* dos dados exemplares requer `artifact_tool` no ambiente de análise, e não é dependência do aplicativo:

```bash
python tools/verify_fixtures.py
```

## Resultados esperados da fixture (sem cadastro de produtos)

- 122 linhas no relatório de produtos; 120 códigos com venda positiva.
- Receita positiva R$ 28.370,70; ajustes R$ -3.426,07; receita líquida R$ 24.944,63.
- 9 linhas de métodos originais; total R$ 24.944,63.
- Conciliação R$ 0,00; Crédito R$ 11.373,49; Débito R$ 6.487,85; PIX R$ 5.009,59; Carteira Digital R$ 1.183,92; Outro R$ 471,15; Dinheiro R$ 357,90; Voucher R$ 60,73.
- **120 códigos sem mapeamento**, pois o banco inicial não contém cadastro da DRE. **Atualização de auditoria:** a planilha consolidada chegou. A comparação offline provou 29 códigos vendidos ausentes no catálogo de 135 códigos da `Base DRE` (R$ 3.653,70); **o cadastro ainda não foi importado para o SQLite**, que permanece com 120 não mapeados até esse trabalho. Não são equivalentes.

## Limitações deliberadas

- O modelo de relatório de produtos não contém mês/ano embutido. O período é **informado pelo operador** e validado com o arquivo de pagamentos; não pode ser comprovado independentemente para produtos nesta fixture.
- Apenas dois layouts da origem conhecida são aceitos; cabeçalho pode estar deslocado, outros campos são preservados na linha bruta e no arquivo binário. Mudança de campos obrigatórios gera erro.
- A linha especial `ID=0 / Total de Descontos e Taxas` é ajuste, não venda; `ID=0 / Vendas Lançadas Manualmente` é placeholder **somente quando valor = 0**; outros casos são bloqueados até confirmação da regra.
- Sem baseline de produtos, nenhuma associação automática de nome/código é criada. Mapeamentos exigem ação humana numa próxima etapa. O estado *não mapeado* não equivale a *CMV zero*.
- Código-base preparado para Tauri; a validação de execução desktop/compilação requer Rust e bibliotecas nativas, não disponíveis na sessão inicial do projeto.
- SQLite não está criptografado, login e backups não foram implementados. Guardar relatórios e banco em dispositivo confiável.

Consulte `docs/SESSION_HANDOFF.md` e `docs/KNOWN_ISSUES.md` antes de continuar.

**Dependências travadas:** lockfiles `package-lock.json` e `Cargo.lock` ainda não foram gerados: o registro npm não pôde ser acessado e Cargo não estava instalado. Gerar e versionar ambos após o primeiro `npm install` / `cargo test`, antes do primeiro commit de release.

## Auditoria complementar — planilha consolidada

Em 2026-10-10, a planilha consolidada com **10 abas** foi auditada (5.133 células com fórmula; 63 erros de cache), comparada com os dois modelos originais e utilizada para revisar schema/fluxos. Foram verificadas 42 reclassificações gerenciais de categoria e 29 códigos vendidos sem referência na `Base DRE`. **Código e migration 0001 não mudaram nesta revisão.** Leia `docs/WORKBOOK_AUDIT_2026_09.md`, `docs/DEPENDENCY_MAP_2026_09.md`, `docs/DATA_MODEL_REVIEW_2026_09.md`, `docs/IMPLEMENTATION_ROADMAP_REVIEW.md`, `docs/AUDIT_VERIFICATION.md`.

## Continuidade — Marco 1.2 (2026-10-11)

Foi acrescentada uma opção **Carregar cadastro de referência**, de uso único por loja, a partir da aba `Base DRE` da planilha consolidada (não confundir com os dois relatórios mensais). Ela registra arquivo original, hash, código, nome, categoria e eventuais linhas com `#N/A`, sem importar custos, receitas ou CMV. Depois da carga, o processamento mensal identifica os códigos antigos e deixa os novos como pendências.

Para validar a fixture de setembro: carregar `tests/fixtures/base-dre-set-2026.xlsx` uma vez no banco de testes, depois `tests/fixtures/produtos-set-2026.xlsx` e `tests/fixtures/pagamentos-set-2026.xlsx` selecionando 2026-09. Esperado: 135 códigos de referência, 14 linhas inválidas preservadas, 120 códigos vendidos, 29 sem mapeamento (R$ 3.653,70), produtos e pagamentos R$ 24.944,63, diferença R$ 0,00.

**Atenção:** a fixture consolidada contém informações internas da loja, não pode integrar um instalador comercial nem repositório público. A migration de referência é opcional, não incluída no fechamento das futuras lojas.

A regra aprovada para o módulo tributário futuro é estimativa do Simples Nacional **por faixa**, distinguindo o valor apurado real do DAS e a média histórica de aproximadamente R$ 1.800/mês. RBT12, segregações/anexos e DAS setembro permanecem pendentes e não têm cálculos implementados no Marco 1.

## Continuidade — Correções de integridade v0.1.3 (2026-10-11)

- A leitura XLS/XLSX agora usa `open_workbook_auto_from_rs` em um snapshot **em memória dos bytes já hashados**; não reabre o caminho depois da leitura inicial. O mesmo vale para a referência `Base DRE`. A nova versão do parser é `2026-10-m1.3`.
- Cabeçalhos obrigatórios duplicados geram erro. Valores monetários textuais com separadores de milhar inválidos/ambíguos (ex.: `1.234`, `1.23,45`) são rejeitados, não transformados em zero.
- Ao consultar um período persistido, o núcleo Rust compara contagem/soma das linhas com metadados e reconfere tamanho e SHA-256 dos bytes originais, falhando explicitamente se houver divergência. Esses controles são de **integridade**, não equivalem a autenticação/criptografia do banco.
- Foram **executados no ambiente de preparação** 13 testes independentes sobre os relatórios, 9 sobre o catálogo e 8 sobre o contrato SQLite de integridade, todos aprovados. Esses **30 testes Python/SQLite não executam o código Rust**.
- Testes Rust foram acrescentados para fonte imutável e corrupção de linha/arquivo no SQLite. **NÃO EXECUTADOS**: Cargo/Rust ausentes. **NÃO EXECUTADOS**: Vitest, build React e interface desktop; dependências npm indisponíveis por erro de DNS `EAI_AGAIN`.

### Comandos de homologação no computador de desenvolvimento

1. Seguir [pré-requisitos oficiais do Tauri](https://v2.tauri.app/start/prerequisites/) para Windows/Linux/macOS.
2. `npm install` (gerar e versionar `package-lock.json` em repositório privado).
3. `cd src-tauri && cargo test && cd ..` (gerar `Cargo.lock`); verificar resultado real dos testes.
4. `npm test`, `npm run build`, `npm run tauri dev`.
5. Na interface, em banco **de desenvolvimento limpo**, carregar `tests/fixtures/base-dre-set-2026.xlsx`; depois os relatórios `produtos-set-2026.xlsx` e `pagamentos-set-2026.xlsx`, competência `2026-09`. Esperado: R$ 24.944,63 de cada lado, diferença R$ 0,00; 120 códigos vendidos, 91 mapeados, 29 pendentes (R$ 3.653,70). Confirmar reabertura e tratamento de duplicidade.
6. Somente após aprovar `cargo test`, build e a abertura real, declarar **Marco 1 homologado**.

Não usar `cargo test` não executado como evidência de funcionamento; reportar erros do host antes de evoluir para CMV/DRE.

## Continuidade — v0.1.4: estado persistido do catálogo e verificação automatizável

- A interface solicita ao Rust/SQLite `get_catalog_status` ao iniciar. Se já houver Base DRE carregada, exibe arquivo e contagens, bloqueando importação duplicada; não há flag em armazenamento do navegador.
- A consulta de catálogo recusa inconsistências de quantidade, SHA-256 ou tamanho do arquivo original, em vez de presumir sucesso. Os relatórios mensais mantêm as validações anteriores.
- A interface bloqueia alterações de ano/mês e seleção de arquivos enquanto uma importação/consulta está pendente. Cancelar um diálogo de arquivo não apaga o resultado anterior.
- O fluxo de validação foi documentado em `.github/workflows/verification.yml` para um futuro **repositório privado**. O workflow **não foi executado nesta entrega** e não substitui a homologação manual da janela Tauri.
- Teste independente extra: `python tools/verify_catalog_status_contract.py` (somente SQLite/stdlib). Os testes de planilhas Python dependem de `artifact_tool`, presente apenas no ambiente de análise; o CI cobre as fixtures com testes Rust.
- **IMPORTANTE:** ainda faltam `package-lock.json` e `Cargo.lock`; executar instalações em ambiente com rede e versioná-los antes de declarar build reprodutível.

## Continuidade — preparação de compilação 0.1.5

O workflow `.github/workflows/verification.yml` agora inclui **Linux e Windows** e tenta a **compilação real Tauri** com `npm run tauri -- build --no-bundle --ci`, além dos testes Rust, Vitest e verificações SQLite. Esta alteração de pipeline **ainda não foi executada em GitHub Actions**. O script `python tools/preflight.py` mostra requisitos do host e retorna erro caso faltem componentes aferíveis.

Neste ambiente, `npm install --offline` falhou por dependências ausentes do cache (`ENOTCACHED`); a rede não resolve os registries; Rust/Cargo e bibliotecas Tauri não estão disponíveis. Foram reexecutados **35/35 testes independentes Python/SQLite — PASS**. Os comandos Rust/React não foram homologados. Para reproduzir, consultar `docs/HOMOLOGATION_DESKTOP.md` e os logs em `test-results/`.

Após a primeira compilação em ambiente online, gerar e **versionar** `package-lock.json` e `src-tauri/Cargo.lock`. Não publicar as fixtures confidenciais num repositório público.


## Publicação no GitHub — versão sanitizada

**O conteúdo em `tests/fixtures/` neste pacote para GitHub é SINTÉTICO.** Os nomes e códigos de produtos foram substituídos por exemplos sem vínculo com a operação real. Mantivemos apenas os agregados conhecidos de setembro para exercitar os contratos de cálculo (R$ 24.944,63 e 29 códigos sem mapeamento no cenário simulado); isso **não prova** que os relatórios originais passam pelo núcleo Rust.

Não publicar no repositório: planilhas operacionais originais, dados financeiros individualizados, histórico de clientes, banco SQLite local, logs de execução ou arquivos da auditoria detalhada (`docs/audit_evidence/`). Para testes manuais com originais, mantenha-os fora do repositório ou em `tests/private/` (ignorado pelo Git).

Repositório recomendado: `dre-mais1`, **PRIVATE**, branch inicial `main`, na conta do proprietário. O workflow `.github/workflows/verification.yml` deve executar testes e compilação Linux/Windows após publicação, mas **ainda não foi validado em GitHub Actions**.
