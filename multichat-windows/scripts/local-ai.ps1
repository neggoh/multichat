#Requires -Version 5.1
<#
  Sobe uma IA local compatível com OpenAI para o MultiChat, sem chave e sem cota.

  Baixa o llama.cpp (build de CPU) e um modelo GGUF pequeno, e inicia o servidor
  em http://127.0.0.1:8080/v1 — o mesmo endereço que o app usa por padrão.

  Uso:
    powershell -ExecutionPolicy Bypass -File scripts\local-ai.ps1
    powershell -ExecutionPolicy Bypass -File scripts\local-ai.ps1 -Model qwen2.5-3b
    powershell -ExecutionPolicy Bypass -File scripts\local-ai.ps1 -Port 8080 -Threads 4
#>
param(
  [string]$Model = 'qwen2.5-1.5b',
  [int]$Port = 8080,
  [int]$Threads = 4,
  [int]$Context = 4096,
  [string]$Root = (Join-Path $env:LOCALAPPDATA 'MultiChatLocalAI')
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()

$models = @{
  'qwen2.5-0.5b'       = @{ Url = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf'; Size = '0,4 GB' }
  'qwen2.5-1.5b'       = @{ Url = 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'; Size = '1,1 GB' }
  'qwen2.5-3b'         = @{ Url = 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf'; Size = '1,9 GB' }
  'qwen2.5-coder-1.5b' = @{ Url = 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf'; Size = '1,1 GB' }
  'qwen2.5-coder-3b'   = @{ Url = 'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf'; Size = '1,9 GB' }
  'qwen2.5-coder-7b'   = @{ Url = 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf'; Size = '4,7 GB' }
}

if (-not $models.ContainsKey($Model)) {
  Write-Host "Modelo desconhecido: $Model" -ForegroundColor Red
  Write-Host ("Disponíveis: " + ($models.Keys -join ', '))
  exit 1
}

New-Item -ItemType Directory -Force -Path $Root | Out-Null
$server = Join-Path $Root 'llama\llama-server.exe'
$modelPath = Join-Path $Root ("{0}.gguf" -f $Model)

if (-not (Test-Path $server)) {
  Write-Host 'Baixando o llama.cpp (build de CPU)...' -ForegroundColor Cyan
  $release = Invoke-RestMethod 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10'
  $asset = $null
  foreach ($item in $release) {
    $candidate = $item.assets | Where-Object { $_.name -like '*bin-win-cpu-x64.zip' } | Select-Object -First 1
    if ($candidate) { $asset = $candidate; break }
  }
  if (-not $asset) { throw 'Não encontrei o pacote win-cpu-x64 nas releases do llama.cpp.' }
  $zip = Join-Path $Root 'llama.zip'
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath (Join-Path $Root 'llama') -Force
  Remove-Item $zip -Force
}

if (-not (Test-Path $modelPath)) {
  Write-Host ("Baixando o modelo {0} ({1})..." -f $Model, $models[$Model].Size) -ForegroundColor Cyan
  Invoke-WebRequest -Uri $models[$Model].Url -OutFile $modelPath -UseBasicParsing
}

Write-Host ("Iniciando em http://127.0.0.1:{0}/v1 — Ctrl+C encerra." -f $Port) -ForegroundColor Green
Write-Host 'No MultiChat: seletor do topo -> IA local -> Testar e usar.' -ForegroundColor DarkGray

& $server -m $modelPath --host 127.0.0.1 --port $Port -c $Context -t $Threads
