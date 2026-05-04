import { Fragment, useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, ChevronLeft, ChevronRight, Factory, RefreshCw, ChevronDown, ChevronUp, CalendarDays } from 'lucide-react';
import SolicitudModal from '../components/SolicitudModal';
import { crearPropuestaOP } from '../lib/api/ventas';
import { useVentas, getSemanaActual } from '../hooks/useVentas';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function VentasPage() {
  const {
    canView, canEdit,
    activeTab, setActiveTab,
    loading,
    semana, setSemana,
    anio, setAnio,
    alimentos, clientes, casas, materiasPrimas,
    solicitudModalData,
    showForm, setShowForm,
    expandedDays,
    deleteConfirm, setDeleteConfirm,
    reprogramarData, setReprogramarData,
    nuevaFecha, setNuevaFecha,
    searchTerm, setSearchTerm,
    vistaSemanal,
    mrpData,
    propuestaModal, setPropuestaModal,
    bulkPropuestaModal, setBulkPropuestaModal,
    bachesCustom, setBachesCustom,
    sacosCustom, setSacosCustom,
    expandedMrpRow, setExpandedMrpRow,
    mrpSearchTerm, setMrpSearchTerm,
    selectedMrpRows, setSelectedMrpRows,
    loadTabData, handleOpenForm, handleDelete, handleReprogramar,
    toggleDay, cambiarSemana,
    filteredSol, totalBultosSemana,
    filteredMrpData
  } = useVentas();

  const [bulkData, setBulkData] = useState<Array<{
    mrp: any;
    sacos: number | '';
    baches: number;
  }>>([]);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number, total: number } | null>(null);

  // Filtros locales para Vista Semanal
  const [filtroVSCliente, setFiltroVSCliente] = useState('');
  const [filtroVSDias, setFiltroVSDias] = useState<Record<string, boolean>>({
    'Lun': true, 'Mar': true, 'Mié': true, 'Jue': true, 'Vie': true, 'Sáb': true, 'Dom': true
  });

  const filteredVistaSemanal = useMemo(() => {
    return vistaSemanal.filter(r => {
      // Búsqueda combinada en cliente y referencia
      const matchText = !filtroVSCliente || 
                        r.cliente.toLowerCase().includes(filtroVSCliente.toLowerCase()) || 
                        r.referencia.toLowerCase().includes(filtroVSCliente.toLowerCase());
      if (!matchText) return false;

      // Filtrar por días: Si un día está marcado, la fila debe tener volumen en ESE día o en algún otro marcado.
      // Si el cliente no tiene despachos en ninguno de los días seleccionados, se oculta.
      const hasActivity = r.dias.some((val, idx) => filtroVSDias[DIAS[idx]] && val > 0);
      const anyDaySelected = Object.values(filtroVSDias).some(v => v);
      
      return anyDaySelected && hasActivity;
    });
  }, [vistaSemanal, filtroVSCliente, filtroVSDias]);

  useEffect(() => {
    if (bulkPropuestaModal && bulkPropuestaModal.length > 0) {
      setBulkData(bulkPropuestaModal.map(r => {
        const initialSacos = Number(r.sacosPorBache) || 0;
        return {
          mrp: r,
          sacos: initialSacos || '',
          baches: r.bachesSugeridos || (initialSacos && r.necesidadNeta ? Math.ceil(r.necesidadNeta / initialSacos) : 0)
        };
      }));
    } else {
      setBulkData([]);
    }
  }, [bulkPropuestaModal]);

  if (!canView) return <Navigate to="/" replace />;

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
              clientes={clientes} alimentos={alimentos} casas={casas} materiasPrimas={materiasPrimas}
              onClose={() => setShowForm(false)}
              onSaved={() => { setShowForm(false); loadTabData(); }}
            />
          )}

          {/* Barra de búsqueda premium */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, padding: '14px 20px', background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} />
              <input type="text" className="form-input" placeholder="Buscar cliente, referencia..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ paddingLeft: 38, width: 320, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', height: 38, background: '#f8fafc' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{filteredSol.length} registros</span>
              </div>
              <div style={{ height: 20, width: 1, background: '#e2e8f0' }} />
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{totalBultosSemana.toLocaleString()} bultos</span>
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
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>{primeraSol?.fecha}</span>
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
                    <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16, alignItems: 'start', background: 'var(--bg-app)', borderTop: `1px solid ${colors.accent}22` }}>
                      {clientesEnDia.map(cid => {
                        const clienteId = Number(cid);
                        const items = groupedByDia[dia][clienteId];
                        const totalCliente = items.reduce((acc, r) => acc + r.cantidad, 0);
                        const nombreCliente = (items[0].maestro_clientes as { nombre?: string })?.nombre || `Cliente ${clienteId}`;

                        return (
                          <div key={clienteId} style={{ borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                            {/* Client Header */}
                            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg, #fafffe 0%, #f0fdf4 100%)', borderLeft: '3px solid #22c55e' }}>
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{nombreCliente.toUpperCase()}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{items.length} {items.length === 1 ? 'referencia' : 'referencias'}</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#166534', background: '#dcfce7', padding: '4px 12px', borderRadius: 20 }}>
                                  {totalCliente} <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>bt</span>
                                </span>
                                {canEdit && (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); handleOpenForm(primeraSol.fecha, clienteId, items); }} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }} title="Editar"><Edit2 size={14} /></button>
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
                                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>Referencia</th>
                                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>Cód.</th>
                                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>Bultos</th>
                                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>Casa</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((s, idx) => (
                                  <tr key={s.id} style={{ borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{(s.maestro_alimentos as { descripcion?: string })?.descripcion || '—'}</td>
                                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.82rem' }}>{s.codigo_sap}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{s.cantidad}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>{(s.casas_formuladoras as { nombre?: string })?.nombre}</span>
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
            <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
              <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>No hay solicitudes para esta semana</p>
              <p style={{ fontSize: '0.85rem' }}>Haz clic en <strong>"+ Programar Cargues"</strong> para comenzar.</p>
            </div>
          )}
        </>
      )}

      {/* ════════════════ TAB 2: VISTA SEMANAL (HEATMAP / OPTION 2) ════════════════ */}
      {activeTab === 'vista_semanal' && (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          {/* SIDEBAR FILTROS */}
          <div className="card" style={{ width: '280px', flexShrink: 0, padding: '20px', position: 'sticky', top: '20px' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={16} style={{ color: '#3b82f6' }} /> Filtros
            </h3>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>Buscar Cliente o Ref.</label>
              <input type="text" value={filtroVSCliente} onChange={e => setFiltroVSCliente(e.target.value)} placeholder="Ej: Macpork" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }} />
            </div>

            <hr style={{ borderColor: 'var(--border-color)', margin: '20px 0' }} />

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase' }}>Días de la semana</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {DIAS.map(d => (
                  <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: filtroVSDias[d] ? 600 : 400 }}>
                    <input 
                      type="checkbox" 
                      checked={filtroVSDias[d]} 
                      onChange={e => setFiltroVSDias(prev => ({ ...prev, [d]: e.target.checked }))}
                      style={{ width: '16px', height: '16px', borderRadius: '4px', cursor: 'pointer', accentColor: '#3b82f6' }}
                    />
                    {d === 'Mié' ? 'Miércoles' : d === 'Sáb' ? 'Sábado' : d === 'Lun' ? 'Lunes' : d === 'Mar' ? 'Martes' : d === 'Jue' ? 'Jueves' : d === 'Vie' ? 'Viernes' : 'Domingo'}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* MATRIZ HEATMAP */}
          <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
            <div className="data-table-wrapper" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <tr>
                    <th style={{ padding: '16px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)' }}>Destino / Referencia</th>
                    {DIAS.map(d => filtroVSDias[d] && (
                      <th key={d} style={{ padding: '16px 8px', textAlign: 'center', width: '80px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)' }}>{d}</th>
                    ))}
                    <th style={{ padding: '16px', textAlign: 'right', width: '100px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)' }}>Total</th>
                  </tr>
                </thead>
                <tbody style={{ background: 'var(--bg-app)' }}>
                  {loading ? <tr><td colSpan={10} style={{ textAlign: 'center', padding: 60 }}><RefreshCw className="spinning" size={32} style={{ color: '#3b82f6', margin: '0 auto 16px auto' }}/><div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Calculando matriz...</div></td></tr> :
                  filteredVistaSemanal.length === 0 ? <tr><td colSpan={10} style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', background: 'var(--bg-surface)' }}><div style={{ fontSize: '2rem', marginBottom: '12px' }}>📊</div><div style={{ fontWeight: 600 }}>Sin resultados para estos filtros.</div></td></tr> :
                  filteredVistaSemanal.map((r, i) => {
                    const maxRowValue = Math.max(...r.dias);
                    const totalFiltrado = r.dias.reduce((sum, val, idx) => filtroVSDias[DIAS[idx]] ? sum + val : sum, 0);

                    return (
                    <tr key={i} style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {r.cliente}
                          <span style={{ padding: '2px 8px', borderRadius: '12px', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 700 }}>{r.casa}</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, marginTop: '4px' }}>{r.referencia}</div>
                      </td>
                      {r.dias.map((v, j) => {
                        const dia = DIAS[j];
                        if (!filtroVSDias[dia]) return null;

                        const intensity = v > 0 ? (maxRowValue > 0 ? (v / maxRowValue) : 0) : 0;
                        return (
                          <td key={j} style={{ padding: '8px' }}>
                            {v > 0 ? (
                              <div style={{ 
                                width: '100%', 
                                height: '42px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                borderRadius: '6px', 
                                background: `rgba(59, 130, 246, ${0.15 + (intensity * 0.4)})`, 
                                color: intensity > 0.5 ? '#1e3a8a' : '#2563eb', 
                                fontWeight: 800, 
                                fontSize: '0.9rem',
                                border: `1px solid rgba(59, 130, 246, ${0.3 + (intensity * 0.4)})`
                              }}>
                                {v}
                              </div>
                            ) : (
                              <div style={{ width: '100%', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', opacity: 0.5, fontSize: '0.85rem', background: 'var(--bg-app)', borderRadius: '6px' }}>—</div>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: '16px', textAlign: 'right', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        {totalFiltrado}
                      </td>
                    </tr>
                  )})}
                </tbody>
                {filteredVistaSemanal.length > 0 && (
                  <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--bg-surface)', zIndex: 10, boxShadow: '0 -1px 2px rgba(0,0,0,0.05)' }}>
                    <tr>
                      <td style={{ padding: '16px', fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.85rem', borderTop: '1px solid var(--border-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TOTAL SEMANA FILTRADA</td>
                      {DIAS.map((_, j) => {
                        const dia = DIAS[j];
                        if (!filtroVSDias[dia]) return null;
                        const totalDia = filteredVistaSemanal.reduce((s, r) => s + r.dias[j], 0);
                        return (
                          <td key={j} style={{ padding: '16px 8px', textAlign: 'center', fontWeight: 800, color: totalDia > 0 ? '#2563eb' : 'var(--text-muted)', borderTop: '1px solid var(--border-color)', fontSize: '0.95rem' }}>
                            {totalDia || '—'}
                          </td>
                        );
                      })}
                      <td style={{ padding: '16px', textAlign: 'right', fontWeight: 900, fontSize: '1.25rem', color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)' }}>
                        {filteredVistaSemanal.reduce((sum, r) => {
                          const tf = r.dias.reduce((s, v, j) => filtroVSDias[DIAS[j]] ? s + v : s, 0);
                          return sum + tf;
                        }, 0).toLocaleString()}
                      </td>
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
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="card-title">Motor MRP — Semana {semana}</span>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {filteredMrpData.filter(r => r.necesidadNeta > 0).length} con necesidad · {filteredMrpData.filter(r => r.estado === 'ALCANZA').length} al día
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {selectedMrpRows.size > 0 && canEdit && (
                <button 
                  className="btn btn-primary btn-sm" 
                  style={{ background: '#d97706', borderColor: '#d97706' }}
                  onClick={() => {
                    const selectedData = filteredMrpData.filter((_, i) => selectedMrpRows.has(i));
                    setBulkPropuestaModal(selectedData);
                  }}
                >
                  <Factory size={16} /> Proponer Seleccionadas ({selectedMrpRows.size})
                </button>
              )}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Buscar en MRP..." 
                  value={mrpSearchTerm} 
                  onChange={e => setMrpSearchTerm(e.target.value)} 
                  style={{ paddingLeft: 38, width: 280, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', height: 36, background: '#f8fafc' }} 
                />
              </div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="data-table-wrapper">
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    {canEdit && (
                      <th style={{ width: 40, textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={filteredMrpData.length > 0 && selectedMrpRows.size === filteredMrpData.filter(r => r.necesidadNeta > 0 && !r.propuestaPendiente).length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const newSet = new Set<number>();
                              filteredMrpData.forEach((r, i) => {
                                if (r.necesidadNeta > 0 && !r.propuestaPendiente) newSet.add(i);
                              });
                              setSelectedMrpRows(newSet);
                            } else {
                              setSelectedMrpRows(new Set());
                            }
                          }}
                        />
                      </th>
                    )}
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
                  mrpData.length === 0 ? <tr><td colSpan={canEdit ? 17 : 16} style={{ textAlign: 'center', padding: 30 }}>Sin datos de demanda.</td></tr> :
                  filteredMrpData.map((r, i) => {
                    const badgeColor = r.estado === 'ALCANZA' ? '#22c55e' : r.estado === 'SIN STOCK' ? '#ef4444' : '#f59e0b';
                    const isSelected = selectedMrpRows.has(i);
                    return (
                      <Fragment key={i}>
                        <tr onClick={() => setExpandedMrpRow(expandedMrpRow === i ? null : i)} style={{ cursor: 'pointer', background: isSelected ? '#fffbeb' : r.necesidadNeta > 0 ? 'rgba(239,68,68,0.04)' : undefined, transition: 'background 0.2s' }}>
                          {canEdit && (
                            <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                disabled={!(r.necesidadNeta > 0 && !r.propuestaPendiente)}
                                checked={isSelected}
                                onChange={(e) => {
                                  const newSet = new Set(selectedMrpRows);
                                  if (e.target.checked) newSet.add(i);
                                  else newSet.delete(i);
                                  setSelectedMrpRows(newSet);
                                }}
                              />
                            </td>
                          )}
                          <td style={{ fontWeight: 600, fontSize: '0.78rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {expandedMrpRow === i ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
                              <div>
                                {r.grupo?.includes('|') ? (
                                  <>
                                    <div>{r.grupo.split('|')[0]}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--color-primary)', marginTop: 4, lineHeight: 1.2, whiteSpace: 'normal', maxWidth: 180, padding: '2px 4px', background: 'rgba(46,125,50,0.1)', borderRadius: 4, display: 'inline-block' }}>
                                      {r.grupo.split('|')[1]}
                                    </div>
                                  </>
                                ) : (
                                  r.grupo || 'Sin Grupo'
                                )}
                              </div>
                            </div>
                          </td>
                        <td>{r.referencia}</td>
                        <td><span className="badge badge-success" style={{ fontSize: '0.7rem' }}>{r.casa}</span></td>
                        {r.diasDemanda.map((v, j) => <td key={j} style={{ textAlign: 'center', color: v > 0 ? '#1e293b' : '#e2e8f0', fontWeight: v > 0 ? 600 : 400 }}>{v || '·'}</td>)}
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.demandaActual}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{r.demandaProxima}</td>
                        <td style={{ textAlign: 'right' }}>{r.inventarioFisico}</td>
                        <td style={{ textAlign: 'right', color: r.opPendientes > 0 ? '#2563eb' : '#94a3b8' }}>{r.opPendientes}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.saldoProyectado < 0 ? '#ef4444' : '#22c55e' }}>{r.saldoProyectado}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: badgeColor + '18', color: badgeColor, whiteSpace: 'nowrap' }}>{r.estado}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: r.necesidadNeta > 0 ? '#ef4444' : '#22c55e' }}>{r.necesidadNeta || '—'}</td>
                        {canEdit && (
                          <td style={{ textAlign: 'center' }}>
                            {r.propuestaPendiente ? (
                              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#d97706', background: '#fef3c7', padding: '4px 8px', borderRadius: 4, whiteSpace: 'nowrap', display: 'inline-block' }}>
                                Esperando Aprob.
                              </span>
                            ) : r.necesidadNeta > 0 ? (
                              <button className="btn btn-primary btn-sm" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={(e) => { 
                                e.stopPropagation();
                                setPropuestaModal(r); 
                                const initialSacos = r.sacosPorBache || '';
                                setSacosCustom(initialSacos);
                                setBachesCustom(r.bachesSugeridos || (initialSacos ? Math.ceil(r.necesidadNeta / Number(initialSacos)) : 0)); 
                              }}>
                                <Factory size={12} /> Proponer
                              </button>
                            ) : null}
                          </td>
                        )}
                      </tr>
                      {expandedMrpRow === i && (
                        <tr style={{ background: 'var(--bg-tertiary)' }}>
                          <td colSpan={16} style={{ padding: '16px 24px', borderBottom: '2px solid var(--border-color)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                              
                              {/* OP Pendientes */}
                              <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '12px', color: '#2563eb' }}>OP Pendientes ({r.desglose?.opsPendientes?.length || 0})</h4>
                                {r.desglose?.opsPendientes && r.desglose.opsPendientes.length > 0 ? (
                                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {r.desglose.opsPendientes.map((op, idx) => (
                                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                                        <div>
                                          <strong>Lote {op.lote}</strong>
                                          {op.observaciones && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{op.observaciones}</div>}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                          <span style={{ color: '#2563eb', fontWeight: 600 }}>{op.pendiente} bt. pend.</span>
                                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>de {op.programados} prog.</div>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sin órdenes de producción pendientes.</div>
                                )}
                              </div>

                              {/* Préstamos Pendientes */}
                              <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '12px', color: '#d97706' }}>Préstamos Entregados ({r.desglose?.prestamos?.length || 0})</h4>
                                {r.desglose?.prestamos && r.desglose.prestamos.length > 0 ? (
                                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {r.desglose.prestamos.map((p, idx) => (
                                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                                        <span>Destino: <strong>{p.destino}</strong></span>
                                        <span style={{ color: '#d97706', fontWeight: 600 }}>-{p.pendiente} bt.</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sin préstamos por compensar.</div>
                                )}
                              </div>

                              {/* Resumen de Movimientos */}
                              <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '12px', color: '#1e293b' }}>Resumen Semanal</h4>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Inventario Físico (PT)</span>
                                    <span style={{ fontWeight: 600 }}>{r.inventarioFisico} bt.</span>
                                  </li>
                                  <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Despachos Realizados</span>
                                    <span style={{ fontWeight: 600, color: '#22c55e' }}>{r.desglose?.despachado || 0} bt.</span>
                                  </li>
                                  <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Reprocesos (Consumo)</span>
                                    <span style={{ fontWeight: 600, color: '#ef4444' }}>-{r.desglose?.reprocesos || 0} bt.</span>
                                  </li>
                                </ul>
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
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
            <div style={{ background: 'var(--bg-surface-hover)', padding: 16, borderRadius: 10, marginBottom: 16, fontSize: '0.85rem' }}>
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
              <label className="form-label">Sacos por bache (Fórmula)</label>
              <input type="number" className="form-input" required min={1} value={sacosCustom} onChange={e => {
                const newSacos = e.target.value ? Number(e.target.value) : '';
                setSacosCustom(newSacos);
                if (newSacos && propuestaModal.necesidadNeta > 0) {
                  setBachesCustom(Math.ceil(propuestaModal.necesidadNeta / Number(newSacos)));
                } else {
                  setBachesCustom(0);
                }
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">Baches a producir</label>
              <input type="number" className="form-input" min={1} value={bachesCustom} onChange={e => setBachesCustom(Number(e.target.value))} />
              <small style={{ color: 'var(--text-muted)' }}>Bultos resultantes: <strong>{bachesCustom * (Number(sacosCustom) || 0)}</strong></small>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setPropuestaModal(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!sacosCustom || !bachesCustom} onClick={async () => {
                if (!sacosCustom || !bachesCustom) {
                  alert('Por favor, especifica tanto los sacos por bache como los baches a producir.');
                  return;
                }
                try {
                  await crearPropuestaOP(propuestaModal, semana, anio, bachesCustom, Number(sacosCustom));
                  setPropuestaModal(null);
                  alert('Propuesta enviada a Producción.');
                  loadTabData();
                } catch (err: unknown) { alert('Error: ' + (err as Error).message); }
              }}>Enviar a Producción</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ MODAL: PROPUESTA MASIVA ════════════════ */}
      {bulkPropuestaModal && bulkPropuestaModal.length > 0 && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 800, padding: 24, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Factory size={20} /> Proponer {bulkPropuestaModal.length} Órdenes de Producción</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.85rem' }}>
              Revisa y ajusta los sacos por bache y la cantidad de baches a producir para cada orden antes de enviarlas al sistema.
            </p>
            
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8, marginBottom: 16 }}>
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>Grupo / Referencia</th>
                    <th style={{ textAlign: 'right' }}>Necesidad</th>
                    <th style={{ width: 120 }}>Sacos x Bache</th>
                    <th style={{ width: 120 }}>Baches</th>
                    <th style={{ textAlign: 'right' }}>Bultos Producidos</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkData.map((item, idx) => {
                    const bultosTotales = (Number(item.sacos) || 0) * (Number(item.baches) || 0);
                    return (
                      <tr key={idx}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.mrp.referencia}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.mrp.grupo}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{item.mrp.necesidadNeta}</td>
                        <td>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ height: 30, padding: '4px 8px' }}
                            value={item.sacos}
                            onChange={(e) => {
                              const v = e.target.value ? Number(e.target.value) : '';
                              const newData = [...bulkData];
                              newData[idx].sacos = v;
                              if (v) newData[idx].baches = Math.ceil(item.mrp.necesidadNeta / Number(v));
                              setBulkData(newData);
                            }}
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ height: 30, padding: '4px 8px' }}
                            value={item.baches}
                            onChange={(e) => {
                              const newData = [...bulkData];
                              newData[idx].baches = Number(e.target.value);
                              setBulkData(newData);
                            }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: bultosTotales >= item.mrp.necesidadNeta ? '#22c55e' : '#f59e0b' }}>
                          {bultosTotales} bt
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <button className="btn btn-outline" disabled={isSubmittingBulk} onClick={() => setBulkPropuestaModal(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={isSubmittingBulk || bulkData.some(d => !d.sacos || !d.baches)} onClick={async () => {
                const isValid = bulkData.every(d => d.sacos && d.baches);
                if (!isValid) {
                  alert('Por favor, especifica tanto los sacos por bache como los baches a producir para todas las filas.');
                  return;
                }
                
                setIsSubmittingBulk(true);
                setBulkProgress({ current: 0, total: bulkData.length });
                
                try {
                  let count = 0;
                  for (const d of bulkData) {
                    await crearPropuestaOP(d.mrp, semana, anio, d.baches, Number(d.sacos));
                    count++;
                    setBulkProgress({ current: count, total: bulkData.length });
                  }
                  setBulkPropuestaModal(null);
                  setSelectedMrpRows(new Set());
                  alert(`Se han enviado ${bulkData.length} propuestas a Producción exitosamente.`);
                  loadTabData();
                } catch (err: unknown) { 
                  alert('Error al enviar propuestas: ' + (err as Error).message); 
                } finally {
                  setIsSubmittingBulk(false);
                  setBulkProgress(null);
                }
              }}>
                {isSubmittingBulk ? <RefreshCw size={16} className="spinning" /> : <Factory size={16} />} 
                {isSubmittingBulk ? 'Enviando...' : 'Enviar Todas a Producción'}
              </button>
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

      {/* MODAL PROGRESO MASIVO */}
      {bulkProgress && (
        <div className="modal-overlay" style={{ zIndex: 10000, backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: 400, padding: 30, textAlign: 'center' }}>
            <RefreshCw size={40} className="spinning" style={{ color: '#d97706', margin: '0 auto 16px auto' }} />
            <h3 style={{ marginBottom: 8 }}>Enviando Propuestas</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
              Por favor espera, no cierres esta ventana. Procesando y creando las propuestas...
            </p>
            <div style={{ background: '#f1f5f9', borderRadius: 8, height: 16, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ 
                background: '#d97706', 
                height: '100%', 
                width: `${(bulkProgress.current / bulkProgress.total) * 100}%`,
                transition: 'width 0.3s ease-out'
              }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#d97706' }}>
              {bulkProgress.current} de {bulkProgress.total} enviadas
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
