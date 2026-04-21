# Buscar Git (igual que en bump.ps1)
$gitPaths = @(
    "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe"
)
$gitExe = $null
foreach ($pattern in $gitPaths) {
    $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($found) { $gitExe = $found.FullName; break }
}
if (-not $gitExe) {
    $gitExe = (Get-Command git -ErrorAction SilentlyContinue).Source
}

if ($gitExe) {
    Write-Host "Limpiando la basura de la nube..." -ForegroundColor Yellow
    & $gitExe rm -r -f --cached .
    & $gitExe add .
    Write-Host "¡Limpieza completada! Ya puedes correr bump.ps1" -ForegroundColor Green
} else {
    Write-Host "No se encontró git." -ForegroundColor Red
}
