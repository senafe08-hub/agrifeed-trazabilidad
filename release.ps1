# ============================================================
# Agrifeed Trazabilidad — Script de Release Automático
# ============================================================
# Uso: .\release.ps1
# 
# Este script:
# 1. Lee la versión de tauri.conf.json
# 2. Inyecta la llave secreta para evitar bloqueos del signer
# 3. Compila la app silenciosamente (npm run tauri build -- --ci)
# 4. Copia el .exe y .sig a la carpeta releases\
# 5. Genera el archivo latest.json con codificación estricta UTF-8 
# ============================================================

$ErrorActionPreference = "Stop"

# ¡Obligar al terminal a moverse a la carpeta exacta del proyecto!
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Agrifeed Trazabilidad - Auto-Updater Build " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# --- 1. Leer versión actual ---
$confPath = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$version = $conf.version
Write-Host "[INFO] Version actual detectada: v$version" -ForegroundColor Cyan

# --- 2. Inyectar Llave Privada Oculta ---
$keyPath = Join-Path $PSScriptRoot "src-tauri\keys\agrifeed.key"
if (-not (Test-Path $keyPath)) {
    Write-Host "[ERROR] FATAL: Falta la llave secreta en $keyPath. Las actualizaciones viejas se corromperan." -ForegroundColor Red
    exit 1
}
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
Write-Host "[INFO] Llaves secretas inyectadas correctamente en memoria." -ForegroundColor Cyan

# --- 3. Build ---
Write-Host ""
Write-Host "[BUILD] Compilando la aplicacion y empaquetando firmas..." -ForegroundColor Yellow
Write-Host "        Esto tomara cerca de un minuto." -ForegroundColor DarkGray
Write-Host ""

npm run tauri build -- --ci

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] La compilacion fallo. Revisa los errores." -ForegroundColor Red
    exit 1
}

# --- 4. Ubicar los archivos generados ---
$bundleDir = Join-Path $PSScriptRoot "src-tauri\target\release\bundle\nsis"
$expectedName = "Agrifeed Trazabilidad_${version}_x64-setup.exe"
$installerExe = Get-ChildItem -Path $bundleDir -Filter $expectedName | Select-Object -First 1
$signatureFile = Get-ChildItem -Path $bundleDir -Filter "${expectedName}.sig" | Select-Object -First 1

if (-not $installerExe -or -not $signatureFile) {
    Write-Host "[ERROR] No se encontraron los archivos esperados (.exe o .sig) en el target." -ForegroundColor Red
    exit 1
}

# --- 5. Copiar a carpeta de releases ---
$releaseDir = Join-Path $PSScriptRoot "releases"
if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
}

$destExeName = "Agrifeed_v${version}.exe"
$destSigName = "Agrifeed_v${version}.exe.sig"
$destExePath = Join-Path $releaseDir $destExeName
$destSigPath = Join-Path $releaseDir $destSigName

Copy-Item $installerExe.FullName $destExePath -Force
Copy-Item $signatureFile.FullName $destSigPath -Force

# --- 6. Generar latest.json (UTF-8 sin BOM) ---
Write-Host "[JSON]  Construyendo archivo de actualizacion en la nube..." -ForegroundColor Yellow
$sigContent = Get-Content $destSigPath -Raw
$url = "https://github.com/senafe08-hub/agrifeed-trazabilidad/releases/download/v$version/$destExeName"

$json = @{
    version = $version
    notes = "Actualizacion a la version $version disparada por Script."
    pub_date = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = $sigContent.Trim()
            url = $url
        }
    }
}

$jsonString = $json | ConvertTo-Json -Depth 5
$jsonPath = Join-Path $releaseDir "latest.json"

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($jsonPath, $jsonString, $utf8NoBom)

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ¡Magia Completada! Todo esta listo   " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Revisa tu carpeta 'releases\'. Tienes los 3 archivos dorados:"
Write-Host "1. " -ForegroundColor Cyan
Write-Host "2. " -ForegroundColor Cyan
Write-Host "3. latest.json (En formato perfecto UTF-8)" -ForegroundColor Cyan
Write-Host ""
Write-Host "SIGUIENTES PASOS:" -ForegroundColor Yellow
Write-Host "1. Abre GitHub Desktop y dale 'Commit' y 'Push origin' a los cambios (muy importante)."
Write-Host "2. Ve a github.com y entra a los Releases de tu proyecto."
Write-Host "3. Crea un Release llamado v."
Write-Host "4. Arrastra los 3 archivos de la carpeta 'releases\' hacia la web y publica."
Write-Host ""
