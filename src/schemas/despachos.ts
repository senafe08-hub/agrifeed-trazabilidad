import { z } from 'zod';

export const despachoDetalleSchema = z.object({
  op: z.coerce.number().min(1, 'El número de OP es requerido'),
  cantidad_a_despachar: z.coerce.number().min(0.01, 'La cantidad debe ser mayor a 0'),
  observaciones: z.string().optional()
});

export const despachoFormSchema = z.object({
  id: z.number().optional(),
  remision: z.string().min(1, 'La remisión es requerida'),
  fecha: z.string().min(1, 'La fecha es requerida'),
  hora: z.string().min(1, 'La hora es requerida'),
  cliente_id: z.coerce.number().min(1, 'El cliente es requerido'),
  vehiculo_id: z.union([z.coerce.number(), z.literal('')]).optional(),
  conductor: z.string().optional(),
  entregado_por: z.string().min(1, 'La persona que entrega es requerida'),
  granja_id: z.union([z.coerce.number(), z.literal('')]).optional(),
  estado: z.enum(['borrador', 'despachado', 'anulado']).default('borrador'),
  observaciones: z.string().optional(),
  details: z.array(despachoDetalleSchema).min(1, 'Debe haber al menos un detalle de despacho')
});

export type DespachoFormValues = z.infer<typeof despachoFormSchema>;
