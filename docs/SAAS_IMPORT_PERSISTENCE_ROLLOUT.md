# DRE Mais1 SaaS — Gravação segura dos relatórios mensais (incremento seguinte)

## Evidência de partida (01/11/2026)
- Pré-validação web da Loja SJP, competência 2026-09, conferida em captura do operador: 122 linhas de produtos, 120 códigos, 9 métodos, receita líquida de R$ 24.944,63, pagamentos R$ 24.944,63 e divergência zero.
- Os relatórios ainda **não** constam nas tabelas `public.imports`, `public.import_product_rows` e `public.import_payment_rows`. A competência já existe no Supabase.
- A prévia no browser **não é** garantia de origem confiável. Todo payload do frontend precisa ser verificado no backend.

## Incremento preparado nesta branch
- Migration aditiva, ainda **NÃO aplicada**, criando bucket privado `dre-mais1-report-archives` para os bytes originais de ambos os XLSX.
- Política de upload: papel autenticado com acesso gerencial à mesma loja e competência `DRAFT`, caminho `store_uuid/period_uuid/PRODUCTS|PAYMENTS/sha256.xlsx`, limite 20 MiB, sem update/delete no fluxo comum.
- Política de leitura: membro autorizado da loja, por RLS.
- Gravação direta das linhas via Data API **continua bloqueada**.

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

**Status:** SQL de arquivamento preparado em PR. Importação persistente: não implementada, nem validada em banco. Nenhum arquivo financeiro de produção deve ser importado nesta fase.
