# DRE Mais1 SaaS — Gravação segura dos relatórios mensais (incremento seguinte)

## Evidência de partida (01/11/2026)
- Pré-validação web da Loja SJP, competência 2026-09, conferida em captura do operador: 122 linhas de produtos, 120 códigos, 9 métodos, receita líquida de R$ 24.944,63, pagamentos R$ 24.944,63 e divergência zero.
- Os relatórios ainda **não** constam nas tabelas `public.imports`, `public.import_product_rows` e `public.import_payment_rows`. A competência já existe no Supabase.
- A prévia no browser **não é** garantia de origem confiável. Todo payload do frontend precisa ser verificado no backend.

## Incremento preparado nesta branch
- Migration aditiva, **APLICADA em 01/11/2026 somente à homologação** (versão `20261101194253`), criando bucket privado `dre-mais1-report-archives` para os bytes originais de ambos os XLSX.
- Política de upload: papel autenticado com acesso gerencial à mesma loja e competência `DRAFT`, caminho `store_uuid/period_uuid/PRODUCTS|PAYMENTS/sha256.xlsx`, limite 20 MiB, sem update/delete no fluxo comum.
- Política de leitura: membro autorizado da loja, por RLS.
- Antes de arquivar qualquer arquivo, `stageMonthlyReportFiles` agora executa `previewXlsxFiles` sobre os dois XLSX usando a competência `year_month` lida do PostgreSQL (não informada pelo navegador). Layout, período e valores inválidos impedem o upload. Pré-validação do navegador **não** substitui a análise autoritativa do backend.
- Testes de regressão simulam mês incompatível e cabeçalho de produto inválido, exigindo zero chamadas ao Storage.
- Gravação direta das linhas via Data API **continua bloqueada**.


## Homologação de Storage RLS (01/11/2026 — VERIFIED)
- Projeto `mgtovbvnbkzrdytudynf` exclusivamente; migration `20261101194253_prepare_private_monthly_report_archive` aplicada.
- Bucket privado criado e limitado a XLSX de até 20 MiB; policies INSERT e SELECT para `authenticated`.
- Teste SQL real dentro de `BEGIN ... ROLLBACK` simulou OWNER SJP, MANAGER e OPERATOR da organização B, UID sem membership e role `anon`.
- PASS: upload metadata + SELECT autorizado do proprietário SJP; gerente B pode inserir/consultar somente seu próprio tenant; operador B somente SELECT; tenant B não lê/escreve tenant SJP; usuário sem membership e anônimo não leem; caminho inválido, hash inválido e competência `FECHADO` rejeitados.
- UPDATE direto não modificou linha; tentativa de DELETE direto bloqueada pelo mecanismo `storage.protect_delete` do Supabase. Nunca se deve usar DELETE SQL direto no Storage.
- O teste de objetos foi de **metadados SQL**, não upload/download HTTP dos bytes pelo Storage API; isso continua NOT EVALUATED até o cliente de importação existir.
- Após rollback: 1 competência existente mantida; 0 importações, 0 linhas de produtos/pagamentos e 0 objetos no bucket.
- Security Advisors: aviso `auth_leaked_password_protection` (proteção contra senhas vazadas desativada), independente desta migration. Não há autorização para alterar as configurações de Auth neste incremento.
- **PR ainda draft**; `main` e frontend publicados não foram alterados pela instalação. Não executar novamente a migration no mesmo banco.

## Próxima implementação, após aprovação da migration
1. No frontend, gerar SHA-256 sobre os bytes dos XLSX carregados (não sobre texto extraído) e manter limite de 20 MiB.
2. Fazer upload original para o Storage privado, com `upsert: false`. Não anunciar sucesso final nesse ponto.
3. Em um backend autenticado, **ler os bytes do Storage, verificar o SHA-256 e executar o parser do layout de origem novamente**: detectar cabeçalho único, origem/aba/linha, 09/2026, descontos, método bruto e normalizado, integridade monetária em centavos; não aceitar totais enviados pelo navegador como prova.
4. Executar **uma única transação PostgreSQL** para gravar dois cabeçalhos `imports`, todas as linhas em `import_product_rows` e `import_payment_rows` e o status da competência. Validar `period.store_id`, `DRAFT`, perfil MANAGER/ADMIN/OWNER, unicidade por competência e por SHA. Usar bloqueio `SELECT ... FOR UPDATE` para concorrência e idempotência.
5. Se os valores divergirem, registrar explicitamente `DIVERGENTE`, sem autorizar fechamento. Em caso de erro em qualquer linha, nenhuma linha financeira pode ficar parcialmente gravada.
6. Como Storage e transação SQL não são uma única transação distribuída, implementar limpeza/reconciliação de **objetos órfãos** e retorno de falhas; não prometer atomicidade dos blobs com SQL.
7. Implementar consulta pelo navegador após logout/login, preservando arquivos e células JSON, e opção administrativa auditada de retificação sem DELETE indiscriminado.

## Critérios de aceite obrigatórios
- Relatórios de setembro conciliam R$ 24.944,63 = R$ 24.944,63; diferença R$ 0,00; 122/9 linhas; 120 códigos.
- RLS e Storage: usuário de loja B não consegue fazer upload, ler arquivo, criar/consultar importações da loja A; usuário sem membership e anônimo também não.
- Comprometimento deliberado do JSON de linhas, total ou hash deve falhar no backend.
- Arquivo duplicado, período já importado, duas chamadas simultâneas ou arquivo maior que 20 MiB devem rejeitar de forma determinística, sem lançamentos extras.
- Banco atual da Loja SJP continua sem registro de importação até o fluxo transacional ser implementado e homologado.
- Testar em ambiente de homologação; não publicar/mesclar antes de confirmar migration, RLS, testes de negativo, CI e fluxo real de reabertura.

**Status:** backend de persistência implementado na PR e testado com SQL descartável; a nova RPC ainda **não está aplicada** e o commit financeiro **não está implantado nem autorizado para uso operacional**.


## Continuidade técnica — 01/11/2026
- A branch da PR #5 valida o conteúdo do par de relatórios antes do primeiro upload, sem modificar política RLS nem migration previamente aplicada na homologação.
- Código da interface continua sem invocar o arquivamento; não existe persistência financeira/CMV/DRE nesta entrega.
- Parser e verificação de SHA-256 existem no backend; runtime Deno e SQL têm testes automatizados. Seguem pendentes homologação HTTP autenticada de XLSX e teste de concorrência/persistência real antes de ativar commit.


## Entrega adicional — backend seguro, sem ativar gravação
- **GitHub PR #5:** `supabase/functions/_shared/parseMonthlyReports.ts`, `supabase/functions/validate-monthly-reports/index.ts`, `supabase/functions/commit-monthly-reports/index.ts`, migration `20261101210000_add_atomic_monthly_import_rpc.sql` e testes SQL com `ROLLBACK`.
- **Homologação:** SOMENTE `validate-monthly-reports` (sem escrita) implantada com `verify_jwt=true`; smoke HTTP confirma POST anônimo 401 e preflight CORS 204; runtime Deno interpreta os dois fixtures XLSX com totais originais.
- **Banco:** dry-run de função SQL passou com autorização por loja, recusa de operador, atualização de competência, idempotência, rollback induzido, divergência e metadados SHA inválidos. Transação revertida: competência 2026-09 permanece DRAFT, zero imports/linhas/arquivos.
- **Não ativado:** migration da RPC `commit_monthly_import_v1` e Edge `commit-monthly-reports`. Não fazer deploy delas nem ligar UI até teste com identidade autorizada e XLSX binários reais. O arquivamento client-side suporta retry somente se download confirmar SHA-256 idêntico, sem UPDATE/DELETE.
- **Próxima validação necessária:** upload/download original usando credenciais de uma conta de teste autorizada, teste HTTP autenticado do parser, RLS cruzado e E2E de commit em competência de teste; então testar concorrência e habilitar controle da interface.

## Homologação com a sessão OWNER existente (sem contas ou segredos adicionais)
- Decisão do usuário: não criar usuário de teste nem contratar licença neste momento; manter o login OWNER atual.
- Implementado em PR #5: `src/services/archiveValidation.ts` e `src/components/ArchivedReportHomologation.tsx`, integrado à seção 02 de `src/App.tsx`. Uso opt-in, **desabilitado por padrão** pela variável pública de build `VITE_ENABLE_ARCHIVE_HOMOLOGATION`; só aparece quando a variável vale `true`.
- A ação exige competência já cadastrada em DRAFT, dois XLSX selecionados, pré-validação local conciliada e confirmação explícita do operador; faz upload `upsert:false` dos arquivos originais e chama **apenas** a Edge `validate-monthly-reports` com o JWT da sessão web; valida retorno do backend, totais, contagens e SHA-256. **Não chama a Edge de commit financeiro**, não usa service_role nem senha no navegador.
- O usuário é advertido que o Storage terá os arquivos originais persistidos, mesmo que o backend rejeite a validação; falha não é declarada importação concluída.
- Testes Vitest cobrem ausência de conciliação, erro de Edge, divergência entre totais e SHA-256 divergente; continuam válidos smoke HTTP 401/CORS e parser Deno sobre fixtures.
- Removidos os scripts/job GitHub Actions de `DRE_E2E_PASSWORD` porque não serão usadas credenciais de conta de teste.
- **A homologação positiva em navegador ainda não aconteceu:** o painel está apenas na branch PR #5; o Cloudflare publicado usa `main`. Para habilitar o painel, executar **deploy controlado de uma versão QA** com `VITE_ENABLE_ARCHIVE_HOMOLOGATION=true` para a origem autorizada; não mesclar a PR nem executar a migration da RPC de escrita antes dos testes finais. O conector GitHub/Supabase não publica Worker Cloudflare nesta sessão.
- Teste manual quando versão QA estiver disponível: 1) login atual no aplicativo, selecionar Loja SJP e setembro/2026; 2) escolher os XLSX, clicar *Validar arquivos sem gravar*; 3) marcar confirmação e clicar *Arquivar e validar no servidor (sem importar)*; 4) verificar `VALIDATED_NOT_IMPORTED`, 122/9 linhas, R$ 24.944,63 e zero diferença; 5) consultar banco para verificar ainda zero importações financeiras. O Storage deverá conter dois objetos privados.
- **Pendente antes da importação financeira:** teste HTTP autenticado OWNER, integridade de Storage binário, concorrência/idempotência com requisições reais e deployment controlado da RPC/Edge de escrita em ambiente apropriado.


## Prévia separada no Cloudflare (sem mexer em `main`)
- Código implantado no Supabase: `validate-monthly-reports` v2, ainda somente leitura financeira. CORS por origem permite `https://dre-mais1-homologacao.corsys1.workers.dev` e URLs de Preview `https://<preview>-dre-mais1-homologacao.corsys1.workers.dev`; não permite outros Workers ou domínios. Smoke HTTP contra Edge real: 401 sem JWT, preflight origem de QA 204, origem externa sem Access-Control-Allow-Origin.
- A documentação oficial da Cloudflare (https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/ e https://developers.cloudflare.com/workers/previews/) descreve Preview Builds em branch separada e URLs isoladas, inclusive em plano gratuito, sujeitas à configuração existente do Worker.
- Configuração operacional dependente do painel da conta Cloudflare: **Workers & Pages → dre-mais1-homologacao → Settings → Builds**; confirmar se o GitHub `MichaelDeCarvalho/DRE-Mais1` já está conectado e se os Preview Builds estão habilitados. Não trocar o branch principal (`main`) nem promover a PR.
- Para Preview, configurar no **ambiente de build da prévia** as variáveis públicas já usadas na aplicação `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e o sinalizador `VITE_ENABLE_ARCHIVE_HOMOLOGATION=true`; nunca inserir `service_role` em variáveis VITE. Build: `npm run build`; Preview usa comando próprio do Workers Previews conforme versão Wrangler e configurações da plataforma. O CI já validou o build com esse sinalizador.
- Nenhum conector Cloudflare autorizado está disponível neste chat. Se o worker não tiver integração GitHub, não configurar automaticamente novas permissões ou promoção de production sem revisar as opções no painel.
- Assim que existir URL de Preview do Worker, login com OWNER existente, selecionar SJP/2026-09, executar prévia, marcar confirmação e testar **apenas** armazenamento + validação. Nenhuma conta extra, senha em chat, licença paga ou alteração na `main` é necessária para o código dessa etapa.

## Cloudflare — configuração visual confirmada 01/11/2026

- Captura enviada pelo operador: **Git repository** `MichaelDeCarvalho/DRE-Mais1` conectado; **Production branch** `main`; Builds habilitados; produção com **Build command** `npm run build`, **Deployment Command** `npx wrangler deploy`. Não alterar essas configurações.
- Documentação Cloudflare 2026: `Settings → Builds → Preview Base` tem configurações independentes, e Preview de branch usa **`npx wrangler preview`**, NÃO `npx wrangler deploy`. Para Worker legado que mostre `Set up Worker Previews`, a migração de previews é irreversível e exige verificar primeiro as bindings; não clicar automaticamente.
- PR #5 acrescentou `wrangler.jsonc` com `"previews": {}` e script **`npm run build:preview`**, que ativa `VITE_ENABLE_ARCHIVE_HOMOLOGATION=true` exclusivamente no build da prévia. O CI roda também esse script; `npm run build` normal continua sem o painel.
- Na tela **Preview Base**, confirmar **Preview builds** habilitados e, caso disponível, configurar **Build command:** `npm run build:preview` e **Preview command:** `npx wrangler preview`; não editar campo Production. A Cloudflare exige Wrangler 4.135.0+ para Worker Previews; se `Preview Base` mostrar modelo antigo ou comando diferente, revisar antes de salvar.
- Verificar as duas variáveis públicas de BUILD da preview: `VITE_SUPABASE_URL` (URL do projeto homologação) e `VITE_SUPABASE_ANON_KEY` (chave pública/anon), nunca uma service key. Previews não herdam necessariamente variáveis/segredos de produção; não inventar valores.
- A sessão do login no domínio de produção não é transferida automaticamente ao domínio Preview: **entrar novamente usando a mesma conta existente**, sem criar usuário ou pagar licença. O endpoint Edge v2 aceita a origem Preview do Worker e requer JWT/RLS.
- A URL de Preview só será conhecida após o deployment; nunca inferir endereço inexistente. A interface atual de produção não será alterada até merge deliberado da PR.
- Estado de execução ao escrever: PR em DRAFT; sem conexão Cloudflare de escrita neste chat; a aba Preview Base ainda precisa ser inspecionada pelo operador para evitar alterar configuração de produção.
