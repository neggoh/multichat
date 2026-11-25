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
  [int]$Threads = 8,
  [int]$Context = 8192,
  [switch]$Gpu,
  [int]$GpuLayers = 99,
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

# GPU: usa CUDA quando houver NVIDIA; sem ela, cai para CPU.
$hasNvidia = $false
try {
  $smi = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null
  if ($LASTEXITCODE -eq 0 -and $smi) {
    $hasNvidia = $true
    Write-Host ("GPU detectada: " + ($smi | Select-Object -First 1)) -ForegroundColor Green
  }
} catch {
  $hasNvidia = $false
}

$useGpu = $Gpu -or $hasNvidia
$folder = if ($useGpu -and $hasNvidia) { 'llama-cuda' } else { 'llama' }
$server = Join-Path $Root (Join-Path $folder 'llama-server.exe')
$modelPath = Join-Path $Root ("{0}.gguf" -f $Model)

if ($Gpu -and -not $hasNvidia) {
  Write-Host 'Você pediu -Gpu, mas nenhuma NVIDIA foi encontrada. Seguindo em CPU.' -ForegroundColor Yellow
}

if (-not (Test-Path $server)) {
  Write-Host ("Baixando o llama.cpp ({0})..." -f $folder) -ForegroundColor Cyan
  $release = Invoke-RestMethod 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10'
  $pattern = if ($folder -eq 'llama-cuda') { '*bin-win-cuda-12.4-x64.zip' } else { '*bin-win-cpu-x64.zip' }
  $asset = $null
  foreach ($item in $release) {
    $candidate = $item.assets | Where-Object { $_.name -like $pattern } | Select-Object -First 1
    if ($candidate) { $asset = $candidate; break }
  }
  if (-not $asset) { throw ("Não encontrei o pacote {0} nas releases do llama.cpp." -f $pattern) }
  $zip = Join-Path $Root 'llama.zip'
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath (Join-Path $Root $folder) -Force
  Remove-Item $zip -Force

  if ($folder -eq 'llama-cuda') {
    $cudart = $null
    foreach ($item in $release) {
      $candidate = $item.assets | Where-Object { $_.name -like 'cudart-llama-bin-win-cuda-12.4-x64.zip' } | Select-Object -First 1
      if ($candidate) { $cudart = $candidate; break }
    }
    if ($cudart) {
      Write-Host 'Baixando as bibliotecas CUDA...' -ForegroundColor Cyan
      $cudartZip = Join-Path $Root 'cudart.zip'
      Invoke-WebRequest -Uri $cudart.browser_download_url -OutFile $cudartZip -UseBasicParsing
      Expand-Archive -Path $cudartZip -DestinationPath (Join-Path $Root $folder) -Force
      Remove-Item $cudartZip -Force
    }
  }
}

if (-not (Test-Path $modelPath)) {
  Write-Host ("Baixando o modelo {0} ({1})..." -f $Model, $models[$Model].Size) -ForegroundColor Cyan
  Invoke-WebRequest -Uri $models[$Model].Url -OutFile $modelPath -UseBasicParsing
}

Write-Host ("Iniciando em http://127.0.0.1:{0}/v1 — Ctrl+C encerra." -f $Port) -ForegroundColor Green
Write-Host 'No MultiChat: seletor do topo -> IA local -> Testar e usar.' -ForegroundColor DarkGray

$layers = if ($useGpu -and $hasNvidia) { $GpuLayers } else { 0 }
if ($layers -gt 0) {
  Write-Host ("Camadas na GPU: {0} (CUDA)" -f $layers) -ForegroundColor Green
} else {
  Write-Host 'Processando na CPU (sem GPU NVIDIA).' -ForegroundColor DarkGray
}

& $server -m $modelPath --host 127.0.0.1 --port $Port -c $Context -t $Threads -ngl $layers
