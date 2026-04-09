# Refinamiento del Módulo de Cumplimiento

Implementaremos tres mejoras clave en la ventana de Dashboard de Producción y Cumplimiento, basadas en la aprobación del usuario:
1. **Gráficos de Tendencia**: Una gráfica visual usando `recharts` mostrando la evolución día a día.
2. **Exportación a PDF**: Generación de reportes PDF usando `jspdf` y `jspdf-autotable`.
3. **Turno Perfecto**: Gamificación visual (ícono de trofeo) para los turnos que logren su meta de baches y bultos.

## User Review Required

> [!IMPORTANT]  
> Lee detalladamente los cambios propuestos abajo. ¿Estás de acuerdo con el plan técnico?

## Proposed Changes

### [MODIFY] src/pages/ProduccionPage.tsx (Nuevas Características)
- **Importaciones:**  Se importarán `jsPDF` y `autoTable` para la exportación y `BarChart`/`LineChart` desde `recharts` para la gráfica de tendencias del histórico de turnos.
- **Gráficos:** El arreglo de reportes filtrado por fechas también servirá como base de datos de origen del gráfico. 
- **Generación de PDF:**  Añadiremos una función `exportReportToPDF(report)` que extraerá todos los registros individuales (`data.filter`) de un turno y los colocará en una tabla PDF estructurada con el logotipo/título, métricas del turno y tabla de desglose.
- **Botón "Descargar PDF"**: Un nuevo botón visible en la vista de *Detalle del Reporte* que active la creación del PDF de ese reporte en específico.
- **Badge de Turno Perfecto**: Validaremos que `baches >= 108` y `bultos >= 5500`. Si ambas condiciones se cumplen, agregaremos un ícono dorado de copa (`Trophy`) junto a la metadata de ese reporte de turno.

## Open Questions

- ¿Te gustaría que el reporte PDF tenga un color en específico para el encabezado (ej. amarillo de Agrifeed o un simple gris oscuro corporativo)?
- Para la gráfica principal, ¿prefieres comparar métricas (Baches vs Bultos) o la tendencia de uno en particular a través del tiempo?

## Verification Plan

### Automated Tests
- Instalación exitosa de `jspdf` y `jspdf-autotable` vía NPM (`npm install jspdf jspdf-autotable`) - LISTO.

### Manual Verification
- Validar que aparezca un gráfico de tendencia visible cuando existan reportes filtrados.
- Comprobar la generación de PDF entrando a cualquier turno histórico (Vista Detalle) y presionando el botón "Descargar PDF". Confirmar formato de la tabla generada nativamente.
- Validando lógica de Gamificación logrando/fingiendo llegar al 100% de la meta en un turno de prueba para verificar que el trofeo aparece resaltado.
