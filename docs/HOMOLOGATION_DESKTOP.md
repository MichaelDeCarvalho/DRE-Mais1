# Homologação de compilação Tauri — Marco 1

Data de preparação: 2026-10-11. Fonte: `dre-mais1-marco1-v0.1.4`.

## Estado verificável nesta sessão

- `node -v`: 22.16.0; `npm -v`: 10.9.2 — **executados**.
- `python tools/preflight.py`: **bloqueado** (código de saída 2). Sem `cargo`, `rustc`, `rustup`, bibliotecas Linux WebKitGTK e dependências `node_modules`.
- `npm install --offline --no-audit --no-fund`: **falhou** (`ENOTCACHED` para `@tauri-apps/api`). Rede do container não resolve `registry.npmjs.org` nem `static.rust-lang.org`.
- `cargo test --manifest-path src-tauri/Cargo.toml`: **não iniciou** (cargo ausente, código 127).
- `npm test`: **não iniciou** (`vitest: not found`, código 127).
- `npm run build`: **falhou** por módulos/tipos não instalados (`react`, `vite`, `vitest` etc.); **não demonstra defeito do código TypeScript**.
- Validadores independentes `verify_fixtures.py`, `verify_legacy_catalog.py`, `verify_persistence_contract.py` e `verify_catalog_status_contract.py`: **35/35 PASS**. **Não executam Rust.**
- Workflow de Linux + Windows: configuração YAML/JSON/TOML validada localmente; **não foi executado em GitHub Actions**.
- Interface desktop, acessibilidade da janela, persistência via comandos Tauri e compilação nativa: **NÃO AVALIADAS**.

## Comandos para preparar estação Windows (ambiente de desenvolvimento, não produção)

De acordo com a [documentação oficial Tauri 2](https://v2.tauri.app/start/prerequisites/): instalar Microsoft C++ Build Tools (com a carga de trabalho *Desktop development with C++*), WebView2 Runtime quando ainda não estiver disponível, Rust com toolchain `stable-msvc` e Node.js LTS.

No PowerShell, dentro da pasta raiz do projeto:

```powershell
node --version
npm --version
rustc --version
cargo --version
python tools/preflight.py
npm install
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri -- build --no-bundle --ci
npm run tauri -- dev
```

`preflight.py` pode retornar `BLOQUEADO` antes de `npm install`, pois exige dependências já instaladas. Depois da instalação, deve retornar `PRONTO_PARA_COMPILAR` para os pré-requisitos aferíveis no ambiente.

## Linux (Debian/Ubuntu compatível)

Instalar os pacotes do guia oficial (consultar requisitos da distribuição), Rust/rustup e Node.js. Em seguida executar a sequência acima em shell, omitindo a etapa de WebView2 (específica de Windows).

**Atenção:** compilar com `--no-bundle` não instala nem executa a interface. Em host com sessão gráfica, `npm run tauri -- dev` é necessário para a homologação visual e funcional.

## CI em repositório privado

O arquivo `.github/workflows/verification.yml` contém jobs para `ubuntu-22.04` e `windows-2022` que instalam pré-requisitos e executam `npm test`, `npm run build`, `cargo test`, validadores SQLite e `npm run tauri -- build --no-bundle --ci`. A compilação usa o modo documentado pelo [CLI oficial do Tauri](https://v2.tauri.app/reference/cli/).

**Não executado:** este pacote não foi publicado num repositório e não existe registro de workflow run. Os relatórios e a Base DRE das fixtures são confidenciais. Publicar SOMENTE em repositório privado com acesso controlado.

A primeira execução online deverá gerar `package-lock.json` e `src-tauri/Cargo.lock`. Após aprovação, **versionar esses dois arquivos** e alterar o workflow para `npm ci` e `cargo test --locked`, para garantir reprodutibilidade.

## Cenários de aceitação desktop (executar em banco de teste isolado)

| Etapa | Ação | Aceite |
|---|---|---|
| A | Abrir janela e iniciar SQLite | Sem erro na interface nem no terminal; pasta de dados criada |
| B | Importar `tests/fixtures/base-dre-set-2026.xlsx` | 135 códigos válidos, 14 linhas pendentes |
| C | Selecionar período `2026-09` e importar duas fixtures originais | Produtos R$ 24.944,63; pagamentos R$ 24.944,63; diferença R$ 0,00 |
| D | Verificar métodos normalizados | Crédito R$ 11.373,49; Débito R$ 6.487,85; PIX R$ 5.009,59; demais conforme `docs/IMPORT_SPEC.md` |
| E | Verificar mapeamento | 120 códigos vendidos, 91 mapeados, 29 pendentes; pendências somam R$ 3.653,70 |
| F | Fechar e reabrir aplicativo | Consulta retorna dados persistidos e catálogo carregado |
| G | Reimportar os mesmos arquivos | Duplicidade bloqueada, sem duplicar registros |
| H | Selecionar 2026-08 para pagamentos de 2026-09 | Erro de período, sem importação parcial |
| I | Selecionar arquivo sem coluna obrigatória | Mensagem explícita, sem substituir ausência por zero |
| J | Conferir armazenamento | Banco/bytes originais no diretório privado da aplicação, sem upload remoto |

O **Marco 1** só pode ser homologado depois de A–J, testes Rust e build nativo concluídos e registrados. Não inferir PASS pela presença do workflow.
