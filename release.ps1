# ============================================================
# Agrifeed Trazabilidad — Script de Release
# ============================================================
# Uso: .\release.ps1
# 
# Este script:
# 1. Lee la versión actual de tauri.conf.json
# 2. Compila la app
# 3. Genera el instalador NSIS (.exe) para Windows
# 4. Copia el instalador a una carpeta de fácil acceso
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Agrifeed Trazabilidad - Build de Release  " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# --- 1. Leer versión actual ---
$confPath = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$version = $conf.version
Write-Host "[INFO] Version actual: v$version" -ForegroundColor Cyan

# --- 2. Build ---
Write-Host ""
Write-Host "[BUILD] Compilando la aplicacion..." -ForegroundColor Yellow
Write-Host "        Esto puede tardar varios minutos la primera vez." -ForegroundColor DarkGray
Write-Host ""

npm run tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] La compilacion fallo. Revisa los errores arriba." -ForegroundColor Red
    exit 1
}

# --- 3. Ubicar los archivos generados ---
$bundleDir = Join-Path $PSScriptRoot "src-tauri\target\release\bundle\nsis"
$installerExe = Get-ChildItem -Path $bundleDir -Filter "*-setup.exe" | Select-Object -First 1

if (-not $installerExe) {
    Write-Host "[ERROR] No se encontro el instalador .exe en: $bundleDir" -ForegroundColor Red
    exit 1
}

# --- 4. Copiar a carpeta de releases ---
$releaseDir = Join-Path $PSScriptRoot "releases"
if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
}

$destName = "Agrifeed_Trazabilidad_v${version}_Setup.exe"
$destPath = Join-Path $releaseDir $destName
Copy-Item $installerExe.FullName $destPath -Force

# Tamaño del instalador
$sizeMB = [math]::Round($installerExe.Length / 1MB, 2)

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Build completado exitosamente!            " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "[INSTALADOR]  $($installerExe.FullName)" -ForegroundColor Cyan
Write-Host "[COPIA]       $destPath" -ForegroundColor Cyan
Write-Host "[TAMANO]      $sizeMB MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "  Pasos siguientes:                        " -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Comparte el instalador con los usuarios:"
Write-Host "     $destPath" -ForegroundColor White
Write-Host ""
Write-Host "  2. El usuario solo debe hacer doble clic"
Write-Host "     en el .exe para instalar la app."
Write-Host ""
Write-Host "  3. Se creara un acceso directo en el"
Write-Host "     escritorio y menu inicio."
Write-Host ""
Write-Host "  Opciones para compartir:" -ForegroundColor Cyan
Write-Host "  - Google Drive"
Write-Host "  - OneDrive"  
Write-Host "  - Carpeta compartida en red"
Write-Host "  - Email (si el archivo es menor a 25MB)"
Write-Host ""
Write-Host "============================================" -ForegroundColor Yellow
Write-Host ""
