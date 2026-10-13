# ADR — Parâmetros financeiros versionados
Data: 2026-10-13. Status: proposta técnica; implementação e homologação pendentes.
## Necessidade
Permitir alterar royalties, taxas de pagamentos, comissões de plataformas e outros percentuais sem editar código e sem modificar históricos.
## Estrutura proposta
- financial_rules: identificador, descrição, categoria financeira, base de cálculo, origem e política de cálculo.
- financial_rule_versions: regra, competência de início, alíquota em basis points, valor fixo opcional em centavos, justificativa e criação; versões históricas imutáveis.
- Tela Configurações > Parâmetros Financeiros: adicionar regra, nova vigência, histórico, simular e ativar. Proibir períodos sobrepostos.
- Valores documentais do iFood devem prevalecer sobre simulações; não duplicar despesas já lançadas manualmente.
- Royalties: 7% da receita após descontos incluindo iFood. Crédito 2%, débito 1%, PIX 1%, carteira 3%, PicPay 3%, vale-refeição 4%. Marketing local e perdas manuais, sem taxa automática.
- Não aplicar taxa de Voucher e Outro antigos sem classificar meio. Separar origem iFood do meio financeiro.
- Proteger fechamento histórico com snapshot de taxas utilizadas; não recalcular competência fechada.
## Evidência de setembro (extrato iFood)
1.334 linhas de competência 2026-09. Comissão entrega iFood 23%: -R$ 1.485,57; outra comissão 12%: -R$ 6,69; transação 3,2%: -R$ 208,45. Retenção entrega -R$ 1.468,37; promoção loja -R$ 1.432,19 e delivery -R$ 364,56; anúncios -R$ 673,77; mensalidade -R$ 150,00. Estornos, compensações e retenções impedem somatório ingênuo.
## Segurança e andamento
Dados reais ficam fora do GitHub; fixtures sintéticas em testes. Implementação exige migração transacional SQLite, testes e homologação isolada Windows. Não atualizar banco principal sem backup.