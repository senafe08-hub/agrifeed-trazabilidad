# Flujo Lógico de Reprocesos y Reutilización de Inventario

Este documento describe la arquitectura y el flujo lógico de datos para la gestión de Reprocesos de Producto Terminado (PT) en la aplicación Agrifeed Trazabilidad. Fue diseñado para garantizar la integridad del inventario y evitar el doble consumo de materias primas al reciclar alimento.

## 1. Concepto Central
Un **Reproceso** ocurre cuando bultos de una OP ya finalizada presentan algún problema (ej. empaque roto, caducidad, mala mezcla) y deben ser dados de baja del inventario disponible para ser reprocesados (reciclados) en futuras órdenes de producción.

El sistema maneja esto en **dos fases**:
1. **Fase de Baja (Módulo Inventario PT):** Se retiran los bultos del saldo de la OP.
2. **Fase de Reciclaje (Módulo Producción):** Se integran esos bultos a una nueva OP sin afectar la fórmula de consumo.

---

## 2. Fase 1: Baja del Inventario (Inventario PT)

**Archivo principal:** `src/hooks/useInventarioPT.ts` / `src/components/InventarioPTPanel.tsx`

### Lógica de UI
- Al hacer clic en "Registrar Reproceso", el sistema carga todas las OPs recientes de ese grupo que tengan **saldo disponible > 0**.
- **Regla Estricta:** Es obligatorio seleccionar una OP específica de origen.
- El sistema restringe el input de "Cantidad" al saldo físico real de esa OP (calculado mediante `getSaldoDisponiblePorOP`).

### Lógica de Base de Datos
- **Almacenamiento:** Se inserta un registro en la tabla `reprocesos_pt`.
- **Formato del Motivo:** El sistema estandariza el motivo forzando el formato: `OP {LOTE} - {Motivo del Usuario}`. Esto es vital para la trazabilidad inversa.
- **Descuento de Inventario:** En el archivo `src/lib/api/ventas.ts`, la función `getSaldoDisponiblePorOP` intercepta estos reprocesos buscando el patrón `motivo ILIKE '%OP {lote}%'`.
- **Ecuación del Saldo:** `Saldo OP = Total Producido - Total Despachado - Total Prestado - Total Reprocesado`.

---

## 3. Fase 2: Reciclaje en Nueva Producción (Módulo Producción)

**Archivo principal:** `src/hooks/useProduccion.ts` / `src/components/ProduccionPanel.tsx`

Cuando el área de producción decide volver a procesar estos bultos para crear un producto final, se debe registrar en el formulario de "Entregar Producción".

### Lógica de UI
- El formulario de entrega cuenta con un apartado "Añadir Reproceso a la Mezcla".
- El operario declara el **Total de Bultos Entregados** (físicos, finales) y, opcionalmente, cuántos de esos bultos son **Bultos de Reproceso**.

### Lógica de Base de Datos (Tabla `produccion`)
Para soportar esto, la tabla `produccion` cuenta con dos columnas adicionales:
- `bultos_reproceso` (int): Cantidad de bultos reciclados que ingresaron en esta OP.
- `op_reproceso_origen` (text): De dónde vinieron esos bultos (documentación opcional/manual).

### El Motor de Fórmulas (Kardex MP)
**Regla de Oro:** Los bultos de reproceso ya descontaron materia prima cuando se crearon en su OP original. Si se vuelven a mezclar, no deben volver a descontar materia prima.

El sistema calcula la "Producción Neta" que requiere materias primas nuevas:
`Bultos para Fórmula = bultos_entregados - bultos_reproceso`

De esta forma:
1. El inventario de Producto Terminado suma el 100% de los `bultos_entregados` a la nueva OP.
2. El inventario de Materias Primas solo descuenta lo correspondiente a `Bultos para Fórmula`.

---

## 4. Archivos Clave Involucrados

1. **`src/hooks/useInventarioPT.ts`:** Contiene `openReprocesoModal()` que ahora calcula saldos reales, y `handleReproceso()` que fuerza el prefijo "OP Lote" en el motivo.
2. **`src/components/InventarioPTPanel.tsx`:** UI interactiva que bloquea cantidades mayores al inventario y obliga la selección de OP.
3. **`src/lib/api/ventas.ts`:** 
   - `getSaldoDisponiblePorOP()`: Actualizado para restar reprocesos.
   - `getOpsDisponibles()`: Función modularizada para alimentar los selects tanto de Préstamos como de Reprocesos.
4. **`src/components/ProduccionPanel.tsx`:** Formulario de entrega expandido.
5. **`src/hooks/useProduccion.ts`:** Envía `bultos_reproceso` a Supabase al entregar.
