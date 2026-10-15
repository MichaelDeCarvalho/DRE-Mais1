# ADR — Desktop atual com arquitetura preparada para SaaS

- **Status:** ACCEPTED como diretriz arquitetural; **implementação dos desacoplamentos: PENDENTE**
- **Data:** 2026-10-14
- **Origem:** decisão expressa do responsável pelo DRE Mais1 após homologação da importação da planilha DRE e persistência no Windows.
- **Repositório:** `MichaelDeCarvalho/DRE-Mais1`
- **Afeta:** arquitetura, contratos de domínio, persistência, segurança futura, testes, integração de rubricas financeiras.

## Contexto verificado

A base atual utiliza React/TypeScript/Vite no frontend, Tauri 2 como adaptador desktop, núcleo Rust e SQLite local. O código contém módulos como `importer.rs`, `database.rs`, `recipes.rs`, `expenses.rs`, `financial_rules.rs`, `financial_parameters.rs`, `dre_preview.rs` e `dre_workbook.rs`. As funções de domínio e de persistência ainda estão parcialmente acopladas a `rusqlite::Connection`; a UI concentra chamadas Tauri em `src/App.tsx`. O modelo local tem referências fixas a `store_id=1`, válidas apenas no contexto de loja local existente.

O responsável confirmou no Windows a recuperação da receita conciliada de setembro/2026 (R$ 24.944,63) e a importação/persistência da planilha DRE. Os indicadores **documentais** registrados para comparação são: receita R$ 24.944,63; despesas variáveis R$ 11.895,31; despesas fixas R$ 9.288,76; resultado informado R$ 3.760,57. Esses valores são um espelho da planilha validada, **não** um fechamento operacional recalculado pelo motor.

## Decisão

1. **Manter o produto offline** (Tauri 2 + Rust + SQLite) como versão operacional e escopo de entrega atual.
2. **Projetar novas regras de negócio como código de domínio independente** de Tauri, interface React e mecanismo de banco. Priorizar funções puras, tipos explícitos e cálculos monetários auditáveis.
3. **Introduzir separação progressiva, sem big-bang**:
   - `domain`: conceitos e regras de CMV/DRE, classificação, cálculo e validação sem dependência de SQLite/HTTP/Tauri;
   - `application`: operações/casos de uso, controle de duplicidade, vigência e transações, por interfaces claras;
   - `adapters`: implementação SQLite local + comandos Tauri atuais; API e persistência online serão adaptadores futuros, quando autorizados.
4. Preservar origem imutável dos relatórios e da planilha validada, hash e competência; **não transformar automaticamente linhas de referência, subtotais, folha, tributos e royalties em novos lançamentos operacionais**.
5. Separar **DRE de referência documental** de **DRE operacional calculada**; integração de rubricas exige classificação, proveniência, identificador único e política explícita de substituição/associação, nunca soma silenciosa.
6. Não criar infraestrutura, serviço remoto, login SaaS, tenancy nem migração SQLite → PostgreSQL nesta etapa. Essas funcionalidades exigem projeto e validação próprios.
7. Para eventual SaaS multiempresa, a autorização será imposta no backend e na camada de dados (incluindo RLS quando aplicável); `store_id` fixo e permissões da UI não representam isolamento entre tenants.
8. Não reescrever módulos validados por antecipação: extrair limites de dependência apenas quando a integração financeira ou outra mudança real os tocar, protegidos por testes.

## Alternativas consideradas

- **Converter agora para SaaS:** rejeitada nesta fase por custo operacional, novo perímetro de segurança e risco aos dados já validados.
- **Manter dependência direta de Tauri/SQLite em todo novo código:** rejeitada pelo retrabalho futuro.
- **Refatoração total imediata para arquitetura em camadas:** rejeitada pelo risco de regressão e custo desproporcional.
- **Separação incremental com testes:** aceita.

## Critérios de aceite para os próximos incrementos

- Importação, conciliação, cadastro e persistência já validados no Windows mantêm o comportamento anterior.
- Motor financeiro e interpretação de rubricas conseguem ser testados sem abrir Tauri nem acessar SQLite, nos componentes que forem extraídos.
- Referência documental não cria despesa, CMV ou tributo automaticamente; valores armazenados continuam idênticos ao Excel importado.
- Não há duplo cômputo ao integrar rubricas: cada lançamento operacional deve ter origem rastreável e regras de idempotência/associação.
- Competência e versionamento temporal são preservados; fechamentos e snapshots não mudam silenciosamente.
- Testes Rust, frontend, migrações e regressão desktop são executados nos incrementos que afetarem tais camadas; não relatar aprovação sem evidência real.

## Sequência proposta

1. **Próximo incremento de implementação:** auditar `dre_workbook.rs`, `expenses.rs`, `dre_preview.rs`, `financial_rules.rs` e migrations para definir o contrato mínimo de rubricas de referência → associação a categorias gerenciais, sem contabilização duplicada.
2. Extrair a classificação/normalização financeira para domínio Rust com testes unitários; manter adaptador SQLite existente e comando Tauri estável.
3. Implementar associação rastreável e política explícita de reconciliação, primeiro em dados sintéticos e banco de homologação; não escrever no banco de referência do usuário.
4. Homologar nova versão Windows com backup, comparação de setembro/2026 e teste de reabertura.
5. Avaliar camada HTTP, autenticação, PostgreSQL, isolamento multiempresa, backups e operação online somente em fase SaaS aprovada.

## Riscos e trade-offs

- O código atual possui acoplamentos a SQLite e `store_id=1`, que precisarão ser tratados antes de um SaaS real.
- Fronteiras excessivas implementadas cedo aumentam complexidade sem benefício; preferir interfaces mínimas orientadas pelos casos de uso reais.
- Cálculos dependentes de dados financeiros e snapshots exigem reconciliação centavo a centavo, origem e testes de regressão.
- Um SaaS futuro exige novos testes de concorrência, permissões, isolamento entre clientes, migração de dados e segurança: validação desktop **não** substitui validação SaaS.

## Rollout e rollback

Esta decisão é **somente documental**. Não altera binário, migrations, banco SQLite, scripts de build ou instalação Windows. Incrementos subsequentes deverão ocorrer em branch, com CI e plano de rollback específico. O banco de referência validado nunca deve ser alterado como parte de experimentos de arquitetura.

## Estado da entrega

- Decisão estratégica: **aprovada pelo responsável**.
- Documento ADR: registrado na branch de proposta.
- Implementação das interfaces e adaptações: **não iniciada neste ADR**.
- Testes do novo código SaaS-ready: **não aplicáveis a uma alteração documental**.
