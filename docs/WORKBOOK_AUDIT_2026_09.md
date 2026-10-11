# Auditoria integral — DRE consolidada da Loja SJP, setembro de 2026

**Status:** concluída como auditoria de estrutura, dados armazenados e fórmulas OOXML; **não é homologação da DRE nem recálculo integral das fórmulas**.  
**Fonte primária:** `09 - DRE - SET_2026 - LOJA SJP.xlsx`, entregue neste Projeto. Complementos: `Modelo do Relatório venda produto.xls.xlsx` e `Modelos do Relatório Faturamento.xls.xlsx`.  
**Método:** leitura de todas as planilhas e respectivos nós XML, valores salvos em cache, células com fórmula, nomes definidos, erro salvo, confronto por **código externo** com os relatórios de origem. Não alteramos os arquivos originais. As fórmulas compartilhadas (`t=shared`) estão contadas inclusive onde o XML armazena apenas referência ao mestre. O inventário CSV lista todas as células com fórmula; não implica que cada fórmula foi reexecutada.

## 1. Escopo comprovado

| Aba (nome real) | Área declarada | Células preenchidas | Células com fórmula | Erros em cache | Função funcional |
|---|---|---:|---:|---:|---|
| `Insumos` | A1:P124 | 842 | 118 | 2 | Cadastro de insumos e composição de custo de compra |
| `CMV_Lista` | A1:BG318 | 5.450 | 2.868 | 19 | Fichas técnicas horizontais; custo dos ingredientes e preço |
| `CMV_GERAL` | A1:M141 | 513 | 291 | 1 | Consolidação unitária do CMV por produto |
| `VD_Pagamento` | A1:L11 | 51 | 0 | 0 | Cópia do relatório original de métodos de pagamento |
| `VD_Produtos` | A1:M139 | 1.108 | 0 | 0 | Cópia do relatório de venda de produtos, com categorias gerenciais alteradas |
| `Base DRE` | A1:Q152 | 979 | 486 | 23 | Intermedia códigos, quantidades, CMV, vendas e pagamentos |
| `DRE MENSAL` | A1:J107 | 219 | 46 | 0 | Receita, tributos, despesas, folha, resultado e indicadores |
| `TABELAS` | A1:D147 | 482 | 187 | 0 | Cadastro de preços e referências a vendas das fichas |
| `Meses` | B2:O14 | 96 | 53 | 0 | Conversão mês ↔ texto de pagamento e soma manual/normal |
| `CONSUMO DE INSUMOS ` | A1:Z836 | 2.867 | 1.084 | 18 | Consumo teórico por produto/insumo e sugestão de compra |
| **Total** | | **12.607** | **5.133** | **63** | |

**Atenção ao nome literal:** a última aba contém **um espaço à direita**. **`Planilha1` não existe nesta versão recebida**. Não inferir dela dados de despesas; a divergência de R$ 100/R$ 150 citada em documentação anterior só poderá ser conferida com outra versão que contenha a aba ou outra fonte.

## 2. Mapa completo por aba, com origem, fórmulas e destino

### 2.1 `Insumos`
- **Função e cadastros:** 118 linhas de insumos com `Nome MB`, `Chave`, `Insumo`, `Distribuidor`, `Custo`, `Frete`, `ST`, `Custo Total`, `Volume`, `Qtde.` (B:K; cabeçalho linha 5). O nome da planilha não é identificador confiável; `Chave` existe, mas é necessário ID interno imutável.
- **Origem e edição:** cadastro operacional, aparentemente preenchido manualmente; preço, frete, ST, fornecedor e embalagem são entradas; `Custo Total` é cálculo ou valor previamente armazenado. Fórmula exemplar: `I6=SUM(F6:H6)`.
- **Consultas:** não depende de outras abas por fórmulas explícitas. **Consumidores:** `CMV_Lista` (`VLOOKUP` de custo total, volume ou contagem de unidades) e `CONSUMO DE INSUMOS ` (tamanho de embalagem).
- **SQLite:** `ingredients`, `suppliers` (ou fornecedor textual inicial), `ingredient_cost_versions` com componentes e embalagem por vigência; evitar duplicar preço atual e histórico como fatos independentes.
- **Dinâmico/versionado:** custo total, custo unitário por unidade de medida, comparativos; custo, embalagem, unidade, fornecedor com efetividade e histórico de alterações. Desativar em vez de remover insumo referenciado por receita/snapshot.
- **Fragilidades comprovadas:** 9/118 sem campo `Custo` preenchido, 61 sem `Volume`, 29 sem `Qtde.`, 10 com `Custo Total` cacheado igual a zero (não afirmar que todos são erros: alguns podem ser brindes). Dois erros `#N/A` na chave (C46/C75). O nome normalizado `COPO REUTILIZAVEL GELADOS` ocorre duas vezes (linhas 11 e 35) com especificações diferentes; `VLOOKUP` por nome pode selecionar o item errado. As colunas `Volume` e `Qtde.` não identificam por si só a unidade física.

### 2.2 `CMV_Lista`
- **Função e cadastros:** matriz horizontal de fichas técnicas por grupo (`Bebidas Quentes`, `Bebidas Geladas`, `Bebidas Refrescantes`, `Para Comer`, `Outros`, `Combos PDV`, `Combos iFood`). Cada bloco contém nome de produto, insumos, preço/custo de compra, rendimento, consumo, custo calculado, preço de venda e % CMV.
- **Origem e edição:** nomes/itens/quantidades usados por receita preenchidos manualmente; custo de insumos busca `Insumos`; preço vendido busca `TABELAS`. Algumas fichas são parcialmente estáticas/copiadas.
- **Fórmulas típicas:** `VLOOKUP(nome_insumo,Insumos!D:K,6,0)` (custo embalagem), lookup do `Volume`/`Qtde.` (índices 7/8), `Rendimento=embalagem/consumo`, `Custo=preço/rendimento`, `SUM(custos)`, `VLOOKUP(produto,TABELAS!A:B,2,0)` (preço), `CMV%=custo/preço`; `IFERROR(x,0)` pode ocultar erro. `VALUE` força conversão de texto numérico.
- **Consultas:** `Insumos` e `TABELAS`; internas entre blocos. **Consumidores:** `CMV_GERAL`, `Base DRE`, `TABELAS` (coluna auxiliar D com referências a preços).
- **SQLite:** `products`, `recipes` com versão/vigência/status, `recipe_items` com FK `ingredient_id`, quantidade em unidade explícita e ordenação; não mapear coordenadas de célula como IDs.
- **Dinâmico/versionado:** custo por item, CMV unitário, CMV%, impacto prospectivo do custo; registrar revisões da ficha e custo usado em fechamento histórico.
- **Fragilidades:** 19 erros cacheados, inclusive 9 `#DIV/0!` e ocorrências `#VALUE!`/`#N/A`; lookups por texto, fórmulas `IFERROR(...,0)`, multiplicidade de blocos; alguns preços vêm de texto `R$ -`. Sem controle de validade por período e sem relação transacional explícita com o código externo da venda.

### 2.3 `CMV_GERAL`
- **Função:** extrato por tipo/produto com `CUSTO TOTAL`, `VENDA`, `CMV` (colunas A:E). Colunas auxiliares montam expressões/endereços como texto para investigar células.
- **Origem e edição:** nomes e agrupamentos aparentam manutenção manual; custo e preço referenciam células específicas da `CMV_Lista`. Fórmula de proporção `E2=C2/D2`.
- **Consultas:** `CMV_Lista`; **consumidores de dados:** principalmente referência humana, pois a `Base DRE` calcula custos consultando `CMV_Lista` diretamente (não esta aba).
- **SQLite:** **não criar tabela que replique a aba**; produzir consulta/visão de produtos + ficha vigente + preço vigente, mais relatório de qualidade.
- **Dinâmico/versionado:** valores calculados por período/vigência; snapshots fechados em etapa futura.
- **Fragilidades:** referência por posições (`CMV_Lista!M166`, etc.), uma divisão por zero em `E96`, concatenação `_xlfn.CONCAT` e campo de preço 0/textual. A aba não é fonte independente de cadastro.

### 2.4 `VD_Pagamento`
- **Função:** dados copiados da exportação de faturamento: `Método de Pagamento`, `Cliente`, `Total`, `Ticket Médio`, `P.A` (linhas 2:11).
- **Origem e edição:** **importação**, não preenchimento de regras. O relatório de origem traz `Produto por Atendimento` como título equivalente a `P.A`. Nenhuma fórmula na aba.
- **Consultas:** nenhuma; **consumidores:** `Meses` e, indiretamente, `Base DRE` e `DRE MENSAL`.
- **SQLite:** `imports` + `import_payment_rows`, bruto imutável, `method_raw`, `method_normalized`, subtipo manual, competência, valor em centavos. Dados secundários preservados no JSON bruto, sem forçar indicadores derivados incompletos.
- **Dinâmico/versionado:** consolidação método normal/manual, consistência de competência, conciliação, taxas configuráveis no marco financeiro posterior.
- **Fragilidades:** 9 métodos em setembro, texto de período embutido no nome, dependência do `Meses` para buscar valores; importante guardar original e resultado normalizado.

### 2.5 `VD_Produtos`
- **Função:** produtos vendidos, com código externo `ID`, nome, categoria, `Copo Reutilizável`, `Quantidade`, `Itens`, `Interno`, `Valor`; linha adicional negativa para descontos/taxas.
- **Origem e edição:** **relatório importado**, mas a cópia consolidada sofreu **reclassificação de categoria em 42 produtos**, todos convertidos de `DOCES`/`SALGADOS`/`SANDUÍCHES` para `PARA COMER` (ver comparação por código). Nomes, quantidades e valores dos 120 produtos continuam iguais aos do relatório original.
- **Fórmulas/consultas:** nenhuma; **consumidores:** `Base DRE` (quantidades, receita por categoria) e `CONSUMO DE INSUMOS ` (unidades vendidas).
- **SQLite:** preservar bruto por linha e classificação de origem; adicionar `category_mappings` ou `product_category_assignments` com categoria gerencial por loja e vigência para a DRE. Linha `Total de Descontos e Taxas` com código 0 é ajuste, não produto; linha `Vendas Lançadas Manualmente` código 0 é registro especial, não produto.
- **Dinâmico/versionado:** somas, receita por categoria de origem e gerencial, conciliação; reclassificações editáveis e rastreáveis por competência.
- **Fragilidades:** categoria na DRE não é necessariamente categoria da exportação. Preço médio realizado (`Valor/Quantidade`) não deve virar automaticamente **preço de tabela**. `Interno` e `Copo Reutilizável` têm significado de negócio ainda não confirmado.

### 2.6 `Base DRE`
- **Função:** ponte manual de cadastro e código externo (B/C/E) com quantidade de venda, CMV unitário, custo estimado e resumo por categoria; inclui método de pagamento.
- **Origem e edição:** nome, código, categoria e configurações manuais; quantidades `D` via `IFERROR(VLOOKUP(código,VD_Produtos!B:H,5,0),0)`; CMV `F` via lookup pelo nome em `CMV_Lista`, custo `G=quantidade*CMV`; receita em `J` via `SUMIF(VD_Produtos!D:D, categoria, VD_Produtos!I:I)`; pagamentos `J27:J35` vindos de `Meses`.
- **Consultas:** `VD_Produtos`, `CMV_Lista`, `Meses`. **Consumidores:** `DRE MENSAL`.
- **SQLite:** **não copiar a Base DRE**. Distribuir responsabilidades entre `products`, `product_external_codes`, `categories/category_mappings`, `import_product_rows`, `recipes/recipe_items`, cálculos e consultas por período.
- **Dinâmico/versionado:** quantidade, receita, CMV agregado e categoria devem ser **derivados** do conjunto importado com mapeamentos e fichas válidos para a competência; snapshot futuro de fechamento.
- **Fragilidades:** 23 `#N/A`; códigos ausentes na lista, nomes que precisam corresponder à ficha; `IFERROR(...,0)` transforma código ausente em "não vendido" e prejudica controle de pendência. **Há 135 códigos cadastrados aqui, contra 120 vendidos. Desses vendidos, 29 códigos não aparecem na lista**; seus valores somam R$ 3.653,70 (14,65% da receita líquida). Portanto, CMV total cacheado **R$ 7.771,16** não pode ser homologado.

### 2.7 `DRE MENSAL`
- **Função:** demonstrativo financeiro consolidado; receita por agrupamento, descontos, CMV, taxas por método, imposto, royalties, despesas variáveis/fixas, folha, resultado, margem, ponto de equilíbrio e projeção tributária.
- **Origem e edição:** percentual de imposto de 8%, royalties 7%, percentuais de taxas, categorias de despesas e componentes da folha são entradas manuais/hipóteses; receitas/custos vêm da `Base DRE`; muitas linhas de despesas são manuais. Projeção/indicadores são fórmulas.
- **Fórmulas relevantes:** `D7=SUM(D8:D13)` (na prática receita **líquida**); `D15=SUM(D16:D21,D33:D48)` (CMV e despesas variáveis juntos); `D33=D7*C33` (8%); `D34=D7*C34` (7%); `D49=D7-D15`; `D52=SUM(D55:D75)`; `D75=SUM(...)` folha; `D105=D49-D52`; `D3=D52/(D49/D7)`; `I3=Faturamento_Mes*12`, `I4` escolhe taxa/faixa, `I6=(projeção*alíquota-dedução)/receita_anual`.
- **Consultas:** `Base DRE`, nomes definidos e parâmetros internos. **Consumidores:** operador, `Meses` lê a seleção de mês da célula D5.
- **SQLite:** futuro `expense_categories`, `expenses`, `employees`, `payroll_entries`, `payment_fee_rules`, `tax_rules`, `royalty_rules`, `period_results`, `period_snapshots`/linhas; sem criar agora motor financeiro antes de tratar as pendências.
- **Dinâmico/versionado:** regras por vigência; entradas mensais editáveis e auditadas; snapshot imutável de fechamento e justificativas de reabertura.
- **Fragilidades graves:** competência D5 **"Agosto"** apesar dos relatórios 09/2026; taxas de pagamento ficam zeradas. Imposto fixo 8% diverge de cálculo auxiliar ~5,3156%, **regra fiscal PENDENTE DE VALIDAÇÃO**. Marketing Local 2% indicado sem valor calculado; Perdas 1% com saída 0; "Receita Total" é líquida após desconto; resultado salvo ~R$ 4.143,02 **não confiável**; ausência de `Planilha1` nesta versão impede comparar despesa R$ 100 contra R$ 150 de arquivo anterior.

### 2.8 `TABELAS`
- **Função:** tabela de preços por produto (`PRODUTO`, `USAR`, `TABELA 2`); coluna D auxiliar com algumas referências à `CMV_Lista`.
- **Origem e edição:** cadastros/seleções manuais, B por vezes =C; ao menos 8 preços em B representados literalmente como `R$ -`.
- **Fórmulas/consultas:** coluna B frequentemente referencia C; D referencia preços em `CMV_Lista` sem constituir vínculo operacional. **Consumida por:** `CMV_Lista` para obter venda/preço.
- **SQLite:** `product_prices(product_id, price_cents, price_type, effective_from, effective_to, source)`; adotar `price_type` apenas quando o significado de `USAR` × `TABELA 2` for confirmado. Projeção de consulta por preço vigente no momento do cálculo, e preço realizado proveniente da venda separado.
- **Dinâmico/versionado:** preço vigente e sua evolução temporal; nada de alterar retroativamente preço usado no CMV de um fechamento fechado.
- **Fragilidades:** lookup por nome; `R$ -` é **ausência textual**, não preço zero; nomes/variações podem divergir do sistema de vendas.

### 2.9 `Meses`
- **Função:** conversão mês por nome (`Agosto` → `08`), concatenação de textos como `08/2026 - Crédito Manual` e consolidação de métodos.
- **Origem e edição:** tabela de nomes e tipos de método semi-estática; período deriva da célula `DRE MENSAL!D5` e ano em F2.
- **Fórmulas/consultas:** `F3=VLOOKUP('DRE MENSAL'!D5,Meses!B:C,2,0)`, `F4=F3&"/"&F2`, `L4=IFERROR(VLOOKUP(K4,VD_Pagamento!A:D,3,0),0)`, `I4=L4+O4`.
- **Consumidores:** `Base DRE` busca métodos agregados aqui. **SQLite:** **nenhuma tabela que replique a aba**. `periods` guarda competência tipo `YYYY-MM`; parser de pagamentos retorna competência, método canônico e indicador manual; consolidar por SQL/core Rust.
- **Fragilidade comprovada:** F4 = `08/2026`, pagamentos são `09/2026`; todos os métodos ficam zero apesar de existir faturamento. `IFERROR(...,0)` faz dados ausentes parecerem transações de zero.

### 2.10 `CONSUMO DE INSUMOS `
- **Função:** listas repetidas por produto com código, quantidade, ingredientes e quantidades por unidade, mais consolidação por insumo, volume de embalagem e sugestão de compra.
- **Origem e edição:** fichas/porções aparentemente copiadas manualmente (duplicam lógica de `CMV_Lista`); quantidade vendida via `VD_Produtos`; volumes via `Insumos`. Campos `Em estoque` / `NECESSÁRIO REPOR` são rótulos gerados, **não estoque físico**.
- **Fórmulas/consultas:** `VLOOKUP(código,VD_Produtos!B:F,5,0)`; `consumo=quantidade_vendida×quantidade_ficha`; `SUMIF(insumo, ...)`; `VLOOKUP(embalagem,Insumos!D:K,...)`; `J3=(F3/I3)×1,20` quando há consumo e volume. O fator de segurança é **20%** em exemplos observados.
- **Consumidores:** operador para compra/reabastecimento teórico; não é fonte de entrada para CMV. **SQLite:** **não duplicar receitas**; calcular de `import_product_rows→product_external_codes→recipes→recipe_items→ingredients` e agregações de consumo. Configurar margem de segurança e arredondamento futuramente.
- **Dinâmico/versionado:** consumo por competência, necessidade teórica, embalagem vigente, sugestão de compra com percentual configurável; snapshot somente se integrado a um fechamento auditável.
- **Fragilidades:** 18 erros cacheados; `#DIV/0!` por embalagens com volume 0; `#N/A` por nomes/lookup; algumas linhas usam `IFERROR(...,"0")` ocultando falta de código, um exemplo `Saboroso` tem código cacheado `#N/A`; chamar necessidade teórica de "Em estoque" causa interpretação errada.

## 3. Confronto com fontes originais e controles de qualidade

### Resultados financeiros reproduzidos a partir das exportações

| Medida | R$ |
|---|---:|
| Produtos, receitas positivas | 28.370,70 |
| Ajustes negativos / descontos | -3.426,07 |
| **Relatório de produtos, líquido** | **24.944,63** |
| **Relatório de pagamentos** | **24.944,63** |
| **Diferença** | **0,00** |

Após normalização dos pagamentos: Crédito 11.373,49; Débito 6.487,85; PIX 5.009,59; Carteira Digital 1.183,92; Outro 471,15; Dinheiro 357,90; Voucher 60,73. Normalização: crédito manual integra crédito; débito manual integra débito, preservando o nome/subtipo bruto.

Há **120 códigos distintos vendidos**, **135 códigos distintos cadastrados na Base DRE** e **29 vendidos sem código correspondente**, receita **R$ 3.653,70**. Lista linha a linha em `unmapped_products_2026_09.csv`.

### Regra nova que estava implícita: categoria gerencial distinta da categoria fonte

Comparação integral por código externo entre modelo de vendas e aba consolidada: **42 linhas reclassificadas, nenhum desvio em quantidade/valor e nenhum nome divergente**. Categorias originais `DOCES` (17), `SALGADOS` (14) e `SANDUÍCHES` (11) foram agrupadas como `PARA COMER` (42) na planilha. O restante manteve categoria original. Tratar como **classificação gerencial explícita, versionável**, sem modificar `category_raw`. Relação completa em `category_changes_2026_09.csv`. **PENDENTE DE VALIDAÇÃO:** se o agrupamento deverá valer para todas as competências futuras da loja, ou depender de vigência/configuração (recomendado configurar, com sugestão inicial observada em setembro).

### Erros e nomes quebrados

Erros cacheados: **35 `#N/A`**, **25 `#DIV/0!`**, **3 `#VALUE!`**; vide `errors_inventory.csv`. Existem **17 nomes definidos** (incluindo 7 nomes internos de filtro); **7 entradas de nomes definidos contêm `#REF!`** (`Aliquota`, `Faturamento_Mes`, `Lista_Tabelas`, `Pagamentos`, `Projeção_12_Meses`, com algumas versões locais e globais). Isso é outra fragilidade estrutural. Fórmulas compartilhadas foram contadas sem deduzir células ausentes: `formula_inventory.csv` contém 5.133 registros.

**Importantíssimo:** estes são valores de cache armazenados no arquivo, não o resultado de um recálculo do Excel/LibreOffice. Uma fórmula com erro ocultado por `IFERROR` pode ter retornado 0 mesmo sem erro visível; o inventário de 63 **não é** uma contagem de todas as regras de negócio incorretas.

## 4. Limite desta auditoria

- Não há evidência suficiente para validar quantidade/unidade física de todos os insumos, a correspondência semântica de cada ficha horizontal ou preços para cada competência.
- A planilha não autoriza inferir um CMV "correto" de setembro, nem a DRE final. Não corrigir esses números por aproximação.
- A presença de fórmulas entre duas abas não prova uma dependência circular **entre células**; é preciso avaliar o grafo real das células para afirmar circularidade. O grafo de abas mostra `DRE MENSAL → Meses → Base DRE → DRE MENSAL`, mas `DRE MENSAL!D5` é campo manual, o que evita concluir um ciclo computacional apenas pela topologia de abas.
- A implementação e os testes Tauri/Rust não foram executados nesta auditoria; nenhuma migration nova foi aplicada.
