import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, XCircle, Edit3, Trash2 } from 'lucide-react';
import { fetchPropuestasOP, revisarPropuestaOP } from '../lib/api/ventas';
import { usePermissions } from '../lib/permissions';
import supabase, { registrarAuditoria } from '../lib/supabase';

export default function PropuestasOPPanel() {
  const { userRole } = usePermissions('programacion');
  const isAdmin = userRole === 'Administrador';
  const [loading, setLoading] = useState(false);
  const [propuestas, setPropuestas] = useState<any[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('PROPUESTA');
  
  // Modals
  const [showAjustar, setShowAjustar] = useState<any>(null);
  const [showRechazar, setShowRechazar] = useState<any>(null);
  const [bachesCustom, setBachesCustom] = useState<number>(0);
  const [motivo, setMotivo] = useState('');

  useEffect(() => { loadData(); }, [filtroEstado]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await fetchPropuestasOP(filtroEstado === 'TODAS' ? undefined : filtroEstado);
      setPropuestas(data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function handleAceptar(propuesta: any) {
    if (!window.confirm(`¿Aceptar ${propuesta.baches_propuestos} baches de ${propuesta.referencia || 'SAP '+propuesta.codigo_sap}?`)) return;
    try {
      await revisarPropuestaOP(propuesta.id, 'ACEPTADA');
      loadData();
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  async function submitAjuste(e: React.FormEvent) {
    e.preventDefault();
    try {
      await revisarPropuestaOP(showAjustar.id, 'AJUSTADA', { baches_ajustados: Number(bachesCustom) });
      setShowAjustar(null);
      loadData();
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  async function submitRechazo(e: React.FormEvent) {
    e.preventDefault();
    try {
      await revisarPropuestaOP(showRechazar.id, 'RECHAZADA', { motivo_rechazo: motivo });
      setShowRechazar(null);
      loadData();
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  async function handleEliminar(propuesta: any) {
    if (!window.confirm(`¿Eliminar propuesta de ${propuesta.referencia || 'SAP '+propuesta.codigo_sap}? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabase.from('propuestas_op').delete().eq('id', propuesta.id);
      if (error) throw error;
      await registrarAuditoria('DELETE', 'Propuestas MRP', `Propuesta ${propuesta.id} eliminada: ${propuesta.referencia || propuesta.codigo_sap}`);
      loadData();
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <span className="card-title">Propuestas MRP (Nuevas Órdenes de Producción)</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <select className="form-input btn-sm" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="PROPUESTA">Pendientes por Revisar</option>
            <option value="PROGRAMADA">Aprobadas / Programadas</option>
            <option value="RECHAZADA">Rechazadas</option>
            <option value="TODAS">Todas</option>
          </select>
          <button className="btn btn-outline btn-sm" onClick={loadData} disabled={loading}><RefreshCw size={14} className={loading ? 'spinning' : ''} /></button>
        </div>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <div className="data-table-wrapper">
          <table className="data-table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Semana</th>
                <th>Alimento (SAP)</th>
                <th>Casa</th>
                <th>Cliente / Grupo</th>
                <th>Observaciones</th>
                <th style={{ textAlign: 'right' }}>Demanda</th>
                <th style={{ textAlign: 'right' }}>Inv. + Pend.</th>
                <th style={{ textAlign: 'right' }}>Necesidad</th>
                <th style={{ textAlign: 'right' }}>Baches</th>
                <th style={{ textAlign: 'right' }}>Total Bultos</th>
                <th style={{ textAlign: 'center' }}>Estado</th>
                <th style={{ width: 140, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={12} style={{ textAlign: 'center', padding: 30 }}>Cargando propuestas...</td></tr> :
               propuestas.length === 0 ? <tr><td colSpan={12} style={{ textAlign: 'center', padding: 30 }}>No hay propuestas en este estado.</td></tr> :
               propuestas.map(p => (
                 <tr key={p.id}>
                   <td style={{ fontWeight: 600 }}>Sem {p.semana}</td>
                   <td><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{p.codigo_sap}</span> <br/>{p.referencia || 'Ver Maestro'}</td>
                   <td><span className="badge badge-success">{p.casas_formuladoras?.nombre || p.casa_formuladora_id}</span></td>
                   <td style={{ fontSize: '0.8rem' }}>{p.clienteNombre || p.grupo || '—'}</td>
                   <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.observaciones}>{p.observaciones || '—'}</td>
                   <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{p.demanda_actual + p.demanda_proxima}</td>
                   <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{p.inventario_fisico + p.op_pendientes}</td>
                   <td style={{ textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>{p.necesidad_neta}</td>
                   <td style={{ textAlign: 'right', fontWeight: 800 }}>{p.baches_propuestos}</td>
                   <td style={{ textAlign: 'right', fontWeight: 800 }}>{p.bultos_resultantes}</td>
                   <td style={{ textAlign: 'center' }}>
                     <span className={`badge badge-${p.estado === 'PROGRAMADA' ? 'success' : p.estado === 'RECHAZADA' ? 'error' : 'warning'}`}>
                       {p.estado}
                     </span>
                     {p.lote_generado && <div style={{ fontSize: '0.75rem', marginTop: 4 }}>OP: {p.lote_generado}</div>}
                   </td>
                   <td>
                     {p.estado === 'PROPUESTA' ? (
                       <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                         <button className="btn btn-sm btn-icon" style={{ color: '#16a34a', background: '#dcfce7' }} onClick={() => handleAceptar(p)} title="Aceptar y Crear OP"><CheckCircle size={16} /></button>
                         <button className="btn btn-sm btn-icon" style={{ color: '#d97706', background: '#fef3c7' }} onClick={() => { setShowAjustar(p); setBachesCustom(p.baches_propuestos); }} title="Ajustar Baches"><Edit3 size={16} /></button>
                         <button className="btn btn-sm btn-icon" style={{ color: '#dc2626', background: '#fee2e2' }} onClick={() => setShowRechazar(p)} title="Rechazar"><XCircle size={16} /></button>
                         {isAdmin && <button className="btn btn-sm btn-icon" style={{ color: '#7f1d1d', background: '#fecaca' }} onClick={() => handleEliminar(p)} title="Eliminar (Admin)"><Trash2 size={14} /></button>}
                       </div>
                     ) : (
                       <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                         <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{p.reviewed_by ? p.reviewed_by.split('@')[0] : 'Sistema'}</span>
                         {isAdmin && <button className="btn btn-sm btn-icon" style={{ color: '#7f1d1d', background: '#fecaca' }} onClick={() => handleEliminar(p)} title="Eliminar (Admin)"><Trash2 size={14} /></button>}
                       </div>
                     )}
                   </td>
                 </tr>
               ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL AJUSTAR */}
      {showAjustar && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 400, padding: 20 }}>
            <h3 style={{ marginBottom: 16 }}>Ajustar y Aprobar OP</h3>
            <div style={{ background: '#f1f5f9', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '0.85rem' }}>
              <div><strong>Alimento:</strong> {showAjustar.referencia || showAjustar.codigo_sap}</div>
              <div><strong>Faltante Real (MRP):</strong> {showAjustar.necesidad_neta} bultos</div>
              <div><strong>Sugerido original:</strong> {showAjustar.baches_propuestos} baches ({showAjustar.sacos_por_bache} bt/bache)</div>
            </div>
            <form onSubmit={submitAjuste}>
              <div className="form-group">
                <label className="form-label">Nuevo número de baches</label>
                <input type="number" className="form-input" required min={1} value={bachesCustom} onChange={e => setBachesCustom(Number(e.target.value))} />
                <small style={{ color: 'var(--text-muted)' }}>Bultos totales que se programarán: <strong>{bachesCustom * (showAjustar.sacos_por_bache || 50)}</strong></small>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAjustar(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Crear OP Ajustada</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RECHAZAR */}
      {showRechazar && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 400, padding: 20 }}>
            <h3 style={{ marginBottom: 16, color: '#dc2626' }}>Rechazar Propuesta</h3>
            <form onSubmit={submitRechazo}>
              <div className="form-group">
                <label className="form-label">Motivo de rechazo (Obligatorio)</label>
                <textarea className="form-input" required rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. No hay materia prima suficiente..." />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowRechazar(null)}>Cancelar</button>
                <button type="submit" className="btn btn-danger">Confirmar Rechazo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
