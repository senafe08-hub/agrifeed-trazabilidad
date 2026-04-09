-- Script para agregar la columna de "total_bultos" a la tabla reportes_turno
-- Instrucciones: Ejecuta esto en el SQL Editor de Supabase.

ALTER TABLE public.reportes_turno
ADD COLUMN IF NOT EXISTS total_bultos integer;

-- Opcional: Actualizar el comentario de la tabla para documentación interna
COMMENT ON COLUMN public.reportes_turno.total_bultos IS 'Suma de todos los bultos generados en la ventana de fecha/turno correspondiente.';
