import React, { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { useMaestrosStore } from '../store/maestrosStore';
import { DespachoFormValues } from '../schemas/despachos';

const DespachoHeaderForm: React.FC = () => {
  const { granjas, vehiculos, clientes, fetchData } = useMaestrosStore();
  const { register, watch, formState: { errors } } = useFormContext<DespachoFormValues>();

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Watch fields that determine UI logic
  const cliente_id = watch('cliente_id');
  const estado = watch('estado');

  // Check if we need granja
  const selectedCliente = clientes.find(c => String(c.codigo_sap) === String(cliente_id));
  const requiresGranja = selectedCliente?.nombre?.toUpperCase().includes('PUROPOLLO');

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Encabezado del Despacho ({estado || 'Borrador'})</h3>
      </div>
      <div className="card-body">
        <div className="grid-4 gap-4" style={{ alignItems: 'end' }}>
          <div className="form-group">
            <label className="form-label">Remisión *</label>
            <input type="text" className="form-input" {...register('remision')} />
            {errors.remision && <span className="text-error">{errors.remision.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Fecha *</label>
            <input type="date" className="form-input" {...register('fecha')} />
            {errors.fecha && <span className="text-error">{errors.fecha.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Hora *</label>
            <input type="time" className="form-input" {...register('hora')} />
            {errors.hora && <span className="text-error">{errors.hora.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Cliente *</label>
            <select className="form-select" {...register('cliente_id')}>
              <option value="">Seleccionar cliente...</option>
              {clientes.map(c => (
                <option key={c.codigo_sap} value={c.codigo_sap}>{c.nombre}</option>
              ))}
            </select>
            {errors.cliente_id && <span className="text-error">{errors.cliente_id.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Vehículo</label>
            <select className="form-select" {...register('vehiculo_id')}>
              <option value="">Seleccionar placa...</option>
              {vehiculos.map(v => (
                <option key={v.id} value={v.id}>{v.placa} - {v.conductor}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Conductor Fijo / Asignado</label>
            <input type="text" className="form-input" {...register('conductor')} placeholder="Opcional..." />
          </div>

          <div className="form-group">
            <label className="form-label">Entregado Por (Logística) *</label>
            <input type="text" className="form-input" {...register('entregado_por')} placeholder="Nombre de quien despacha..." />
            {errors.entregado_por && <span className="text-error">{errors.entregado_por.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Granja {requiresGranja ? '*' : ''}</label>
            <select className="form-select" {...register('granja_id')} disabled={!requiresGranja}>
              <option value="">Seleccionar granja...</option>
              {granjas.map(g => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Estado</label>
            <select className="form-select" {...register('estado')}>
              <option value="borrador">Borrador</option>
              <option value="despachado">Despachado</option>
              <option value="anulado">Anulado</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: 'span 1' }}>
            <label className="form-label">Observaciones Generales</label>
            <input type="text" className="form-input" {...register('observaciones')} placeholder="Opcional..." />
          </div>

        </div>
      </div>
    </div>
  );
};

export default DespachoHeaderForm;
