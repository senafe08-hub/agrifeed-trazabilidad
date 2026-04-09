import React, { useState, useEffect } from 'react';
import { fetchMaestros } from '../lib/supabase';

interface HeaderFormProps {
  formData: any;
  onChange: (data: any) => void;
}

const DespachoHeaderForm: React.FC<HeaderFormProps> = ({ formData, onChange }) => {

  const [maestros, setMaestros] = useState<{ granjas: any[]; vehiculos: any[]; clientes: any[] }>({
    granjas: [], vehiculos: [], clientes: []
  });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchMaestros();
        setMaestros({
          granjas: data.granjas || [],
          vehiculos: data.vehiculos || [],
          clientes: data.clientes || [],
        });
      } catch (e) {
        console.error('Error loading maestros', e);
      }
    };
    load();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    onChange({ ...formData, [name]: value });
  };

  // Check if we need granja
  const selectedCliente = maestros.clientes.find((c: any) => String(c.codigo_sap) === String(formData.cliente_id));
  const requiresGranja = selectedCliente?.nombre?.toUpperCase().includes('PUROPOLLO');

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Encabezado del Despacho ({formData.estado})</h3>
      </div>
      <div className="card-body">
        <div className="grid-4 gap-4" style={{ alignItems: 'end' }}>
          <div className="form-group">
            <label className="form-label">Remisión *</label>
            <input type="text" name="remision" className="form-input" value={formData.remision || ''} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha *</label>
            <input type="date" name="fecha" className="form-input" value={formData.fecha || ''} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label className="form-label">Hora *</label>
            <input type="time" name="hora" className="form-input" value={formData.hora || ''} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label className="form-label">Cliente *</label>
            <select name="cliente_id" className="form-select" value={formData.cliente_id || ''} onChange={handleChange} required>
              <option value="">Seleccionar cliente...</option>
              {maestros.clientes.map((c: any) => (
                <option key={c.codigo_sap} value={c.codigo_sap}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Vehículo</label>
            <select name="vehiculo_id" className="form-select" value={formData.vehiculo_id || ''} onChange={handleChange}>
              <option value="">Seleccionar placa...</option>
              {maestros.vehiculos.map((v: any) => (
                <option key={v.id} value={v.id}>{v.placa} - {v.conductor}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Conductor Fijo / Asignado</label>
            <input type="text" name="conductor" className="form-input" value={formData.conductor || ''} onChange={handleChange} placeholder="Opcional..." />
          </div>

          <div className="form-group">
            <label className="form-label">Entregado Por (Logística)</label>
            <input type="text" name="entregado_por" className="form-input" value={formData.entregado_por || ''} onChange={handleChange} placeholder="Nombre de quien despacha..." required />
          </div>

          <div className="form-group">
            <label className="form-label">Granja {requiresGranja ? '*' : ''}</label>
            <select name="granja_id" className="form-select" value={formData.granja_id || ''} onChange={handleChange} required={requiresGranja} disabled={!requiresGranja}>
              <option value="">Seleccionar granja...</option>
              {maestros.granjas.map((g: any) => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Estado</label>
            <select name="estado" className="form-select" value={formData.estado || 'borrador'} onChange={handleChange} required>
              <option value="borrador">Borrador</option>
              <option value="despachado">Despachado</option>
              <option value="anulado">Anulado</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: 'span 1' }}>
            <label className="form-label">Observaciones Generales</label>
            <input type="text" name="observaciones" className="form-input" value={formData.observaciones || ''} onChange={handleChange} placeholder="Opcional..." />
          </div>

        </div>
      </div>
    </div>
  );
};

export default DespachoHeaderForm;
