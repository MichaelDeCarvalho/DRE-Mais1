# IMPORT SPEC — adaptador da origem atual

## Produtos

Nome de arquivo de exemplo: `produtos-set-2026.xlsx`. Colunas localizadas por cabeçalho normalizado (acentos, espaços e caixa), nas primeiras 50 linhas e em qualquer aba (mais de uma correspondência = erro):

| Campo do domínio | Coluna da origem | Obrigatório |
| --- | --- | --- |
| `external_code` | `ID` | sim |
| `name` | `Produto` | sim |
| `category` | `Categoria` | sim |
| `quantity` | `Quantidade` | sim |
| `value_cents` | `Valor` | sim |
| `raw_cells_json` | todas as colunas, inclusive `Index`, `Copo Reutilizável`, `Produtos vendidos`, `Interno` | preservadas |

Todas as 122 linhas de setembro são importadas, sendo 120 linhas de venda com códigos distintos, 1 placeholder de valor zero e 1 ajuste de -R$ 3.426,07. O ajuste não é tratado como produto.

## Pagamentos

`Método de Pagamento` e `Total` obrigatórios; `Cliente`, `Ticket Médio`, `Produto por Atendimento` e `P.A.` opcionais. Métodos permitidos na fixture: Crédito, Crédito Manual, Débito, Débito Manual, PIX, Carteira Digital, Outro, Dinheiro e Voucher. Qualquer outro método é erro `PENDENTE DE VALIDAÇÃO`, e nunca recategorizado como Outro por padrão.

`entry_type=MANUAL` nos dois tipos manuais; as demais entradas são `STANDARD`. Sem suprimir `method_raw`.

## Rejeições

- Extensão diferente de XLS/XLSX; planilha inválida, ausente, vazia ou maior que 20 MiB.
- Cabeçalhos obrigatórios não detectados ou duas abas simultaneamente compatíveis.
- Células monetárias vazias/inválidas; mais de 2 casas decimais em texto; erro de Excel.
- Quantidade negativa/fracionária, código de venda inválido, ajuste desconhecido.
- Mês do pagamento diferente do selecionado; duas competências no mesmo arquivo.
- Método de pagamento não reconhecido; duplicata de hash; tentativa de substituição controlada ainda não disponível.

## Preservação e idempotência

Os bytes exatos dos arquivos, SHA-256, filename, tamanho, parser_version, origem/linha, cabeçalhos, células em JSON, método original/normalizado e valores em centavos são armazenados. A transação armazena **ambos ou nenhum**. Par divergente pode ser persistido com status `DIVERGENTE` para exame, mas não autoriza fechamento.

**Nota:** não se afirmou que o XLS exportado original é idêntico ao modelo `.xls.xlsx` recebido; os dois exports reais precisam de validação de aceitação antes de produção.
