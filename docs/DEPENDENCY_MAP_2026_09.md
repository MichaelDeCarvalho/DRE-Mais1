# Grafo de dependências do Excel → limites de domínio do aplicativo

## Referências cruzadas reais (fórmulas explícitas)

Números representam **células cuja fórmula faz referência direta à aba indicada**, não necessariamente relações distintas de negócio. Fórmulas compartilhadas podem armazenar a expressão apenas na célula mestre.

| Aba de destino que consulta | Referência explícita consultada | Células com referência |
|---|---|---:|
| `CMV_Lista` | `Insumos` | 1.048 |
| `CMV_Lista` | `TABELAS` | 145 |
| `CMV_GERAL` | `CMV_Lista` | 193 |
| `Base DRE` | `VD_Produtos` | 158 |
| `Base DRE` | `CMV_Lista` | 149 |
| `Base DRE` | `Meses` | 9 |
| `DRE MENSAL` | `Base DRE` | 21 |
| `TABELAS` | `CMV_Lista` | 41 (coluna auxiliar D) |
| `Meses` | `DRE MENSAL` | 1 (competência) |
| `Meses` | `VD_Pagamento` | 20 |
| `Meses` | `Meses` | 1 |
| `CONSUMO DE INSUMOS ` | `VD_Produtos` | 110 |
| `CONSUMO DE INSUMOS ` | `Insumos` | 115 |

## Diagrama funcional (direção dos dados)

```text
EXPORTAÇÃO DE PRODUTOS ─────► import_product_rows ───┬──► conciliação ────────┐
                              │                       ├──► receita por categoria │
                              │                       └──► unidades vendidas     │
                              └─► product_external_codes ─► products            │
                                                           │                    │
Insumos (cadastro + custo vigente) ─► recipe_items ─► recipes                │
                                           │               │                    │
                                           └─► CMV unitário e consumo teórico    │
                                                    │                           │
TABELAS (preço histórico) ───────────────────────────┘                           │
                                                                                ▼
EXPORTAÇÃO DE PAGAMENTOS ─► import_payment_rows ──► métodos e competência ──► DRE
                                                  │                           ▲
                                                  └─► conciliação ───────────┘
Despesas mensais + Folha + Impostos + Taxas + Royalties ─────────────────────┘

DRE + versão de fichas/custos/regras + importações → SNAPSHOT de mês FECHADO
```

**Separar o dado bruto da classificação gerencial**: `category_raw` / `category_managerial` resolvida por regra explícita e vigência. O fluxo não depende da posição das linhas em `VD_Produtos`, da coluna do ingrediente na `CMV_Lista` ou de concatenação textual em `Meses`.

## Relações que não devem ser transpostas como tabelas

- `Base DRE`: camada derivada de joins e cálculos, não entidade persistida.
- `CMV_GERAL`: visão calculada com base em receita vigente e preço.
- `Meses`: competência `YYYY-MM` + agrupamento de pagamentos no domínio.
- `CONSUMO DE INSUMOS `: relatório derivado das **mesmas** fichas técnicas utilizadas no CMV.
- `DRE MENSAL`: visualização de movimentos configurados/derivados, com **snapshot final** no fechamento; não espelhar células D7, D15 etc.

## Dependências entre versões

1. `imports` e suas linhas nunca são alterados silenciosamente (substituição apenas por nova versão/controlada e trilha).
2. `product_external_codes` liga código externo a ID; texto é metadado e alias, não chave principal.
3. `recipe_version` + `ingredient_cost_version` + `product_price_version` determinam cálculos de uma competência ainda aberta.
4. Após fechamento, `period_snapshot` e respectivas linhas apontam para versões/reproduzem centavos empregados; alteração de outubro não recalcula setembro fechado.
5. Pagamentos e taxas são relacionamentos distintos: `import_payment_rows` (fato importado), `payment_fee_rules` (configuração vigente).
6. Uso da categoria gerencial em DRE deve registrar a regra/versão aplicada ao período.
