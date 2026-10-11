# Revisão do esquema SQLite a partir do consolidado de setembro

**Decisão:** manter Tauri + React/TypeScript + Rust + SQLite local. Não há evidência técnica para reescrever o Marco 1 ou adicionar backend remoto. **Não aplicar migrações novas nesta etapa de auditoria.**

## 1. Esquema existente e ajustes identificados

| Entidade atual (migration 0001) | Conclusão da revisão |
|---|---|
| `stores` | Manter a loja local. |
| `periods` | Manter competência `YYYY-MM`; estados de fechamento e confirmação de competência deverão evoluir quando implementados. O período de produtos não vem independentemente do arquivo-modelo. |
| `imports` | Manter bytes originais, hash, versão parser, tipo, competência/estado. Para futuro reprocessamento controlado, não sobrescrever registro importado. |
| `import_product_rows` | Manter `category_name` como **categoria original**. Não atualizar para gerencial. Mantém código, valor e `row_type`. Campos opcionais continuam no JSON original; leitura formal futura para quantidade de itens/"Interno" quando regra confirmada. |
| `import_payment_rows` | Manter método bruto, normalizado, subtipo, período e valores em centavos. |
| `products` | Manter ID interno, nome, ativo; ampliar gradualmente com categoria gerencial e referências de vigência quando o editor entrar. |
| `product_external_codes` | Manter unicidade código/loja, chave de integração; futuramente auditar alteração, alias e período de validade se reuso ocorrer. Não confiar em nome como chave. |

**Cuidado:** a planilha permite criar um catálogo inicial com **135 códigos** observados em `Base DRE`, mas isso não garante que todas as 135 fichas estejam corretas. Migrar primeiramente como **candidatos com proveniência**, confirmar links ao produto e marcar custo como pendente quando indefinido. Importar as 29 vendas ausentes como **pendências**, não preenchê-las automaticamente com CMV zero.

## 2. Próximos incrementos de persistência — sem criar tudo antecipadamente

### Incremento A — finalizar primeiro marco (importação e cadastro de correspondência)

| Tabela/alteração proposta | Campos-chave / restrições |
|---|---|
| `categories` | `id`, `store_id`, `name`, `active`; UNIQUE loja + nome canônico |
| `category_mappings` | `id`, `store_id`, `source_category`, `category_id`, `valid_from`, `valid_to`, `origin`, `status`; validar ausência de sobreposição para regras ativas; não sobrescrever bruto |
| `product_aliases` (apenas se necessário já no editor) | `product_id` FK RESTRICT, `alias`, `source`, `active`; não cria correspondência automática apenas por texto |
| `product_mapping_audit` (ou `audit_log` quando houver mecanismo comum) | `product_id`, `external_code`, `action`, `previous_value`, `new_value`, data, operador disponível; evita perda de proveniência |
| `products` / `product_external_codes` | permitir CRUD transacional, ativação/desativação, pesquisar por código e nome, validação de duplicados; nunca CASCADE em fato histórico |

**Requisitos de aceite A:** importação imutável, 120 códigos de venda reconhecidos, categorização fonte ≠ gerencial preservada, 29 pendências reconstruídas do cadastro de referência, nenhuma associação por nome automática, conciliação inalterada R$ 0,00.

### Incremento B — cadastro de insumos e ficha técnica (etapa posterior à homologação A)

| Tabela | Identidade e regras essenciais |
|---|---|
| `suppliers` (opcional inicialmente) | fornecedor por loja, nome, ativo; no MVP fornecedor textual pode preceder cadastro autônomo |
| `ingredients` | `id`, `store_id`, `external_key` (se única e válida), `display_name`, `supplier_id/text`, `kind`, `active`, `created_at`; nunca usar nome em FK |
| `ingredient_cost_versions` | `id`, `ingredient_id`, `effective_from`, `effective_to`, `purchase_cost_cents`, `freight_cents`, `st_cents`, `package_quantity_decimal`, `package_unit`, `units_per_package_decimal` quando fizer sentido, `status`, `source`; custo total derivado ou imutavelmente registrado por versão; valores ausentes são NULL/erro |
| `recipes` | `id`, `product_id`, `version`, `effective_from`, `effective_to`, `status`, `created_at`; apenas uma versão vigente do tipo apropriado por período (regra verificada em transação) |
| `recipe_items` | `id`, `recipe_id`, `ingredient_id`, `quantity_decimal`, `quantity_unit`, `sort_order`; FK RESTRICT, quantidade positiva, conversão dimensional explícita (g/kg, ml/L, unidade, com equivalências autorizadas) |
| `product_prices` | `id`, `product_id`, `price_type`, `price_cents`, `effective_from`, `effective_to`, `source`; `R$ -` mapeado como preço **ausente**, não zero |

**Requisitos de aceite B:** insumo não pode ser eliminado se usado; ficha não pode ser salva com ingrediente inexistente, embalagem/quantidade inválida ou unidade incompatível; exceção explícita quando custo legitimamente indisponível, mas o CMV não será apresentado como zero válido; alteração de custo gera versão e não sobrescreve fechamentos anteriores.

### Incremento C — fechamento DRE (depois de CMV validado)

Tabelas **planejadas e não implementadas:** `expense_categories`, `period_expenses`, `employees`, `period_payroll_entries`, `payment_fee_rules`, `tax_rules`, `royalty_rules`, `period_result_snapshots`, `period_cost_snapshots`, `audit_log`. Regras de impostos/tributos permanecem sem implementação até validação de negócio. Separar cada configuração de seu fato mensal. Use FK, `NOT NULL` somente quando dados são realmente obrigatórios, `CHECK`, unicidade e auditoria. `INTEGER` para centavos e quantidade/medida em decimal fixo controlado (nunca float binário para custo financeiro crítico).

## 3. Versões/histórico sem complexidade excessiva

- **Aberto:** cálculos são reexecutados sob demanda com cadastros vigentes, exibindo origem da regra e pendências.
- **Fechando:** validar competência, integridade/importação, mapeamento, receita/fichas, custos/unidades e regras financeiras aplicáveis. Persistir snapshot com identificadores de versões, somas e justificativas.
- **Fechado:** consultar snapshot de setembro, **sem recomputação automática pelo custo atual**. Reabrir com controle administrativo e trilha, não sobrescrever snapshot original.
- **Exclusão:** produto/insumo referenciado desativa; exclusão física somente de rascunho sem dependentes nem histórico.

## 4. Fluxo proposto para novo insumo

Abrir **Insumos** → pesquisar/filtrar → **Adicionar novo insumo** → preencher identificação (nome, chave externa opcional, fornecedor, tipo), compra (valor embalagem, frete, ST e impostos confirmados), embalagem (quantidade, unidade e conversão), vigência e status → validar compatibilidade e campo obrigatório → salvar em transação → ver custo total e onde é utilizado. Edição de custos/embalagem gera nova versão; edição cosmética não precisa gerar versão financeira. Produto/receita que depende dele não perde histórico.

## 5. Fluxo proposto para novo produto/ficha

**Produtos → Adicionar novo produto**, ou clicar em uma pendência de importação → prefill **código externo, nome e categoria original**; apresentar categoria gerencial editável; **preço realizado médio apenas como sugestão identificada como tal** (nunca forçar preço de tabela) → selecionar preço vigente, status, data → **Adicionar item** de ficha sem limite artificial: pesquisar insumo, escolher quantidade e unidade → recalcular CMV a partir do custo vigente usando unidade compatível → validar completude; se houver custo/embalagem faltante exibir **pendente**, não R$ 0,00 → salvar produto + mapeamento + ficha versionada em operação transacional. Se desejar mapear a produto existente, exigir confirmação visual dos códigos e preservar o código de origem.

## 6. Operações de importação e venda com produto desconhecido

Seleção local XLS/XLSX → período selecionado + período pagamentos detectado → parse/colunas/erros → guardar bruto e normalizado → totais em centavos → conciliação → consulta por `store_id + external_code` → pendência com `codigo`, `nome`, `categoria`, `quantidade`, `valor`, status (`SEM_CADASTRO`, `SEM_FICHA`, `SEM_CUSTO`, `MAPPED`) → ações **Criar produto**, **Mapear existente**, **Corrigir código** (com justificativa/auditoria; nunca alterar bruto), **Exceção** somente após definir permissões. Conciliação positiva **não libera fechamento** com cadastro incompleto.
