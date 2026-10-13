-- Valores confirmados pelo operador; vigência inicial de 09/2026; sem extrapolação retroativa.
INSERT OR IGNORE INTO financial_rules(rule_code,display_name,category,calculation_base) VALUES('ROYALTIES','Royalties da franquia','ROYALTIES','NET_REVENUE');
INSERT OR IGNORE INTO financial_rule_versions(rule_id,effective_from,basis_points,source,note) SELECT id,'2026-09',700,'Confirmação do operador','Taxa inicial confirmada para auditoria de setembro de 2026' FROM financial_rules WHERE rule_code='ROYALTIES';
INSERT OR IGNORE INTO financial_rules(rule_code,display_name,category,calculation_base) VALUES('CREDITO','Cartão de crédito','PAYMENT_FEE','PAYMENT_METHOD');
INSERT OR IGNORE INTO financial_rule_versions(rule_id,effective_from,basis_points,source,note) SELECT id,'2026-09',200,'Confirmação do operador','Taxa inicial confirmada para auditoria de setembro de 2026' FROM financial_rules WHERE rule_code='CREDITO';
INSERT OR IGNORE INTO financial_rules(rule_code,display_name,category,calculation_base) VALUES('DEBITO','Cartão de débito','PAYMENT_FEE','PAYMENT_METHOD');
INSERT OR IGNORE INTO financial_rule_versions(rule_id,effective_from,basis_points,source,note) SELECT id,'2026-09',100,'Confirmação do operador','Taxa inicial confirmada para auditoria de setembro de 2026' FROM financial_rules WHERE rule_code='DEBITO';
INSERT OR IGNORE INTO financial_rules(rule_code,display_name,category,calculation_base) VALUES('PIX','PIX','PAYMENT_FEE','PAYMENT_METHOD');
INSERT OR IGNORE INTO financial_rule_versions(rule_id,effective_from,basis_points,source,note) SELECT id,'2026-09',100,'Confirmação do operador','Taxa inicial confirmada para auditoria de setembro de 2026' FROM financial_rules WHERE rule_code='PIX';
INSERT OR IGNORE INTO financial_rules(rule_code,display_name,category,calculation_base) VALUES('CARTEIRA_DIGITAL','Carteira digital','PAYMENT_FEE','PAYMENT_METHOD');
INSERT OR IGNORE INTO financial_rule_versions(rule_id,effective_from,basis_points,source,note) SELECT id,'2026-09',300,'Confirmação do operador','Taxa inicial confirmada para auditoria de setembro de 2026' FROM financial_rules WHERE rule_code='CARTEIRA_DIGITAL';
INSERT OR IGNORE INTO financial_rules(rule_code,display_name,category,calculation_base) VALUES('PICPAY','PicPay','PAYMENT_FEE','PAYMENT_METHOD');
INSERT OR IGNORE INTO financial_rule_versions(rule_id,effective_from,basis_points,source,note) SELECT id,'2026-09',300,'Confirmação do operador','Taxa inicial confirmada para auditoria de setembro de 2026' FROM financial_rules WHERE rule_code='PICPAY';
INSERT OR IGNORE INTO financial_rules(rule_code,display_name,category,calculation_base) VALUES('VALE_REFEICAO','Vale-refeição','PAYMENT_FEE','PAYMENT_METHOD');
INSERT OR IGNORE INTO financial_rule_versions(rule_id,effective_from,basis_points,source,note) SELECT id,'2026-09',400,'Confirmação do operador','Taxa inicial confirmada para auditoria de setembro de 2026' FROM financial_rules WHERE rule_code='VALE_REFEICAO';
