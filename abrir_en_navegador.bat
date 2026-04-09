@echo off
chcp 65001 > nul
:: ============================================================
:: Agrifeed Trazabilidad — Lanzador Web Automático
:: ============================================================
:: Abrirá automáticamente tu navegador por defecto en la 
:: dirección correcta con la versión más reciente del código.
:: ============================================================

echo ============================================================
echo   Iniciando Agrifeed Trazabilidad en el Navegador...
echo ============================================================
echo.
echo IMPORTANTE:
echo Esta ventana procesa el sistema en tiempo real.
echo Si cierras esta ventana negra, Agrifeed dejara de funcionar 
echo en tu navegador. Puedes minimizarla tranquilamente.
echo.

:: Cambiar contexto al directorio donde está el .bat
cd /d "%~dp0"

:: Iniciar el modo de desarrollo de Vite y forzar la apertura del navegador
npm run dev -- --open
