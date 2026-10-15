# ARCHITECTURE DECISION LOG

## ADR-001 — Núcleo local Rust + Tauri 2 + React + SQLite
- **Status:** accepted (arquitetura para desenvolvimento; executável ainda não homologado)
- **Data:** 2026-10-10
- **Contexto:** Prompt Mestre exige offline, proteção razoável do código crítico e futura comercialização sem infraestrutura online.
- **Decisão:** React é camada de UI; Rust responde por leitura/validação/normalização/cálculos/persistência; Tauri empacota; SQLite local guarda dados.
- **Alternativas:** app web/SaaS, cálculos JS puros, planilha espelhada.
- **Consequência:** sem backend web e sem dependência de rede em produção. Necessita toolchain Rust para compilação.
- **Rollback:** remover este projeto inicial sem dados produtivos.

## ADR-002 — Importar ambos os arquivos numa transação, preservando bytes
- **Status:** accepted
- **Data:** 2026-10-10
- **Decisão:** guardar XLS/XLSX original BLOB e linhas normalizadas; rejeitar duplicata de hash; não sobrescrever período existente; aceitar conciliação divergente para diagnóstico, sem fechamento.
- **Trade-offs:** tamanho do banco cresce com cada relatório; backup é obrigação futura antes de uso comercial.
- **Rollback:** manter dados originais; schema migrado apenas para bases novas neste marco.

## ADR-003 — Competência de produtos não observável no modelo disponível
- **Status:** accepted, aguardando avaliação de export original
- **Decisão:** usuário seleciona período, método de pagamento confirma `AAAA-MM`; não inventar data do relatório de produtos; exibir aviso.
- **Risco:** arquivo de produtos de outro mês pode ser selecionado com pagamentos de setembro e eventualmente conciliar por coincidência. Requer solução adicional no export original, se existir marcador verificável.

## ADR-004 — Cadastro não inferido de nome
- **Status:** accepted
- **Decisão:** importação não cadastra produtos automaticamente; apenas consulta mapeamentos de código externo. Sem catálogo antigo, todos os 120 códigos vendidos ficam pendentes.

---

## ADR-005 — Classificação de origem e categoria gerencial distintas
- **Status:** accepted para o modelo; PENDENTE DE VALIDAÇÃO para a vigência da regra de agrupamento da Loja SJP.
- **Data:** 2026-10-10.
- **Contexto:** comparação completa de 120 códigos vendidos no XLSX original e na aba `VD_Produtos` do consolidado: 42 linhas mudaram de categoria; `DOCES` (17), `SALGADOS` (14), `SANDUÍCHES` (11) passaram a `PARA COMER`. Quantidade e valor idênticos.
- **Decisão:** preservar `category_raw` e aplicar classificação gerencial por configuração com período de vigência/auditoria; não modificar `import_product_rows` original ou aplicar substituição global de texto. Manter tabelas de `categories` e `category_mappings` no incremento seguinte, não alterar migration 0001.
- **Alternativas:** categoria única reescrita (rejeitada por perda de origem) ou regras por célula Excel (rejeitadas).
- **Consequências:** receita gerencial reproduzível; nova loja pode configurar outros agrupamentos.
- **Rollback:** retirar regra aplicada do período ainda aberto após auditoria, preservando original; fechado requer reabertura auditada.

## ADR-006 — Catálogo/fichas com IDs, custo e unidade versionados
- **Status:** accepted (direção), implementação posterior à homologação do primeiro marco.
- **Data:** 2026-10-10.
- **Contexto:** `Insumos` contém duplicidade de nome e medidas distintas, `CMV_Lista` usa posição/nome e `CONSUMO DE INSUMOS ` duplica receitas.
- **Decisão:** `products → recipes(version) → recipe_items → ingredients → ingredient_cost_versions`, preços em `product_prices`. Não excluir entidade já referenciada; registrar vigência; rejeitar volume zero/unidade faltante quando cálculo exige; histórico fechado por snapshot. Compra e receita devem usar grandezas dimensionais explícitas, sem converter unidade indiscriminadamente.
- **Alternativas:** transcrever blocos da `CMV_Lista` (rejeitada); calcular com lookup de nome (rejeitada); armazenar CMV fixo na tabela de produtos sem versão (rejeitada).
- **Consequências:** cadastro editável seguro, geração de consumo teórico por mesma ficha, sem dependência da planilha.
- **Rollback:** migrations reversíveis em ambientes de desenvolvimento; snapshots fechados não devem ser destruídos.

## ADR-007 — Preservar macroarquitetura e adiar migrations de CMV/DRE
- **Status:** accepted.
- **Data:** 2026-10-10.
- **Contexto:** os relatórios somam R$ 24.944,63 cada; 29 códigos (R$ 3.653,70) não estão em `Base DRE`; 63 erros cacheados; DRE selecionada como agosto. O projeto inicial não foi compilado em Tauri.
- **Decisão:** manter Tauri/React/TS + Rust + SQLite. Concluir testes e mapeamento do marco 1 antes de migration/editor de insumos e receitas. Não reproduzir `Meses`, `Base DRE` e `CMV_GERAL` como tabelas físicas; usar entidades/consultas/versões. Impostos e resultado final só após confirmação de negócio.
- **Consequências:** menor risco de dívida técnica e resultados incorretos. Sem mudanças de código ou migration nesta auditoria.

## ADR-008 — Simples Nacional estimado por faixa; DAS efetivo como valor apurado
- **Status:** accepted (decisão funcional; NÃO implementado no marco de importação).
- **Data:** 2026-10-11.
- **Origem:** confirmação expressa do responsável pelo projeto.
- **Decisão:** quando o módulo financeiro for desenvolvido, o método preferencial de **estimativa** do Simples Nacional será o cálculo por faixas, a partir da RBT12 fiscal efetiva, anexo/vigência e segregação de receitas aplicáveis. O DAS **efetivamente apurado** pela contabilidade será um dado distinto e poderá substituir a estimativa no fechamento, com origem/competência documentadas. Não usar 8% fixos da DRE antiga como regra padrão; não converter a média aproximada de R$ 1.800/mês em imposto do mês.
- **PENDENTE DE VALIDAÇÃO:** Anexo(s) e segregações fiscais reais, RBT12, base tributável e DAS específico de setembro/2026. Na ausência destes, exibir "PENDENTE"; não gerar imposto nulo nem usar valor estimado como efetivo.
- **Impacto:** nenhuma migration/feature tributária nesta etapa; preparar separação entre parâmetros versionados e imposto apurado por competência no módulo DRE.
- **Rollback:** substituir método futuro mediante confirmação e ADR, sem modificar períodos fechados.

## ADR-009 — Importar opcionalmente catálogo de códigos da Base DRE, sem custos
- **Status:** implementation prepared; tests Rust/Tauri aguardando toolchain.
- **Data:** 2026-10-11.
- **Contexto:** 135 códigos válidos na Base DRE, 14 linhas sem código válido (#N/A) e uma linha de rodapé não cadastral e 120 códigos vendidos, dos quais 29 sem vínculo.
- **Decisão:** migration 0002 armazena workbook bruto e linhas da referência com proveniência; importa apenas código, nome e categoria como produtos provisórios vinculados por ID externo. Não importar CMV nem sobrepor cadastros já existentes. Exigir operação explícita do usuário e bloquear segunda carga legada sem processo de substituição.
- **Riscos:** os 135 não são certificados como fichas técnicas válidas; categorias gerenciais não substituem as categorias brutas do relatório. Divergências continuam como pendência.


## ADR-010 — Snapshot de origem imutável e validação de integridade persistida
- **Status:** accepted / código implementado; aguardando compilação e testes Rust/Tauri.
- **Data:** 2026-10-11.
- **Problema:** leitura dupla do arquivo poderia gerar hash/BLOB de uma versão e linhas normalizadas de outra se o usuário alterasse o arquivo entre operações. Uma consulta SQLite poderia mostrar uma conciliação aparentemente válida apesar da alteração de linhas ou bytes do original.
- **Decisão:** processar XLS/XLSX e Base DRE exclusivamente a partir dos bytes lidos/hashados uma vez; rejeitar cabeçalhos obrigatórios duplicados e valores monetários ambíguos. Na leitura persistida, validar contagem de linhas, soma, tamanho e SHA-256 do original, além da competência de pagamento.
- **Alternativas:** abrir o caminho novamente (rejeitada), comparar apenas valor total salvo (insuficiente), recalcular XLSX na UI (rejeitada).
- **Consequências:** integridade e rastreabilidade maiores; consulta pode demorar ligeiramente pelo SHA-256 do BLOB. Verificação detecta corrupção, mas não protege contra adulteração maliciosa coordenada de todos os campos de SQLite; para isso seriam necessários controles adicionais fora do Marco 1.
- **Plano de validação:** `cargo test`, `npm test`, `npm run build`, importação/consulta/reinício em Tauri; testes Python/SQLite independentes não os substituem.

## ADR-011 — Consulta de status de catálogo com validação e controle de interface
- **Status:** implementado no código, ainda sem compilação Rust/React validada.
- **Data:** 2026-10-11.
- **Problema:** depois de reiniciar a aplicação, a interface não distinguia catálogo previamente carregado; operações concorrentes podiam produzir seleção de período incoerente com o resultado exibido.
- **Decisão:** `get_catalog_status` consulta metadados persistidos e valida bytes SHA-256/tamanho e contagens de registros antes de apresentar um catálogo carregado. A interface recupera o status ao iniciar, impede segunda carga e bloqueia seletores/diálogos durante processamento. Cancelar o seletor de arquivo não remove a conciliação atual.
- **Alternativas:** guardar flag em `localStorage` (rejeitado, não é a fonte de verdade); confiar somente nos contadores (rejeitado por risco de corrupção silenciosa).
- **Impacto:** nenhum novo schema/migration; comando somente leitura; regressões Rust e SQLite independentes. Não representa autenticação/criptografia nem substitui testes da aplicação desktop.
- **Rollback:** remover o comando e a recuperação na UI, sem alterar dados persistidos.

### ADR-012 — Compilação nativa em Windows e Linux antes da homologação

- **Status:** accepted (pipeline criado; execução pendente)
- **Data:** 2026-10-11
- **Contexto:** os testes anteriores eram independentes do Rust; o ambiente de preparação não possui compilador nem dependências nativas. A aplicação terá utilização principal em desktop e precisa comprovar o fluxo via Tauri.
- **Decisão:** adicionar ao workflow privado jobs de compilação Linux e Windows com `cargo test`, testes TypeScript/React, SQLite e `tauri build --no-bundle --ci`; separar build bem-sucedido de homologação manual da janela e preservar confidencialidade das fixtures.
- **Consequências:** não há dependência de servidor para executar o aplicativo; CI requer acesso a registries e runner com bibliotecas oficiais; sem lockfiles a primeira compilação ainda não é reprodutível.
- **Pendente:** executar workflow, corrigir quaisquer erros reais revelados, versionar lockfiles e executar testes de aceitação desktop.

## ADR — Desktop com arquitetura preparada para SaaS (2026-10-14)
- **Status:** accepted como diretriz; desacoplamentos de código ainda pendentes.
- **Origem:** decisão expressa do responsável após homologação da base e importação DRE setembro/2026 no Windows.
- **Decisão:** manter Tauri 2 + Rust + SQLite offline; organizar novas regras e casos de uso para não dependerem diretamente de Tauri e do banco, com interfaces mínimas e extração incremental. SaaS, autenticação remota, multi-tenant e PostgreSQL permanecem fora do escopo atual.
- **Regra financeira:** preservar o espelho documental imutável da DRE e impedir transferência/soma automática de despesas, CMV, impostos, royalties ou folha na camada operacional; proveniência e deduplicação explícitas na integração futura.
- **Documento completo:** [ADR_DESKTOP_SAAS_READY_2026_10.md](ADR_DESKTOP_SAAS_READY_2026_10.md).
- **Impacto desta decisão:** documentação somente; nenhuma alteração em código, migrations, binários ou bancos.
