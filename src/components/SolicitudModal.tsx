import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { saveSolicitudesBatch } from '../lib/api/ventas';

interface DetalleRow {
  id_temp: number;
  codigo_sap: number | '';
  refText: string;
  casa_formuladora_id: number | '';
  cantidad: number | '';
  observaciones: string;
  propia: boolean;
  medicamentoText: string;
}

interface Props {
  initialData?: {
    fecha: string;
    cliente_id: number | '';
    detalles: any[];
  } | null;
  clientes: any[];
  alimentos: any[];
  casas: any[];
  materiasPrimas?: any[];
  onClose: () => void;
  onSaved: () => void;
}

export default function SolicitudModal({ initialData, clientes, alimentos, casas, materiasPrimas = [], onClose, onSaved }: Props) {
  const [fecha, setFecha] = useState(initialData?.fecha || new Date().toISOString().split('T')[0]);
  const [clienteId, setClienteId] = useState<number | ''>(initialData?.cliente_id || '');
  const [detalles, setDetalles] = useState<DetalleRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const [focusedMedRow, setFocusedMedRow] = useState<number | null>(null);

  useEffect(() => {
    if (initialData && initialData.detalles.length > 0) {
      setDetalles(initialData.detalles.map((d, i) => {
        let obs = d.observaciones || '';
        let propia = false;
        let medicamentoText = '';
        if (obs.startsWith('##{')) {
          const match = obs.match(/^##(\{.*?\})##/);
          if (match) {
            try {
              const meta = JSON.parse(match[1]);
              propia = !!meta.propia;
              medicamentoText = meta.med || '';
              obs = obs.substring(match[0].length).trim();
            } catch (e) {}
          }
        }
        return {
          id_temp: Date.now() + i,
          codigo_sap: d.codigo_sap,
          refText: d.maestro_alimentos?.descripcion || '',
          casa_formuladora_id: d.casa_formuladora_id,
          cantidad: d.cantidad,
          observaciones: obs,
          propia,
          medicamentoText
        };
      }));
    } else {
      setDetalles([{ id_temp: Date.now(), codigo_sap: '', refText: '', casa_formuladora_id: '', cantidad: '', observaciones: '', propia: false, medicamentoText: '' }]);
    }
  }, [initialData]);

  function addRow() {
    setDetalles([...detalles, { id_temp: Date.now(), codigo_sap: '', refText: '', casa_formuladora_id: '', cantidad: '', observaciones: '', propia: false, medicamentoText: '' }]);
  }

  function removeRow(id_temp: number) {
    if (detalles.length <= 1) return;
    setDetalles(detalles.filter(d => d.id_temp !== id_temp));
  }

  function updateRow(id_temp: number, field: keyof DetalleRow, value: any) {
    setDetalles(detalles.map(d => {
      if (d.id_temp !== id_temp) return d;
      
      const newRow = { ...d, [field]: value };
      
      // Auto-completar SAP si se cambia el texto de referencia
      if (field === 'refText') {
        const match = alimentos.find(a => a.descripcion === value);
        newRow.codigo_sap = match ? match.codigo_sap : '';
      }
      
      return newRow;
    }));
  }

  async function handleSave() {
    if (!fecha) return alert('Seleccione la fecha');
    if (!clienteId) return alert('Seleccione el cliente');

    const validDetalles = detalles.filter(d => d.codigo_sap && d.casa_formuladora_id && d.cantidad && Number(d.cantidad) > 0);
    
    if (validDetalles.length === 0) {
      return alert('Debe agregar al menos una referencia válida con cantidad mayor a 0 y casa formuladora.');
    }

    setSaving(true);
    try {
      const payload = validDetalles.map(d => {
        let finalObs = d.observaciones.trim();
        if (d.propia || d.medicamentoText) {
          const meta = JSON.stringify({ propia: !!d.propia, med: d.medicamentoText.trim() });
          finalObs = `##${meta}## ${finalObs}`.trim();
        }
        return {
          codigo_sap: Number(d.codigo_sap),
          casa_formuladora_id: Number(d.casa_formuladora_id),
          cantidad: Number(d.cantidad),
          observaciones: finalObs
        };
      });
      
      await saveSolicitudesBatch(fecha, Number(clienteId), payload);
      onSaved();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const isEditing = !!initialData?.cliente_id;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="card" style={{ width: 1200, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* ENCABEZADO MODAL */}
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="card-title">{isEditing ? 'Editar Programación Diaria' : 'Nueva Programación Diaria'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="card-body" style={{ overflowY: 'auto', flex: 1 }}>
          
          {/* SECCION 1: ENCABEZADO DE PROGRAMACION */}
          <div style={{ backgroundColor: 'rgba(0,0,0,0.02)', padding: 20, borderRadius: 8, marginBottom: 20, border: '1px solid var(--border-color)' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>Encabezado</h4>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input 
                  type="date" 
                  className="form-input" 
                  required 
                  value={fecha} 
                  onChange={e => setFecha(e.target.value)} 
                  disabled={isEditing}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cliente *</label>
                <select 
                  className="form-input" 
                  required 
                  value={clienteId} 
                  onChange={e => setClienteId(Number(e.target.value))}
                  disabled={isEditing}
                >
                  <option value="">— Seleccionar Cliente —</option>
                  {clientes.map(c => <option key={c.codigo_sap} value={c.codigo_sap}>{c.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* SECCION 2: DETALLES */}
          <div style={{ backgroundColor: 'white', borderRadius: 8, border: '1px solid var(--border-color)', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>Detalle de Referencias</h4>
              <button className="btn btn-outline btn-sm" onClick={addRow}><Plus size={14} /> Agregar Referencia</button>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Alimento</th>
                  <th style={{ width: '15%' }}>Casa Formuladora</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Propia?</th>
                  <th style={{ width: '20%' }}>Medicamento</th>
                  <th style={{ width: '10%' }}>Cantidad</th>
                  <th style={{ width: '15%' }}>Observaciones</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {detalles.map((d) => (
                  <tr key={d.id_temp}>
                    <td>
                      <div className="search-box" style={{ position: 'relative' }}>
                        <input
                          type="text"
                          className="form-input btn-sm"
                          placeholder="Buscar por nombre o SAP..."
                          value={d.refText}
                          onChange={e => updateRow(d.id_temp, 'refText', e.target.value)}
                          onFocus={() => setFocusedRow(d.id_temp)}
                          onBlur={() => setTimeout(() => setFocusedRow(null), 200)}
                        />
                        {focusedRow === d.id_temp && d.refText && (
                          <div className="dropdown-menu show" style={{ position: 'absolute', top: '100%', left: 0, minWidth: 400, maxHeight: 250, overflowY: 'auto', zIndex: 50, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                            {alimentos
                              .filter((a: any) => `${a.codigo_sap} ${a.descripcion}`.toLowerCase().includes(d.refText.toLowerCase()))
                              .slice(0, 50)
                              .map((a: any) => (
                                <button
                                  key={a.codigo_sap}
                                  type="button"
                                  onMouseDown={() => updateRow(d.id_temp, 'refText', a.descripcion)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                                    padding: '10px 16px', border: 'none', borderBottom: '1px solid rgba(0,0,0,0.05)',
                                    textAlign: 'left', backgroundColor: 'transparent', cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(var(--color-primary-rgb), 0.05)'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  <span style={{ fontWeight: 700, color: 'var(--color-primary)', minWidth: 60, fontSize: '0.9rem' }}>
                                    {a.codigo_sap}
                                  </span>
                                  <span style={{ fontSize: '0.9rem', color: 'var(--text-color)', fontWeight: 500 }}>
                                    {a.descripcion}
                                  </span>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <select 
                        className="form-input btn-sm" 
                        value={d.casa_formuladora_id} 
                        onChange={e => updateRow(d.id_temp, 'casa_formuladora_id', e.target.value)}
                      >
                        <option value="">— Seleccionar —</option>
                        {casas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={d.propia} 
                        onChange={e => updateRow(d.id_temp, 'propia', e.target.checked)} 
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                    </td>
                    <td>
                      <div className="search-box" style={{ position: 'relative' }}>
                        <input
                          type="text"
                          className="form-input btn-sm"
                          placeholder="Buscar medicamento..."
                          value={d.medicamentoText}
                          onChange={e => updateRow(d.id_temp, 'medicamentoText', e.target.value)}
                          onFocus={() => setFocusedMedRow(d.id_temp)}
                          onBlur={() => setTimeout(() => setFocusedMedRow(null), 200)}
                        />
                        {focusedMedRow === d.id_temp && d.medicamentoText && (
                          <div className="dropdown-menu show" style={{ position: 'absolute', top: '100%', left: 0, minWidth: 350, maxHeight: 250, overflowY: 'auto', zIndex: 50, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                            {materiasPrimas
                              .filter((m: any) => `${m.codigo} ${m.nombre}`.toLowerCase().includes(d.medicamentoText.toLowerCase()))
                              .slice(0, 50)
                              .map((m: any) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onMouseDown={() => updateRow(d.id_temp, 'medicamentoText', m.nombre)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                                    padding: '10px 16px', border: 'none', borderBottom: '1px solid rgba(0,0,0,0.05)',
                                    textAlign: 'left', backgroundColor: 'transparent', cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(var(--color-primary-rgb), 0.05)'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  <span style={{ fontWeight: 700, color: 'var(--color-primary)', minWidth: 70, fontSize: '0.9rem' }}>
                                    {m.codigo}
                                  </span>
                                  <span style={{ fontSize: '0.9rem', color: 'var(--text-color)', fontWeight: 500 }}>
                                    {m.nombre}
                                  </span>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <input 
                        type="number" 
                        className="form-input btn-sm" 
                        placeholder="Bultos" 
                        min="1"
                        value={d.cantidad} 
                        onChange={e => updateRow(d.id_temp, 'cantidad', e.target.value)} 
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        className="form-input btn-sm" 
                        placeholder="Opcional..."
                        value={d.observaciones} 
                        onChange={e => updateRow(d.id_temp, 'observaciones', e.target.value)} 
                      />
                    </td>
                    <td>
                      <button 
                        className="btn-icon" 
                        style={{ color: 'var(--color-error)' }} 
                        onClick={() => removeRow(d.id_temp)}
                        title="Eliminar fila"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

        <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 20px' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar Programación'}
          </button>
        </div>

      </div>
    </div>
  );
}
