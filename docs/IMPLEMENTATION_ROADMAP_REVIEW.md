# Sequência revisada e critério de aceite — pós-auditoria de setembro

| Ordem | Etapa | Entrega mínima | Dependência/condição de aceite |
|---:|---|---|---|
| 0 | **Auditoria da planilha consolidada (esta entrega)** | Inventário de 10 abas; 5.133 células com fórmulas; grafo; erros; 29 códigos; 42 categorias reclassificadas; ADR e riscos | **Concluída como análise, sem aprovar CMV/DRE** |
| 1 | **Homologar o primeiro marco já codificado** | Compilar Tauri/Rust, executar `cargo test`, `npm test`, build, abrir UI, importar XLS/XLSX de setembro e verificar SQLite/duplicidade/erros | **Ainda pendente**, toolchain não disponível na sessão anterior; verificar exportação real do sistema se distinta dos modelos |
| 2 | **Resolver correspondência de produtos no primeiro marco** | Importação controlada dos 135 candidatos de `Base DRE`, cadastro/alias/mapeamento por ID; 29 novos pendentes, nenhuma associação por nome silenciosa | Conciliação de R$ 24.944,63 preservada; indicar 29 pendências no catálogo histórico e regra gerencial de 42 categorias como configurável |
| 3 | **Editor de insumos** | Cadastro/edit/desativação, pesquisa/filtros, custo/embalagem/unidades, fornecedor, histórico, "usado em" | Nenhum insumo referenciado pode ser excluído; não existe divisão por zero escondida |
| 4 | **Editor de produtos e fichas técnicas** | Produto, preço, código, categoria, composição flexível, CMV unitário e %, versão de receita | Testes de unidade/conversão; nunca transformar ausência em custo zero |
| 5 | **CMV de setembro e consumo teórico** | Recalcular a partir de fichas, comparar com dados salvos com sinalização; consumo e sugestão de compra configurável | **Não usar** R$ 7.771,16 como resultado de aceite; cobertura de receitas/custos suficiente |
| 6 | **DRE e fechamento** | Despesas, folha, taxa de pagamento, imposto, royalties, regras confirmadas, snapshot, histórico por competência | Resolver decisões tributárias, taxas e contas; não aceitar o resultado atual R$ 4.143,02 |
| 7 | Dashboard/histórico | Somente após a validação do fechamento e estabilidade | Fora do primeiro marco |

## Pendências que **não** bloqueiam a engenharia do próximo incremento

- Regra tributária Simples (8% vs faixa ~5,3156%).
- Taxa `Outro`/Voucher, Marketing Local 2%, Perdas 1%, outros lançamentos não preenchidos.
- Impactos operacionais dos campos `Interno` e `Copo Reutilizável`.
- Política de arredondamento para compra e taxas; significado de `USAR` vs `TABELA 2`.
- Despesa Material de Limpeza: versão recebida tem R$ 100; a suposta `Planilha1` de R$ 150 não existe nesta versão.

Essas pendências **bloqueiam somente os cálculos que dependam delas**, e não justificam adiar compilação, cadastro de código externo, ou a interface de importação. Não criar SaaS/licenciamento/histórico anual nesta sequência.
