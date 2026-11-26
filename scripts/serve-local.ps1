# TagScanner 本機測試：建置靜態網站後啟動伺服器（預設允許區網連入）。
#   .\scripts\serve-local.ps1             建置並以 http://127.0.0.1:4173/ 啟動
#   .\scripts\serve-local.ps1 -Https      改用自簽 HTTPS，讓區網手機可以使用相機
#   .\scripts\serve-local.ps1 -NoBuild    略過建置，直接使用現有 out/
#   .\scripts\serve-local.ps1 -LocalOnly  只接受本機連線
param(
  [int]$Port = 4173,
  [switch]$Https,
  [switch]$NoBuild,
  [switch]$LocalOnly
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '找不到 Node.js，請先安裝。' }

# Keep the caller's directory and environment intact, including after Ctrl+C.
$savedEnv = @{ PAGES_BASE_PATH = $env:PAGES_BASE_PATH; NEXT_PUBLIC_BASE_PATH = $env:NEXT_PUBLIC_BASE_PATH }
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  if (-not (Test-Path node_modules)) {
    Write-Host '安裝依賴套件…'
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci 失敗' }
  }
  if (-not $NoBuild) {
    Write-Host '建置靜態網站…'
    # Local builds serve from the site root, not the GitHub Pages sub-path.
    $env:PAGES_BASE_PATH = $null
    $env:NEXT_PUBLIC_BASE_PATH = $null
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build 失敗' }
  }

  $serveArgs = @('scripts/serve-local.mjs', '--port', $Port, '--host', $(if ($LocalOnly) { '127.0.0.1' } else { '0.0.0.0' }))
  if ($Https) { $serveArgs += '--https' }
  node @serveArgs
}
finally {
  $env:PAGES_BASE_PATH = $savedEnv.PAGES_BASE_PATH
  $env:NEXT_PUBLIC_BASE_PATH = $savedEnv.NEXT_PUBLIC_BASE_PATH
  Pop-Location
}
