# CURRENT ARCHITECTURE

Arquitetura **implementada no código, não compilada nesta sessão**:

```text
Operador local
     | escolhe mês e dois arquivos com diálogo nativo
React + TypeScript + Vite
     | Tauri invoke('import_reports')
Comando local Tauri 2
     | lê/valida XLS/XLSX (calamine), somas i64 em centavos
Domínio Rust (importer.rs)
     | valida período, normaliza, concilia, detecta códigos
Camada SQLite (rusqlite)
     | transação atômica: período + importações + linhas
SQLite no app_data_dir() do usuário
```

Sem HTTP/API, Supabase, autenticação, tenant, Cloudflare ou serviço remoto.

Camadas:
- UI: `src/App.tsx`, `src/types.ts`, `src/format.ts`, `src/styles.css`.
- Desktop: `src-tauri/src/lib.rs`, plugin de diálogo, comando Rust sem `fs` genérico no frontend.
- Domínio/importação: `src-tauri/src/importer.rs`, validação de cabeçalho/métodos, dados tipados.
- Persistência: `src-tauri/src/database.rs`, migration versionada `0001_init.sql`.
- Testes: unidade e integração Rust declarados; verificação independente de fixture e SQLite em Python executada.

Boundary: a UI obtém caminhos, a leitura e gravação ficam no Rust; toda persistência do par é única transação SQLite. Relatórios estruturamente inválidos e meses incompatíveis não são gravados. Diferença de totais é gravada explicitamente como `DIVERGENTE`; não há fechamento definitivo.

---

## Revisão 2026-10-10

**Sem mudança da arquitetura executável:** Tauri 2, React/TypeScript/Vite, Rust e SQLite local. As tabelas da migration `0001_init.sql` não foram alteradas. A análise da planilha exige como próximos incrementos classificação gerencial com proveniência e vigência, editor/mapeamento de produto, ficha técnica e custos versionados. **Essa arquitetura futura ainda não está implementada.** Ver `DATA_MODEL_REVIEW_2026_09.md` e ADR-005/006/007.

### Atualização 2026-10-11 — Marco 1.2 em preparação
- Migration incremental `0002_legacy_catalog.sql` (além de `0001_init.sql`): armazenar fonte Excel bruta e linhas da referência com flags de erro/ID de produto; sem dados CMV nem regras de impostos.
- Módulo Rust `src-tauri/src/catalog.rs`: parser de `Base DRE`, cadastro provisório por código, revisão de pendências do mês já importado.
- Interface: opção separada de carregar **cadastro legado** antes/depois dos relatórios mensais. O fluxo normal continua apenas dois relatórios.
- **Não validado** por compilação Rust/Tauri neste ambiente; consultar `SESSION_HANDOFF.md`.

### Verificação de integridade — Marco 1.3
Os parsers de XLS/XLSX/legado operam sobre a mesma cópia local de bytes previamente hashada, e não reabrem o caminho. Ao consultar um período, a camada Rust verifica quantidade/soma das linhas e compara hash/tamanho do BLOB com os metadados. **Implementado em código, não homologado por execução Rust.**

### Incremento 1.4 — leitura persistida do catálogo
- `get_catalog_status` (comando Tauri somente leitura) consulta `legacy_catalog_imports` e `legacy_catalog_rows` no SQLite e verifica SHA-256/tamanho e contagens antes de retornar estado à interface.
- `src/App.tsx`: reação ao estado do backend no início da sessão, cancelamento de seletor sem descartar resultado e desabilitação temporária de controles durante execução.
- Não há migration nova nem alteração da modelagem para CMV/DRE; implementação Rust/React **não compilada neste ambiente**.
