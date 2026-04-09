import React, { useState, useEffect } from 'react';
import { fetchProgramacion, fetchDespachosAcumulados, fetchProduccionAcumulada } from '../lib/supabase';
import { Plus, Trash2 } from 'lucide-react';

interface DetalleRow {
  id?: number;
  op: string;
  alimento?: string;
  cliente_programado?: string;
  cantidad_entregada?: number;
  cantidad_despachada_acumulada?: number;
  cantidad_a_despachar?: number;
  bultos_danados?: number;
  observaciones?: string;
}

interface DetalleOPListProps {
  initialDetails?: DetalleRow[];
  onChange: (details: DetalleRow[]) => void;
}

const DetalleOPList: React.FC<DetalleOPListProps> = ({ initialDetails = [], onChange }) => {
  const [details, setDetails] = useState<DetalleRow[]>(initialDetails);
  const [programacion, setProgramacion] = useState<any[]>([]);
  const [acumulados, setAcumulados] = useState<Record<number, number>>({});
  const [produccionAcumulados, setProduccionAcumulados] = useState<Record<number, number>>({});

  // Load OP data and accumulated dispatch data once
  useEffect(() => {
    const load = async () => {
      try {
        const [progData, acumData, prodAcumData] = await Promise.all([
          fetchProgramacion(),
          fetchDespachosAcumulados(),
          fetchProduccionAcumulada(),
        ]);
        setProgramacion(progData);
        setAcumulados(acumData);
        setProduccionAcumulados(prodAcumData);
      } catch (e) {
        console.error('Error loading programacion', e);
        alert(`No se pudo cargar la información de OPs: ${(e as Error).message || JSON.stringify(e)}`);
      }
    };
    load();
  }, []);

  // Notify parent on any change
  useEffect(() => {
    onChange(details);
  }, [details, onChange]);

  const addRow = () => {
    setDetails(prev => [...prev, { op: '' }]);
  };

  const removeRow = (index: number) => {
    setDetails(prev => prev.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: keyof DetalleRow, value: any) => {
    setDetails(prev => {
      const newDetails = [...prev];
      const row: any = { ...newDetails[index] };
      row[field] = value;

      // Auto‑populate when OP changes
      if (field === 'op') {
        // Cast types just in case
        const prog = programacion.find(p => String(p.op) === String(value));
        if (prog) {
          const yaDespachadoTotal = acumulados[Number(value)] || 0;
          const producidoTotal = produccionAcumulados[Number(value)] || 0;
          row.alimento = prog.maestro_alimentos?.descripcion || '';
          row.cliente_programado = prog.maestro_clientes?.nombre || '';
          row.cantidad_entregada = producidoTotal;
          row.cantidad_despachada_acumulada = yaDespachadoTotal;
          row.cantidad_a_despachar = '';
        } else {
          row.alimento = '';
          row.cliente_programado = '';
          row.cantidad_entregada = 0;
          row.cantidad_despachada_acumulada = 0;
          row.cantidad_a_despachar = '';
        }
      }

      // Duplicate OP validation
      if (field === 'op') {
        const dup = newDetails.filter(r => r.op && r.op === row.op).length > 1;
        if (dup) {
          alert('No se pueden repetir OPs dentro del mismo despacho');
          row.op = '';
        }
      }

      // Quantity limit validation
      if (field === 'cantidad_a_despachar') {
        const max = (row.cantidad_entregada || 0) - (row.cantidad_despachada_acumulada || 0);
        if (value > max) {
          alert(`Cantidad a despachar (${value}) supera el saldo disponible (${max})`);
          row.cantidad_a_despachar = max;
        }
      }

      newDetails[index] = row;
      return newDetails;
    });
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header flex justify-between items-center">
        <h3 className="card-title">Detalle de OPs</h3>
        <button className="btn btn-outline btn-sm" onClick={addRow} title="Agregar línea">
          <Plus size={16} /> Agregar OP
        </button>
      </div>
      <div className="card-body" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '12px' }}>
        {details.map((row, idx) => (
          <div key={idx} className="grid-4" style={{ marginBottom: 12, gap: 8, alignItems: 'end' }}>
            {/* OP selector */}
            <div className="form-group">
              <label className="form-label">OP</label>
              <select
                className="form-select"
                value={row.op}
                onChange={e => handleChange(idx, 'op', e.target.value)}
                required
              >
                <option value="">Seleccionar OP...</option>
                {programacion.map(p => (
                  <option key={p.op} value={p.op}>
                    {p.op} - {p.maestro_alimentos?.descripcion || 'Sin Alimento'}
                  </option>
                ))}
              </select>
            </div>
            {/* Alimento (read‑only) */}
            <div className="form-group">
              <label className="form-label">Alimento</label>
              <input type="text" className="form-input" readOnly value={row.alimento || ''} />
            </div>
            {/* Cliente programado (read‑only) */}
            <div className="form-group">
              <label className="form-label">Cliente Programado</label>
              <input type="text" className="form-input" readOnly value={row.cliente_programado || ''} />
            </div>
            {/* Cantidad entregada (read‑only) */}
            <div className="form-group">
              <label className="form-label">Entregada</label>
              <input type="number" className="form-input" readOnly value={row.cantidad_entregada ?? ''} />
            </div>
            {/* Cantidad ya despachada (read‑only) */}
            <div className="form-group">
              <label className="form-label">Despachada</label>
              <input type="number" className="form-input" readOnly value={row.cantidad_despachada_acumulada ?? ''} />
            </div>
            {/* Cantidad a despachar */}
            <div className="form-group">
              <label className="form-label">A Despachar</label>
              <input
                type="number"
                className="form-input"
                value={row.cantidad_a_despachar ?? ''}
                min={0}
                onChange={e => handleChange(idx, 'cantidad_a_despachar', e.target.value === '' ? '' : Number(e.target.value))}
                required
              />
            </div>
            {/* Bultos dañados */}
            <div className="form-group">
              <label className="form-label">Dañados</label>
              <input
                type="number"
                className="form-input"
                value={row.bultos_danados ?? ''}
                min={0}
                onChange={e => handleChange(idx, 'bultos_danados', e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            {/* Observaciones */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Observaciones</label>
              <input
                type="text"
                className="form-input"
                value={row.observaciones || ''}
                onChange={e => handleChange(idx, 'observaciones', e.target.value)}
              />
            </div>
            {/* Remove button */}
            <div className="form-group" style={{ gridColumn: 'span 1' }}>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => removeRow(idx)}
                title="Eliminar línea"
                style={{ marginTop: '24px' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DetalleOPList;
