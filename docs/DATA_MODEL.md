# DATA MODEL — migration 0001

Implementação: `src-tauri/migrations/0001_init.sql`, SQLite com `PRAGMA foreign_keys = ON` e `PRAGMA user_version=1` após migration atômica.

| Entidade | Papel |
| --- | --- |
| `stores` | loja local padrão (id=1), preparada para isolamento lógico futuro |
| `periods` | competência `AAAA-MM`, estados limitados a `IMPORTADO` / `DIVERGENTE` |
| `products` | cadastro interno opcional, **não** autopreenchido por importação |
| `product_external_codes` | código externo único por loja associado a ID do produto |
| `imports` | hash SHA-256, nome, tamanho, blob original, cabeçalhos, período, versão parser, total, status |
| `import_product_rows` | linha bruta, código, descrição, categoria, quantidade, valor e tipo |
| `import_payment_rows` | linha bruta, método original e normalizado, subtipo manual e valor |

Relações: loja → competência → importação → linhas; loja → produto → código externo. Unicidades: `(store_id, year_month)`, `(store_id, kind, file_sha256)`, `(store_id, period_id, kind)`, `(store_id, external_code)`. Os valores monetários persistidos são `INTEGER` representando centavos; sem `REAL` para dinheiro.

Entidades de CMV, DRE, taxas, usuários, usuários de importação e licenciamento serão introduzidas por **migrations futuras**, não por tabelas vazias sem regra. O banco inicialmente não tem produtos cadastrados; 120 códigos de setembro serão listados como não mapeados. **Atualização 2026-10-10:** o catálogo da DRE consolidada foi recebido e permite comprovar 29 códigos vendidos ausentes entre os 135 códigos de referência; esses 135 ainda não foram persistidos no SQLite. Ver `DATA_MODEL_REVIEW_2026_09.md`.


## Migration 0002 — catálogo legado opcional (2026-10-11)
- `legacy_catalog_imports`: arquivo consolidado original, hash, nome, bytes, quantidades válidas/pendentes e data.
- `legacy_catalog_rows`: linha/células de origem, código externo, ID de produto vinculado, indicador de erro e justificativa (quando `#N/A`); FK RESTRICT.
- Os 135 códigos válidos da `Base DRE` são carregados **somente após opção do usuário**, para compor `products` + `product_external_codes`, sem custos/CMV e sem reescrever registros já existentes.
- 14 nomes com código `#N/A` são registrados como pendentes (rodapé "Total Unitário" não é linha de produto). Depois da carga, setembro deve revelar 29 códigos de venda desconhecidos.
- `user_version=2`; instalação já com versão 1 aplica apenas 0002, instalação nova aplica 0001 e 0002.
- Não há migração tributária nesta etapa; faixa Simples e DAS efetivo permanecem apenas em ADR-008.
