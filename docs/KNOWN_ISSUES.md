# KNOWN ISSUES / PENDENTE DE VALIDAÇÃO

1. **RESOLVIDO PARA A AUDITORIA (ver atualização 2026-10-10):** o arquivo consolidado `09 - DRE - SET_2026 - LOJA SJP(1).xlsx` não estava entre os anexos acessíveis na sessão anterior. **Agora está disponível e os 29 foram comprovados.** O banco de desenvolvimento ainda vazio exibe 120.
2. **BLOQUEADOR DE HOMOLOGAÇÃO:** toolchain Rust/Cargo e dependências nativas Tauri indisponíveis no ambiente da criação, e registro npm inacessível. `cargo test`, `npm install`, `npm test`, `npm run build` e abertura desktop **não foram executados**.
3. **BLOQUEADOR DE PRODUÇÃO:** validar XLS/XLSX exportados diretamente pelo sistema da loja; os arquivos fornecidos chamam-se modelos `.xls.xlsx`, e a planilha original consolidada poderia ter formatação diferente.
4. **RISCO DE PERÍODO:** modelo de produtos não fornece data verificável. Mês confirmado por operador e relatório de pagamentos somente.
5. **SEM CADASTRO/EDITOR:** tabela de mapeamentos está pronta, mas não há tela para cadastrar; próximo marco deverá usar o catálogo e distinguir `sem cadastro` de `sem ficha técnica`.
6. **SEM SUBSTITUIÇÃO/REPROCESSAMENTO CONTROLADO:** reimportação de arquivo igual ou mês já importado é bloqueada intencionalmente.
7. **SEM BACKUP E CONTROLE DE ACESSO:** base local SQLite simples é legível por quem tenha acesso ao computador; não alegar criptografia ou prontidão comercial.
8. **Regras futuras de CMV/DRE não definidas aqui:** impostos, royalties, taxa Voucher/Outro, Marketing Local, Perdas, colunas `Interno` e `Copo Reutilizável` continuam pendentes no Prompt Mestre e fora deste marco.

---

## Atualização após recebimento da planilha consolidada (2026-10-10)

**Resolvido em termos de evidência:** o impedimento anterior "planilha consolidada ausente" deixou de existir. Foram encontrados **135 códigos em Base DRE**, **120 vendidos**, **29 vendidos não mapeados**, valor **R$ 3.653,70**; a relação completa está em `unmapped_products_2026_09.csv`. **Não significa** que esses produtos tenham sido cadastrados no SQLite: a base do aplicativo ainda está vazia.

| ID | Classificação | Evidência | Impacto / próxima ação |
|---|---|---|---|
| AUD-01 | Erro estrutural | 63 erros cacheados: 35 `#N/A`, 25 `#DIV/0!`, 3 `#VALUE!` | Não migrar fórmulas diretamente; validação Rust; inventário CSV |
| AUD-02 | Erro estrutural | 7 entradas de nomes definidos com `#REF!` | Substituir nomes por campos/regras de domínio |
| AUD-03 | Possível inconsistência de negócio | `DRE MENSAL!D5=Agosto`, `Meses!F4=08/2026`, pagamentos `09/2026` | Bloquear fechamento em divergência; pagamentos zerados não são verdadeiros zeros |
| AUD-04 | Cadastro incompleto | 29 vendidos não presentes na Base DRE, R$ 3.653,70 | Wizard de produto/mapeamento; bloquear CMV final |
| AUD-05 | Cadastro incompleto | Nome `COPO REUTILIZAVEL GELADOS` duplicado (Insumos D11/D35), distintas fichas de embalagem; 9 preços faltantes, 10 custos totais cacheados zero | ID interno, desambiguação, validação e vigência; não usar nome como FK |
| AUD-06 | Cadastro incompleto | 61/118 insumos sem volume e 29/118 sem quantidade, sem unidade explícita | Não inferir unidade; bloquear custo quando dependência exigir |
| AUD-07 | Regra pendente | 42 reclassificações do relatório original para categoria `PARA COMER` | Separar bruto/gerencial; confirmar vigência para outros meses |
| AUD-08 | Método escolhido; parâmetros pendentes | Simples 8% na planilha vs cálculo auxiliar ~5,3156% | Estimativa por faixa confirmada em ADR-008; RBT12/anexo/base fiscal/DAS de setembro ainda pendentes |
| AUD-09 | Regra pendente | Marketing Local 2% sem valor; Perdas 1% com valor 0; taxas de Voucher/Outro | Confirmar antes do módulo DRE |
| AUD-10 | Possível inconsistência de negócio | `Planilha1` não existe neste arquivo, embora citada no Prompt Mestre | Não confirmar R$ 150 de faxina sem a versão de origem; DRE atual exibe R$ 100 |
| AUD-11 | Regra pendente | Sem evidência de significado definitivo `Interno` e `Copo Reutilizável` | Importar e preservar sem inferir impacto monetário |
| AUD-12 | Erro estrutural | `CMV_Lista` e `CONSUMO DE INSUMOS ` mantêm fichas paralelas | Fonte única `recipe_items` |
| AUD-13 | Possível inconsistência de negócio | O consolidado contém CMV ~R$ 7.771,16 e resultado ~R$ 4.143,02 apesar de pendências | **Não homologar CMV, DRE ou lucro** |
| AUD-14 | Regra pendente | Preço `USAR`/`TABELA 2`, textos `R$ -`, 20% compra e arredondamento | Tipos, vigência e parâmetro de compra a confirmar no marco próprio |
| AUD-15 | Não avaliado | Compilação Tauri/Rust, npm e interface no Windows | Testes reais obrigatórios no computador de desenvolvimento |

## Continuidade 2026-10-11
- **Decisão tributária resolvida para projeto:** Simples Nacional **estimado por faixa**, com DAS efetivo separado (ADR-008). Continua **PENDENTE DE VALIDAÇÃO** o enquadramento, RBT12/base do mês e valor apurado; não desenvolver módulo fiscal no Marco 1.
- **Importação de catálogo preparado, NÃO homologada em Rust/Tauri:** migration 0002, parser de Base DRE e interface opcional para 135 códigos com 14 linhas inválidas, destinados a obter 29 pendências reais. Fixture da planilha contém informações financeiras internas: repositório deve ser PRIVADO e distribuição comercial não deve incluí-la.
- **Execução Tauri indisponível nesta sessão:** Rust/Cargo/WebKitGTK não instalados; npm registry sem DNS (`EAI_AGAIN`). Testes de compilação e E2E permanecem NOT EVALUATED.
- **Ainda fora de escopo:** vínculo gerencial de categoria por vigência, cadastro/edit de produtos/insumos, CMV, imposto calculado, fechamento, dashboard.

## 2026-10-11 — Continuidade 1.3
- **Mitigado no código, teste Rust pendente:** possível diferença entre arquivo original preservado e planilha processada; agora uma leitura única em memória. A pesquisa na API de Calamine confirmou `open_workbook_auto_from_rs` disponível na série 0.36.
- **Mitigado no código, teste Rust pendente:** consulta com linhas/BLOB alterados. Agregados e hash/tamanho agora são verificados e produzem erro explícito. 8 testes independentes SQLite PASS não substituem validação do código Rust.
- **Pendente:** ausência de Cargo, instalações npm e bibliotecas Tauri para homologação.

## Marco 1.4 — estado de homologação
- Código da consulta de catálogo persistido e proteções de interface **não compilado em Rust/React** por ausência de Cargo e dependências do frontend; validar no host antes de considerar pronto.
- CI GitHub Actions preparado, ainda **não executado**, usa instalações online não determinísticas enquanto faltarem `package-lock.json` e `src-tauri/Cargo.lock`.
- Nenhum avanço para CMV, DRE, Simples Nacional calculado, cadastramento completo ou histórico anual. Simples por faixa permanece decisão funcional do módulo futuro.
