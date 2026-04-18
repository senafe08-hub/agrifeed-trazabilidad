# ============================================================
# Agrifeed — Script de Release Rápido
# ============================================================
# Uso:    .\bump.ps1 0.2.9
#         .\bump.ps1 0.3.0
#         .\bump.ps1 1.0.0
#
# Esto hace TODO automáticamente:
#   1. Actualiza la versión en package.json
#   2. Actualiza la versión en tauri.conf.json
#   3. Hace commit de todo
#   4. Crea el tag v0.X.X
#   5. Hace push a GitHub (código + tag)
#   6. GitHub Actions compila y publica el .exe automáticamente
# ============================================================

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ── Buscar Git (viene con GitHub Desktop) ──
$gitPaths = @(
    "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe"
)
$gitExe = $null
foreach ($pattern in $gitPaths) {
    $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($found) { $gitExe = $found.FullName; break }
}
if (-not $gitExe) {
    # Fallback: try system PATH
    $gitExe = (Get-Command git -ErrorAction SilentlyContinue).Source
}
if (-not $gitExe) {
    Write-Host "[ERROR] No se encontro git. Instala Git o usa GitHub Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Git encontrado: $gitExe" -ForegroundColor Green

# ── Validar formato de versión ──
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "[ERROR] Formato invalido. Usa: X.Y.Z (ejemplo: 0.3.0)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Agrifeed Release v$Version" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Actualizar package.json ──
$pkgPath = Join-Path $PSScriptRoot "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$oldVersion = $pkg.version
$pkg.version = $Version
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$pkgJson = $pkg | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($pkgPath, $pkgJson, $utf8NoBom)
Write-Host "[1/5] package.json: $oldVersion -> $Version" -ForegroundColor Yellow

# ── 2. Actualizar tauri.conf.json ──
$tauriPath = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
$tauri = Get-Content $tauriPath -Raw | ConvertFrom-Json
$tauri.version = $Version
$tauriJson = $tauri | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($tauriPath, $tauriJson, $utf8NoBom)
Write-Host "[2/5] tauri.conf.json: $oldVersion -> $Version" -ForegroundColor Yellow

# ── 3. Commit ──
& $gitExe add -A
& $gitExe commit -m "release: v$Version"
Write-Host "[3/5] Commit creado" -ForegroundColor Yellow

# ── 4. Tag ──
& $gitExe tag "v$Version"
Write-Host "[4/5] Tag v$Version creado" -ForegroundColor Yellow

# ── 5. Push ──
& $gitExe push origin main
& $gitExe push origin "v$Version"
Write-Host "[5/5] Push completado" -ForegroundColor Yellow

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ¡Release v$Version enviado!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "GitHub Actions esta compilando tu .exe ahora mismo." -ForegroundColor Cyan
Write-Host "Revisa el progreso en:" -ForegroundColor Cyan
Write-Host "https://github.com/senafe08-hub/agrifeed-trazabilidad/actions" -ForegroundColor White
Write-Host ""
Write-Host "En ~5 minutos el release estara listo y los usuarios" -ForegroundColor Cyan
Write-Host "recibiran la actualizacion automaticamente." -ForegroundColor Cyan
Write-Host ""
