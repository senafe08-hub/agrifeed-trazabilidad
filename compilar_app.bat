@echo off
chcp 65001 > nul
:: ============================================================
:: Agrifeed Trazabilidad — Lanzador de Compilación
:: ============================================================
:: Este script ejecuta el archivo release.ps1 saltando
:: las restricciones de ejecución de PowerShell que bloquean
:: hacer "doble clic" directamente.
:: ============================================================

echo ============================================================
echo   Iniciando Proceso de Compilacion de Agrifeed
echo ============================================================
echo.

:: Cambiar contexto al directorio donde está el .bat
cd /d "%~dp0"

:: Ejecutar el script de powershell que ya tienes actualizado
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\release.ps1

echo.
echo Presiona cualquier tecla para salir...
pause > nul
