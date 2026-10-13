# Homologação isolada — insumos, fichas técnicas, CMV e prévia gerencial

**Não homologado no Windows até execução manual por operador.**

## Por que um aplicativo separado
O executável de homologação usa `identifier=br.com.dremais1.homologacao`; o principal usa `br.com.dremais1.desktop`. O caminho de dados local previsto é `%APPDATA%\br.com.dremais1.homologacao\dre-mais1.sqlite`. A execução de homologação deve manter o SQLite da loja intacto. O executável não é instalador nem é assinado.

## Preparação após CI SUCCESS
1. Encerrar ambos os aplicativos.
2. Manter o backup atualizado original dos 120 produtos em local seguro, **sem renomear nem substituir**.
3. No Explorer ativar **Exibir > Extensões de nomes de arquivo**.
4. Criar diretório `%APPDATA%\br.com.dremais1.homologacao` se não existir.
5. Se já houver `dre-mais1.sqlite` de homologação, fazer outra cópia antes de alterar.
6. **Copiar**, nunca mover, o backup dos 120 produtos para esse diretório como `dre-mais1.sqlite` (uma extensão; sem .sqlite.sqlite).
7. Executar apenas o artefato **dre-mais1-windows-homologacao-isolada** da execução CI aprovada. Confirmar título `HOMOLOGACAO (banco separado)` antes de cadastrar algo. Se o título não corresponder, fechar e parar.

## Verificações com cópia isolada
- Selecionar competência `2026-09`, consultar importação salva: R$ 24.944,63 em vendas e pagamentos, diferença R$0,00, 120 vendidos/120 mapeados/0 pendentes.
- Consultar custos antes de cadastrar insumos: produtos sem ficha técnica não podem mostrar CMV zero nem DRE final.
- Cadastrar **apenas no banco isolado** um insumo de teste, G/ML/UN, quantidade básica e custo inteiro em centavos, frete e ST. Conferir soma e persistência.
- Para um código vendido e mapeado conhecido, cadastrar uma ficha de teste. Conferir custo proporcional, duplicidade bloqueada e custo da competência.
- Aprovar ficha usando justificativa explícita `TESTE - HOMOLOGACAO`. Alteração posterior da quantidade da linha deve ser bloqueada.
- Cadastrar preço de venda de teste e conferir percentual **provisório** quando receita estiver incompleta.
- Cadastrar uma despesa fixa de teste em centavos, tipo `FIXA`, documento `TESTE-HOMOLOGACAO`. Conferir o lançamento na competência e a prévia, sem criar lucro/resultado final.
- Fechar/reabrir homologação, repetir consultas e conferir persistência.
- Verificar separadamente que o aplicativo **principal** permanece com banco original não migrado. Não abrir executável antigo sobre a base migrada de homologação.

## O que ainda exige validação do operador
- Conferência de **todas** as quantidades das fichas técnicas e preços reais; não automatizar confirmação.
- A planilha original de setembro apresenta células de período apontando para agosto; revisar competência das despesas em vez de importá-las automaticamente.
- Definir origem de taxas de cartões, royalties e apuração efetiva/estimada do Simples Nacional; não adotar alíquota fixa sem confirmação.
- Só produzir resultado gerencial quando CMV e despesas de competência estiverem conciliados e classificados.

## Regressões obrigatórias
- `cargo test` (inclui persistência/migração e verificadores sintéticos).
- `npm test`, `npm run build`.
- `tauri build --no-bundle --ci --config src-tauri/tauri.homologacao.conf.json` no Windows.
- Banco SQLite principal nunca deve ser aberto pelo aplicativo de homologação.

Referência técnica: https://tauri.app/reference/cli/ (opção `--config` para construir flavors de aplicação).
