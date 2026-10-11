# Diagnostico de inicializacao do binario Windows no GitHub Actions.
# Nao substitui homologacao visual em uma estacao Windows.
$ErrorActionPreference = 'Stop'
$exe = Join-Path (Get-Location) 'src-tauri/target/release/dre-mais1.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
  throw "Executavel nao encontrado: $exe"
}

$process = $null
try {
  Write-Output "Iniciando executavel compilado: $exe"
  $process = Start-Process -FilePath $exe -PassThru
  Start-Sleep -Seconds 8
  $process.Refresh()
  if ($process.HasExited) {
    throw "Aplicativo encerrou durante os primeiros 8 segundos. ExitCode=$($process.ExitCode)"
  }
  Write-Output "SMOKE_OK: processo Windows permaneceu ativo por 8 segundos (PID $($process.Id))."
  Write-Output "Este teste nao comprova janela visivel, SQLite persistido ou importacao real."
} finally {
  if ($null -ne $process) {
    $process.Refresh()
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
