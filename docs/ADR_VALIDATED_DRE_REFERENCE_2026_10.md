# ADR — DRE de setembro confirmada como referência documental

- **Estado:** implementado como referência imutável; lançamento operacional em etapas posteriores
- **Período de origem:** setembro de 2026
- **Decisão confirmada pelo operador:** valores e lançamentos que efetivamente constam da planilha DRE de setembro estão corretos e validados. Não exigir reconfirmação genérica dos valores informados.

## Decisão

A aplicação pode cadastrar os valores efetivamente presentes na aba **DRE MENSAL** como espelho da planilha validada, mantendo célula, rótulo, valor bruto armazenado, valor em centavos para exibição, hash SHA-256 e bytes originais no SQLite da instalação escolhida. O total de receita só é aceito quando coincide com o par de relatórios de vendas/pagamentos conciliado na mesma competência.

A exibição destacada de receita, descontos, despesas, tributos, royalties, folha e resultado usa diretamente as células de origem, não fórmulas recriadas. A informação fornecida pelo responsável é suficiente para registrar esses **valores de referência**.

## Restrições contábeis e prevenção de duplicidade

- Os valores registrados na tabela documental não são lançados de novo em `managerial_expenses`, nem somados a valores já conciliados de vendas.
- As linhas de subtotal, composição e resultado coexistem como apresentação, não como débitos independentes.
- Campo vazio não vira zero; valor numérico zero e célula vazia continuam distintos.
- O resultado informado pela planilha é apresentado como **resultado informado**, não como lucro calculado independentemente pelo motor Rust.
- Registros operacionais futuros (despesa analítica, estoque, CMV por receita, impostos por competência) devem referenciar sua origem de forma única e declarar a política de não duplicação antes da migração.
- As eventuais diferenças entre rótulo interno de mês e competência conciliada são preservadas com o arquivo, sem reescrever valores conferidos pelo operador.
- Dados reais e planilhas privadas nunca entram no repositório, logs de CI ou fixtures; testes usam somente fontes sintéticas.

## Validação exigida

Após CI Windows/Linux, homologar na instalação `br.com.dremais1.referencia` isolada, com backup e relatórios de vendas de referência conciliados; revisar o conjunto de rubricas exibido, incluindo o valor do resultado informado, e verificar persistência após reabrir. Não instalar sobre o banco principal.

## Escopo fora desta decisão

Transcrever automaticamente a totalidade dos detalhes em despesas pagas, estoque e receitas aprovadas. A planilha validada é fonte histórica autoritativa; os módulos de apuração do aplicativo têm semântica própria e não devem sobrepor nem duplicar os valores dela silenciosamente.
