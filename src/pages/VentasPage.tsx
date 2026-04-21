import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, ChevronLeft, ChevronRight, Factory, RefreshCw, ChevronDown, CalendarDays } from 'lucide-react';
import { usePermissions } from '../lib/permissions';
import supabase from '../lib/supabase';
import SolicitudModal from '../components/SolicitudModal';
import {
  fetchCasasFormuladoras, fetchSolicitudes,
  calcularVistaSemanal, ejecutarMRP, crearPropuestaOP,
  calcularSemanaISO, calcularDiaSemana,
  type CasaFormuladora, type VentaSolicitud, type VistaSemanalRow, type MRPRow
} from '../lib/api/ventas';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];


import { getISOWeek } from 'date-fns';

function getSemanaActual() {
  const d = new Date();
  return { semana: getISOWeek(d), anio: d.getFullYear() };
}

export default function VentasPage() {
  const { canView, canEdit } = usePermissions('ventas');
  const [activeTab, setActiveTab] = useState('solicitudes');
  const [loading, setLoading] = useState(false);

  // Semana selector
  const [semana, setSemana] = useState(getSemanaActual().semana);
  const [anio, setAnio] = useState(getSemanaActual().anio);

  // Maestros
  const [casas, setCasas] = useState<CasaFormuladora[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [alimentos, setAlimentos] = useState<any[]>([]);

  // Tab 1 - Solicitudes
  const [solicitudes, setSolicitudes] = useState<VentaSolicitud[]>([]);
  const [solicitudModalData, setSolicitudModalData] = useState<{ fecha: string, cliente_id: number | '', detalles: any[] } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const [deleteConfirm, setDeleteConfirm] = useState<{ fecha: string, cliente_id: number } | null>(null);
  const [reprogramarData, setReprogramarData] = useState<{ fecha: string, cliente_id: number, nombreCliente: string } | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Tab 2 - Vista Semanal
  const [vistaSemanal, setVistaSemanal] = useState<VistaSemanalRow[]>([]);

  // Tab 3 - MRP
  const [mrpData, setMrpData] = useState<MRPRow[]>([]);
  const [propuestaModal, setPropuestaModal] = useState<MRPRow | null>(null);
  const [bachesCustom, setBachesCustom] = useState<number>(0);

  useEffect(() => { loadMaestros(); }, []);
  useEffect(() => { if (canView) loadTabData(); }, [activeTab, semana, anio]);

  if (!canView) return <Navigate to="/" replace />;

  async function loadMaestros() {
    const [c, { data: cl }, { data: al }] = await Promise.all([
      fetchCasasFormuladoras(),
      supabase.from('maestro_clientes').select('codigo_sap, nombre').order('nombre'),
      supabase.from('maestro_alimentos').select('codigo_sap, descripcion').order('descripcion'),
    ]);
    setCasas(c);
    setClientes(cl || []);
    setAlimentos(al || []);
  }

  async function loadTabData() {
    setLoading(true);
    try {
      // Always load solicitudes (they're fast and needed by multiple tabs)
      const solPromise = fetchSolicitudes(semana, anio);
      
      if (activeTab === 'solicitudes') {
        const data = await solPromise;
        setSolicitudes(data);
      } else if (activeTab === 'vista_semanal') {
        const [solData, vsData] = await Promise.all([
          solPromise,
          calcularVistaSemanal(semana, anio)
        ]);
        setSolicitudes(solData);
        setVistaSemanal(vsData);
      } else if (activeTab === 'mrp') {
        const [solData, mrpResult] = await Promise.all([
          solPromise,
          ejecutarMRP(semana, anio)
        ]);
        setSolicitudes(solData);
        setMrpData(mrpResult);
      }
    } catch (err: any) {
      console.error(err);
    }
    setLoading(false);
  }

  function handleOpenForm(fecha?: string, cliente_id?: number, items?: any[]) {
    if (fecha && cliente_id && items) {
      setSolicitudModalData({ fecha, cliente_id, detalles: items });
    } else {
      setSolicitudModalData({ fecha: new Date().toISOString().split('T')[0], cliente_id: '', detalles: [] });
    }
    setShowForm(true);
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      await supabase.from('ventas_solicitudes').delete()
        .eq('fecha', deleteConfirm.fecha)
        .eq('cliente_id', deleteConfirm.cliente_id);
      loadTabData();
    } catch (err: any) {
      alert('Error eliminando: ' + err.message);
    }
    setDeleteConfirm(null);
  }

  async function handleReprogramar() {
    if (!reprogramarData || !nuevaFecha) return;
    if (nuevaFecha === reprogramarData.fecha) return alert('La nueva fecha es igual a la actual.');
    try {
      const newSemana = calcularSemanaISO(nuevaFecha);
      const newDia = calcularDiaSemana(nuevaFecha);
      const { error } = await supabase.from('ventas_solicitudes')
        .update({ fecha: nuevaFecha, semana: newSemana, dia_semana: newDia })
        .eq('fecha', reprogramarData.fecha)
        .eq('cliente_id', reprogramarData.cliente_id);
      if (error) throw error;
      setReprogramarData(null);
      setNuevaFecha('');
      loadTabData();
    } catch (err: any) {
      alert('Error reprogramando: ' + err.message);
    }
  }

  function toggleDay(dia: string) {
    setExpandedDays(prev => ({ ...prev, [dia]: prev[dia] === false ? true : false }));
  }

  function cambiarSemana(delta: number) {
    let s = semana + delta, a = anio;
    if (s < 1) { s = 52; a--; }
    if (s > 52) { s = 1; a++; }
    setSemana(s); setAnio(a);
  }

  const filteredSol = solicitudes.filter(s => {
    if (!searchTerm) return true;
    const str = `${(s.maestro_clientes as any)?.nombre || ''} ${(s.maestro_alimentos as any)?.descripcion || ''} ${(s.casas_formuladoras as any)?.nombre || ''}`.toLowerCase();
    return str.includes(searchTerm.toLowerCase());
  });

  const totalBultosSemana = filteredSol.reduce((s, r) => s + r.cantidad, 0);

  // ═══════════ RENDER ═══════════

  return (
    <div>
      {/* TABS */}
      <div className="tabs">
        {[
          { id: 'solicitudes', label: '📋 Solicitudes' },
          { id: 'vista_semanal', label: '📊 Vista Semanal' },
          { id: 'mrp', label: '🚦 MRP & Suficiencia' },
        ].map(t => (
          <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* SELECTOR DE SEMANA */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-outline btn-sm" onClick={() => cambiarSemana(-1)}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 700, fontSize: '1.05rem', minWidth: 140, textAlign: 'center' }}>
            Semana {semana} — {anio}
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => cambiarSemana(1)}><ChevronRight size={16} /></button>
          <button className="btn btn-outline btn-sm" onClick={() => { const c = getSemanaActual(); setSemana(c.semana); setAnio(c.anio); }} style={{ marginLeft: 8 }}>Hoy</button>
          <button className="btn btn-outline btn-sm" onClick={loadTabData} disabled={loading}><RefreshCw size={14} className={loading ? 'spinning' : ''} /></button>
        </div>
        <div className="toolbar-right">
          {activeTab === 'solicitudes' && canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => handleOpenForm()}><Plus size={16} /> Programar Cargues</button>
          )}
        </div>
      </div>

      {/* ════════════════ TAB 1: SOLICITUDES ════════════════ */}
      {activeTab === 'solicitudes' && (
        <>
          {showForm && (
            <SolicitudModal
              initialData={solicitudModalData}
              clientes={clientes} alimentos={alimentos} casas={casas}
              onClose={() => setShowForm(false)}
              onSaved={() => { setShowForm(false); loadTabData(); }}
            />
          )}

          {/* Barra de búsqueda premium */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, padding: '14px 20px', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
              <input type="text" className="form-input" placeholder="Buscar cliente, referencia..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ paddingLeft: 38, width: 320, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', height: 38, background: '#f8fafc' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{filteredSol.length} registros</span>
              </div>
              <div style={{ height: 20, width: 1, background: '#e2e8f0' }} />
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>{totalBultosSemana.toLocaleString()} bultos</span>
            </div>
          </div>

          {/* Vista agrupada por Día -> Cliente */}
          {(() => {
            const diasOrden = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Otro'];
            const diaColors: Record<string, { accent: string, bg: string, text: string }> = {
              'Lunes':     { accent: '#3b82f6', bg: '#eff6ff', text: '#1e40af' },
              'Martes':    { accent: '#8b5cf6', bg: '#f5f3ff', text: '#5b21b6' },
              'Miércoles': { accent: '#06b6d4', bg: '#ecfeff', text: '#155e75' },
              'Jueves':    { accent: '#f59e0b', bg: '#fffbeb', text: '#92400e' },
              'Viernes':   { accent: '#ef4444', bg: '#fef2f2', text: '#991b1b' },
              'Sábado':    { accent: '#10b981', bg: '#ecfdf5', text: '#065f46' },
              'Domingo':   { accent: '#6366f1', bg: '#eef2ff', text: '#3730a3' },
              'Otro':      { accent: '#64748b', bg: '#f8fafc', text: '#334155' },
            };
            const groupedByDia: Record<string, Record<number, typeof filteredSol>> = {};
            for (const d of diasOrden) groupedByDia[d] = {};
            for (const s of filteredSol) {
              const dia = s.dia_semana || 'Otro';
              if (!groupedByDia[dia]) groupedByDia[dia] = {};
              if (!groupedByDia[dia][s.cliente_id]) groupedByDia[dia][s.cliente_id] = [];
              groupedByDia[dia][s.cliente_id].push(s);
            }
            
            return diasOrden.map(dia => {
              const clientesEnDia = Object.keys(groupedByDia[dia]);
              if (clientesEnDia.length === 0) return null;
              let totalDia = 0;
              clientesEnDia.forEach(cid => {
                totalDia += groupedByDia[dia][Number(cid)].reduce((acc, r) => acc + r.cantidad, 0);
              });
              const primeraSol = groupedByDia[dia][Number(clientesEnDia[0])][0];
              const colors = diaColors[dia] || diaColors['Otro'];
              const isExpanded = !!expandedDays[dia];

              return (
                <div key={dia} style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: isExpanded ? '0 4px 16px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.03)', transition: 'box-shadow 0.3s', background: 'white' }}>
                  {/* Day Header */}
                  <div 
                    onClick={() => toggleDay(dia)}
                    style={{ 
                      padding: '14px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderLeft: `4px solid ${colors.accent}`,
                      background: isExpanded ? colors.bg : 'white',
                      transition: 'background 0.3s', userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <ChevronDown size={18} style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', color: colors.accent, flexShrink: 0 }} />
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: colors.text }}>{dia}</span>
                      <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 500 }}>{primeraSol?.fecha}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ padding: '3px 12px', borderRadius: 20, background: colors.accent + '14', color: colors.text, fontWeight: 700, fontSize: '0.78rem' }}>
                        {clientesEnDia.length} {clientesEnDia.length === 1 ? 'cliente' : 'clientes'}
                      </span>
                      <span style={{ padding: '4px 14px', borderRadius: 20, background: colors.accent, color: 'white', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.02em' }}>
                        {totalDia.toLocaleString()} bt
                      </span>
                    </div>
                  </div>

                  {/* Day Body - Client Cards Grid */}
                  {isExpanded && (
                    <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16, alignItems: 'start', background: '#f1f5f9', borderTop: `1px solid ${colors.accent}22` }}>
                      {clientesEnDia.map(cid => {
                        const clienteId = Number(cid);
                        const items = groupedByDia[dia][clienteId];
                        const totalCliente = items.reduce((acc, r) => acc + r.cantidad, 0);
                        const nombreCliente = (items[0].maestro_clientes as any)?.nombre || `Cliente ${clienteId}`;

                        return (
                          <div key={clienteId} style={{ borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                            {/* Client Header */}
                            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg, #fafffe 0%, #f0fdf4 100%)', borderLeft: '3px solid #22c55e' }}>
                              <div>
                                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>{nombreCliente.toUpperCase()}</div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{items.length} {items.length === 1 ? 'referencia' : 'referencias'}</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#166534', background: '#dcfce7', padding: '4px 12px', borderRadius: 20 }}>
                                  {totalCliente} <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>bt</span>
                                </span>
                                {canEdit && (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); handleOpenForm(primeraSol.fecha, clienteId, items); }} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }} title="Editar"><Edit2 size={14} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); setReprogramarData({ fecha: primeraSol.fecha, cliente_id: clienteId, nombreCliente: nombreCliente.toUpperCase() }); setNuevaFecha(''); }} style={{ background: 'none', border: '1px solid #bfdbfe', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#3b82f6', display: 'flex', alignItems: 'center' }} title="Reprogramar fecha"><CalendarDays size={14} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ fecha: primeraSol.fecha, cliente_id: clienteId }); }} style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center' }} title="Eliminar"><Trash2 size={14} /></button>
                                  </>
                                )}
                              </div>
                            </div>
                            {/* Client Detail */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>Referencia</th>
                                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>Cód.</th>
                                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>Bultos</th>
                                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>Casa</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((s, idx) => (
                                  <tr key={s.id} style={{ borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{(s.maestro_alimentos as any)?.descripcion || '—'}</td>
                                    <td style={{ padding: '10px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.82rem' }}>{s.codigo_sap}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#1e293b', fontSize: '0.9rem' }}>{s.cantidad}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>{(s.casas_formuladoras as any)?.nombre}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {!loading && filteredSol.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 40px', color: '#94a3b8', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
              <p style={{ fontSize: '1.05rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>No hay solicitudes para esta semana</p>
              <p style={{ fontSize: '0.85rem' }}>Haz clic en <strong>"+ Programar Cargues"</strong> para comenzar.</p>
            </div>
          )}
        </>
      )}

      {/* ════════════════ TAB 2: VISTA SEMANAL ════════════════ */}
      {activeTab === 'vista_semanal' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cliente</th><th>Referencia</th><th>Casa</th>
                    {DIAS.map(d => <th key={d} style={{ textAlign: 'center', width: 70 }}>{d}</th>)}
                    <th style={{ textAlign: 'right', fontWeight: 800, width: 80 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={11} style={{ textAlign: 'center', padding: 30 }}>Calculando vista semanal...</td></tr> :
                  vistaSemanal.length === 0 ? <tr><td colSpan={11} style={{ textAlign: 'center', padding: 30 }}>Sin solicitudes esta semana.</td></tr> :
                  vistaSemanal.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{r.cliente}</td>
                      <td>{r.referencia}</td>
                      <td><span className="badge badge-success">{r.casa}</span></td>
                      {r.dias.map((v, j) => <td key={j} style={{ textAlign: 'center', fontWeight: v > 0 ? 700 : 400, color: v > 0 ? '#1e293b' : '#cbd5e1' }}>{v || '—'}</td>)}
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '1rem' }}>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
                {vistaSemanal.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 800, background: '#f8fafc' }}>
                      <td colSpan={3}>TOTAL SEMANA</td>
                      {DIAS.map((_, j) => <td key={j} style={{ textAlign: 'center' }}>{vistaSemanal.reduce((s, r) => s + r.dias[j], 0) || '—'}</td>)}
                      <td style={{ textAlign: 'right', fontSize: '1.1rem' }}>{vistaSemanal.reduce((s, r) => s + r.total, 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ TAB 3: MRP & SUFICIENCIA ════════════════ */}
      {activeTab === 'mrp' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Motor MRP — Semana {semana}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {mrpData.filter(r => r.necesidadNeta > 0).length} con necesidad · {mrpData.filter(r => r.estado === 'ALCANZA').length} al día
            </span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="data-table-wrapper">
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>Grupo</th><th>Referencia</th><th>Casa</th>
                    {DIAS.map(d => <th key={d} style={{ textAlign: 'center', width: 50, fontSize: '0.75rem' }}>{d}</th>)}
                    <th style={{ textAlign: 'right' }}>Demanda</th>
                    <th style={{ textAlign: 'right' }}>Prox.</th>
                    <th style={{ textAlign: 'right' }}>Inv.</th>
                    <th style={{ textAlign: 'right' }}>OP Pend.</th>
                    <th style={{ textAlign: 'right' }}>Saldo Proy.</th>
                    <th style={{ textAlign: 'center' }}>Estado</th>
                    <th style={{ textAlign: 'right' }}>Necesidad</th>
                    {canEdit && <th style={{ width: 90 }}>Acción</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={16} style={{ textAlign: 'center', padding: 30 }}>Ejecutando MRP...</td></tr> :
                  mrpData.length === 0 ? <tr><td colSpan={16} style={{ textAlign: 'center', padding: 30 }}>Sin datos de demanda.</td></tr> :
                  mrpData.map((r, i) => {
                    const badgeColor = r.estado === 'ALCANZA' ? '#22c55e' : r.estado === 'SIN STOCK' ? '#ef4444' : '#f59e0b';
                    return (
                      <tr key={i} style={{ background: r.necesidadNeta > 0 ? 'rgba(239,68,68,0.04)' : undefined }}>
                        <td style={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.grupo}</td>
                        <td>{r.referencia}</td>
                        <td><span className="badge badge-success" style={{ fontSize: '0.7rem' }}>{r.casa}</span></td>
                        {r.diasDemanda.map((v, j) => <td key={j} style={{ textAlign: 'center', color: v > 0 ? '#1e293b' : '#e2e8f0', fontWeight: v > 0 ? 600 : 400 }}>{v || '·'}</td>)}
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.demandaActual}</td>
                        <td style={{ textAlign: 'right', color: '#64748b' }}>{r.demandaProxima}</td>
                        <td style={{ textAlign: 'right' }}>{r.inventarioFisico}</td>
                        <td style={{ textAlign: 'right', color: r.opPendientes > 0 ? '#2563eb' : '#94a3b8' }}>{r.opPendientes}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.saldoProyectado < 0 ? '#ef4444' : '#22c55e' }}>{r.saldoProyectado}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: badgeColor + '18', color: badgeColor, whiteSpace: 'nowrap' }}>
                            {r.estado}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: r.necesidadNeta > 0 ? '#ef4444' : '#22c55e' }}>{r.necesidadNeta || '—'}</td>
                        {canEdit && (
                          <td>
                            {r.necesidadNeta > 0 && r.sacosPorBache && (
                              <button className="btn btn-primary btn-sm" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => { setPropuestaModal(r); setBachesCustom(r.bachesSugeridos || 1); }}>
                                <Factory size={12} /> Proponer
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ MODAL: PROPONER OP ════════════════ */}
      {propuestaModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 520, padding: 24 }}>
            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Factory size={20} /> Proponer Orden de Producción</h3>
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 10, marginBottom: 16, fontSize: '0.85rem' }}>
              <div><strong>Grupo:</strong> {propuestaModal.grupo}</div>
              <div><strong>Referencia:</strong> {propuestaModal.referencia}</div>
              <div><strong>Casa:</strong> {propuestaModal.casa}</div>
              <hr style={{ margin: '10px 0', borderColor: '#e2e8f0' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>Demanda S{semana}: <strong>{propuestaModal.demandaActual}</strong></div>
                <div>Demanda S{semana+1}: <strong>{propuestaModal.demandaProxima}</strong></div>
                <div>Inventario: <strong>{propuestaModal.inventarioFisico}</strong></div>
                <div>OP Pendientes: <strong>{propuestaModal.opPendientes}</strong></div>
                <div>Reproceso: <strong style={{ color: propuestaModal.reproceso > 0 ? '#ef4444' : undefined }}>{propuestaModal.reproceso}</strong></div>
                <div>Saldo Proy.: <strong style={{ color: propuestaModal.saldoProyectado < 0 ? '#ef4444' : '#22c55e' }}>{propuestaModal.saldoProyectado}</strong></div>
              </div>
              <hr style={{ margin: '10px 0', borderColor: '#e2e8f0' }} />
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>Necesidad Neta: {propuestaModal.necesidadNeta} bultos</div>
            </div>
            <div className="form-group">
              <label className="form-label">Baches a producir ({propuestaModal.sacosPorBache} bt/bache)</label>
              <input type="number" className="form-input" min={1} value={bachesCustom} onChange={e => setBachesCustom(Number(e.target.value))} />
              <small style={{ color: 'var(--text-muted)' }}>Bultos resultantes: <strong>{bachesCustom * (propuestaModal.sacosPorBache || 50)}</strong></small>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setPropuestaModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={async () => {
                try {
                  await crearPropuestaOP(propuestaModal, semana, anio, bachesCustom);
                  setPropuestaModal(null);
                  alert('Propuesta enviada a Producción.');
                  loadTabData();
                } catch (err: any) { alert('Error: ' + err.message); }
              }}>Enviar a Producción</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DELETE */}
      {deleteConfirm && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 400, padding: 20 }}>
            <h3 style={{ marginBottom: 15, color: 'var(--color-error)' }}>Confirmar Eliminación</h3>
            <p>¿Eliminar la programación de este cliente en este día?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REPROGRAMAR */}
      {reprogramarData && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 440, padding: 0, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', borderBottom: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 10 }}>
              <CalendarDays size={20} style={{ color: '#3b82f6' }} />
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#1e40af' }}>Reprogramar Cargue</h3>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 4 }}>Cliente</div>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>{reprogramarData.nombreCliente}</div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 8, marginBottom: 4 }}>Fecha actual</div>
                <div style={{ fontWeight: 700, color: '#ef4444' }}>{reprogramarData.fecha}</div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600, color: '#1e293b' }}>Nueva fecha</label>
                <input type="date" className="form-input" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} style={{ borderRadius: 8 }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button className="btn btn-outline" onClick={() => setReprogramarData(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!nuevaFecha} onClick={handleReprogramar}>Reprogramar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
