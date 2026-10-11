# SECURITY REGISTER — 2026-10-10

| ID | Severidade | Estado | Evidência/risco | Mitigação |
| --- | --- | --- | --- | --- |
| S-001 | Médio | Aberto | SQLite local não criptografado; fixtures com informações financeiras | manter dispositivo/repositório privado; futura política de backup/permissões |
| S-002 | Médio | Aberto | Comando Tauri recebe caminhos de arquivos; não valida grant de acesso ao diálogo; no desktop com UI comprometida pode ler arquivos locais indicados | limitar comandos à única ação e extensões, bloquear arquivos >20MiB; revisar controle de escopo/caminhos antes de comercializar |
| S-003 | Médio | Aberto | Sem assinatura do instalador, usuários e autenticação | fora do marco 1; bloqueador comercial |
| S-004 | Baixo | Mitigado em código | Corrompimento/duplicação de importações | transação, hash SHA-256, UNIQUE, foreign keys, failures explícitos; confirmação Rust pendente |
