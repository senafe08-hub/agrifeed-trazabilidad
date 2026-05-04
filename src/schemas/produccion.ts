import { z } from 'zod';

export const produccionFormSchema = z.object({
  id: z.number().optional(),
  fecha_produccion: z.string().min(1, 'La fecha es requerida'),
  turno: z.enum(['Diurno', 'Nocturno']),
  lote: z.coerce.number().min(1, 'La OP/Lote es requerida'),
  baches_entregados: z.coerce.number().min(0.01, 'Los baches deben ser mayor a 0'),
  bultos_entregados: z.coerce.number().min(0, 'Los bultos no pueden ser negativos'),
  bultos_reproceso: z.coerce.number().min(0, 'Los bultos de reproceso no pueden ser negativos').optional().default(0),
  op_reproceso_origen: z.string().optional(),
  observaciones: z.string().optional()
}).superRefine((data, ctx) => {
  if (data.bultos_reproceso && data.bultos_reproceso > 0) {
    if (!data.op_reproceso_origen || data.op_reproceso_origen.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['op_reproceso_origen'],
        message: 'Debe seleccionar una OP de origen si ingresa bultos de reproceso',
      });
    }
  }
});

export type ProduccionFormValues = z.infer<typeof produccionFormSchema>;
