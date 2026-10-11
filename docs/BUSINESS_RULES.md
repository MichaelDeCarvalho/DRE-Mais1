# BUSINESS RULES — confirmação por fonte

## Confirmado para setembro/2026

- Campos obrigatórios de produtos: ID, Produto, Categoria, Quantidade, Valor. Extras preservados.
- Campos obrigatórios de pagamentos: Método de Pagamento, Total. Extras preservados.
- Pagamentos: prefixo `MM/AAAA - Método`; **Crédito + Crédito Manual = Crédito**; **Débito + Débito Manual = Débito**; manter o detalhe original.
- Totais: somar inteiros de centavos com overflow detectado; diferença exata entre líquidos de produtos e totais de pagamentos; zero somente se real.
- Produtos: linhas de venda identificadas por código externo; não mapear por nome. Não mapeado = pendência, não CMV zero.
- Linha `ID 0 / Total de Descontos e Taxas` de valor negativo é ajuste de receita, não produto. Linha `ID 0 / Vendas Lançadas Manualmente` igual a zero é placeholder, não venda. Outros registros `ID 0` devem ser rejeitados no adaptador inicial.
- Período: divergência entre mês escolhido e período de pagamentos rejeita importação; competências mistas dentro do relatório de pagamentos também são rejeitadas.
- Duplicidade: SHA-256 por tipo/loja impede duplicar; substituição do mesmo mês, mesmo com hash diferente, bloqueada até fluxo controlado.

## PENDENTE DE VALIDAÇÃO

- Data/período próprio do arquivo de produtos: o modelo atual não fornece. Usuário seleciona mês, mas a origem **não pode ser atestada** independentemente.
- Catálogo de produtos da DRE original e 29 códigos não mapeados em relação àquela base; cadastro não incluído.
- Regras de `Interno`, `Copo Reutilizável`, `Itens/Produtos vendidos` não integram a soma financeira neste marco; são preservadas, sem interpretação inventada.
- Identificação de exceções não previstas de ID zero, novos métodos de pagamento, estornos e outros arquivos/layouts.
- CMV, DRE, tributação, taxas de pagamento, royalties, despesas e fechamento NÃO implementados.

---

## Regras identificadas na auditoria integral da DRE consolidada (2026-10-10)
1. **Fonte:** relatório de produtos e métodos de pagamento originais são fontes do movimento; consolidado contém a classificação e cálculo atuais, não o dado bruto definitivo após edições manuais.
2. **Categorias:** em setembro, 42 produtos foram reclassificados de `DOCES`/`SALGADOS`/`SANDUÍCHES` para `PARA COMER`. Separar categoria bruta e gerencial; vigência geral **PENDENTE DE VALIDAÇÃO**.
3. **Integridade:** 120 códigos vendidos, 135 códigos em `Base DRE` e 29 vendidos não cadastrados (R$ 3.653,70). Códigos externos são chaves, nomes são apoio; CMV indefinido permanece indefinido.
4. **Vendas:** receita positiva R$ 28.370,70 + descontos/ajustes -R$ 3.426,07 = R$ 24.944,63. Código 0 de desconto é ajuste, não produto.
5. **Pagamentos:** normalizar crédito manual junto a crédito e débito manual junto a débito, mas reter subtipo; total R$ 24.944,63. Período original 2026-09; DRE marcou agosto incorretamente.
6. **Insumos:** custo de aquisição é soma de custo + frete + ST quando componentes informados; uma célula cacheada como zero não prova que a mercadoria é grátis. Necessárias unidade, embalagem/quantidade e versionamento.
7. **Receitas:** custo por ingrediente = custo da embalagem × (quantidade consumida / quantidade disponível na unidade correspondente). Somar itens para CMV unitário. Não usar `IFERROR(...,0)` para dados ausentes.
8. **Consumo teórico:** vendas por produto × quantidade de receita; agregação por insumo. `consumo/embalagem × 1,20` representa sugestão teórica com margem 20% observada; configuração e arredondamento **PENDENTE DE VALIDAÇÃO**. Não representar "estoque físico".
9. **Preço:** `TABELAS` tem preço de referência `USAR`/`TABELA 2`; `R$ -` é ausência; a média `Valor/Quantidade` do relatório não é preço padrão automaticamente.
10. **DRE:** diferenciar receita positiva bruta e receita líquida de descontos; setembro fechado não se altera por custo novo. Os 8% do imposto, 7% royalties, taxas, folha e demais hipóteses são observações da versão da planilha, **não regras universais**.

## Tributação — decisão de 2026-10-11 (sem implementação nesta fase)
- Método de **estimativa** do Simples Nacional: cálculo por faixas baseado na RBT12 fiscal verdadeira e regras vigentes por competência, respeitando anexo e segregação de receitas.
- DAS efetivo apurado pela contabilidade é **distinto** da estimativa e deverá ser preservado com competência, origem e versão/justificativa no fechamento.
- Cerca de R$ 1.800 de DAS informado representa uma **média**, nunca alíquota, pagamento confirmado de setembro ou parâmetro fixo de fechamento.
- Valores de 8% e 5,3156% na planilha não estão homologados como valor devido de setembro.
- **PENDENTE DE VALIDAÇÃO:** RBT12, anexos, segregação de receitas e DAS efetivo de cada mês. Nenhuma base ausente pode ser presumida igual ao recebimento líquido conciliado.

## Catálogo de referência — primeiro marco
- A planilha consolidada é fonte de referência **de código externo** e categoria gerencial, mas NÃO é importada como CMV homologado.
- Linhas com código inexistente/inválido (#N/A) são preservadas e ficam pendentes, não mapeadas por nome.
- Um segundo catálogo legado não substitui o primeiro sem processo explícito de migração/revisão.
