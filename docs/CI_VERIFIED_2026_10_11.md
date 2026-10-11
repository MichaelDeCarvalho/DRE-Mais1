# Evidencia de CI — 11/10/2026 — Marco 1

## Commit compilado e aprovado

- Commit: `5ab7f68e0a17285c49a382cee2c8240e1bdc6061`
- Workflow GitHub Actions: [38113251969](https://github.com/MichaelDeCarvalho/DRE-Mais1/actions/runs/38113251969)
- Resultado geral: **SUCCESS**, jobs Linux e Windows concluídos com sucesso.
- `npm test` e `npm run build`: aprovados em ambos os sistemas.
- `cargo test --manifest-path src-tauri/Cargo.toml`: **25 testes aprovados em cada sistema**.
- Verificações Python/SQLite portáveis: aprovadas nos dois sistemas.
- `npm run tauri -- build --no-bundle --ci`: aprovado nos dois sistemas.
- Artefato Windows: [executável não homologado na GUI](https://github.com/MichaelDeCarvalho/DRE-Mais1/actions/runs/38113251969/artifacts/11693050659), retido até 18/10/2026.

## Correções que permitiram passar

- `2bfe680`: expectativa do teste Rust com fixture sintética divergente ajustada para -100 centavos; consulta persistida da divergência validada.
- `5ab7f68`: CI passou a executar os dois verificadores Python portáveis. As fixtures XLSX continuam exercitadas pelos testes Rust; `artifact_tool` não está disponível no runner.

## Pendências (NÃO HOMOLOGADAS)

1. Abrir a aplicação num Windows interativo real, com WebView2 e permissões de usuário comum.
2. Carregar o catálogo de referência e os dois relatórios de setembro com um banco de teste limpo; observar 135 códigos válidos, 14 linhas de cadastro inválidas, 120 vendidos, 29 pendentes, R$ 24.944,63 dos dois lados e diferença zero.
3. Fechar/reabrir aplicação, consultar período salvo, tentar importar duplicidade, validar período divergente e estrutura inválida.
4. Testar com os arquivos de origem reais **fora do repositório**, sem enviar planilhas operacionais para o CI.
5. Versionar `package-lock.json` e `src-tauri/Cargo.lock`, gerados como artefatos no CI, para fixar versões de dependências. Em seguida alterar o CI para `npm ci` e `cargo test --locked`.
6. Testes de robustez visual/acessibilidade no Windows.

## Próximo diagnóstico

- Commit `6a08cc2` adiciona `tools/smoke_windows.ps1` ao workflow como etapa **não bloqueante** em runner Windows.
- Este teste procura apenas um processo que permaneça aberto durante oito segundos. Ele **não prova** abertura visual, conteúdo correto, persistência nem importação.
- Não considerar a etapa de smoke uma validação de produção mesmo que passe.

**Marco 1:** compilação/testes aprovados; **homologação funcional desktop pendente**.
