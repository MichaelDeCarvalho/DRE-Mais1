# Testes executados — auditoria consolidada (2026-10-10)

**Execução real:** `python verify_audit.py` (biblioteca padrão Python, leitura OOXML da planilha e dos dois relatórios de origem) → **29 testes executados, 29 aprovados, 0 falhas**.

**O que foi verificado:** existência/inventário das 10 abas, 5.133 células com fórmula, 63 erros em cache por tipo, sete nomes definidos quebrados, períodos agosto/setembro, receita bruta 2.837.070 centavos, ajustes -342.607, receita líquida 2.494.463, pagamentos 2.494.463, conciliação 0, crédito 1.137.349, débito 648.785, 120 códigos vendidos, 135 na Base DRE, 29 sem referência e 365.370 centavos, 42 reclassificações (17 doces, 14 salgados, 11 sanduíches), nenhum produto ausente na cópia consolidada e nenhum desvio de quantidade/valor, duplicidade de nome de insumo, ausência de `Planilha1` e que nenhuma migration nova foi introduzida.

**Não foi verificado:** reavaliação no Excel de 5.133 fórmulas; validação semântica de cada receita quanto a quantidades e conversões; corretude final do CMV/DRE; compilação Rust; build React/Vite; execução da aplicação desktop no SO do cliente. Fórmulas compartilhadas em OOXML podem omitir o texto repetido em células dependentes; o arquivo `formula_inventory.csv` identifica os placeholders, mas não expande as expressões.

**Artefatos reproduzíveis:** `verify_audit.py`, `audit_ooxml.py`, `extract_metrics.py`, `compare_reports.py`, `raw_audit.json`, `inventory.json`, `metrics.json`, `report_comparison.json`, `test_output.txt` e os CSV de erros, fórmulas, categorias e produtos pendentes, entregues no pacote de auditoria. Os três XLSX originais são necessários para reexecutar os scripts como fornecidos. Não foram modificados.
