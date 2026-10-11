# VALIDATION LOG — 2026-10-10

| Checagem | Como foi executada | Resultado |
| --- | --- | --- |
| Leitura dos modelos XLSX | `artifact_tool` nos 2 anexos | PASS — 122 linhas de produtos, 9 de pagamentos |
| Totais setembro/2026 | `python tools/verify_fixtures.py` | PASS — produtos = pagamentos = 2.494.463 centavos; diferença 0 |
| Pagamentos normalizados | mesmo comando | PASS — 1.137.349 Crédito, 648.785 Débito, 500.959 PIX, 118.392 Carteira, 47.115 Outro, 35.790 Dinheiro, 6.073 Voucher (centavos) |
| Migration SQLite | mesmo comando (`sqlite3` real) | PASS — estrutura, FK, unicidade de período, BLOB intacto, bloqueio hash duplicado |
| Fixt. negativas criadas | `artifact_tool` export | PASS — coluna obrigatória faltante, período misto, valor ausente; estrutura inspecionada |
| Suite independente | `python tools/verify_fixtures.py` | **13 de 13 PASS** |
| Sintaxe TS/TSX | `typescript.transpileModule` em Node.js, 6 arquivos | PASS — sem erro sintático (não é typecheck) |
| Função real de formatação | `typescript.transpileModule` + 4 asserts Node.js | **4 de 4 PASS** |
| Rust `cargo test` | Não executado, `cargo` ausente | **NOT EVALUATED** |
| Frontend Vitest/build | Não executado, sem pacotes npm, DNS npm indisponível | **NOT EVALUATED** |
| Tauri launch/build/installer | Não executado, sem Rust e dependências GTK/WebKit | **NOT EVALUATED** |
| Planilha DRE consolidada | Recebida em 2026-10-10 e submetida à auditoria OOXML e confronto por código | **PASS (auditoria)** — 29 códigos comprovados; ver `AUDIT_VERIFICATION.md` |

**Conclusão:** código e conjunto de testes preparados; evidência real de dados, migration e formatação; marco 1 **não homologado** enquanto não passar por execução do Rust, build do desktop e testes com exports originais.

## Atualização — auditoria completa 2026-10-10

Foram executados **29 testes independentes** (29/29 PASS) sobre XML da DRE consolidada, valores das exportações-modelo e comparações por código. **Não recalculam fórmulas Excel e não substituem `cargo test`, `npm test` ou lançamento do Tauri**. Os cálculos finais CMV/DRE não foram homologados. Ver `AUDIT_VERIFICATION.md`.
