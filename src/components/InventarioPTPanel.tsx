import React, { useMemo, useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, ArrowRightLeft, Search, Pin, PinOff, ChevronDown, ChevronRight, History, Package, Plus, Trash2 } from 'lucide-react';
import { useInventarioPT, InvItem, HistorialReproceso, HistorialPrestamo } from '../hooks/useInventarioPT';

interface DisplayRow {
  codigo_sap: number;
  descripcion: string;
  inv?: InvItem | null;
  isEspecial: boolean;
  especialText: string;
  rowKey: string;
  grp: string;
}

export default function InventarioPTPanel() {
  const {
    canEdit, loading, grupos, grupoSel, semana, setSemana,
    inventario, alimentos, searchTerm, setSearchTerm,
    showReproceso, setShowReproceso, showPrestamo, setShowPrestamo,
    formData, setFormData, expandedRow, detalles, loadingDetalles,
    opsPendientes, showHistorial, setShowHistorial, historial,
    loadData, openReprocesoModal, handleReproceso, openPrestamoModal,
    openHistorial, handlePrestamo, handleTogglePin, handleRowClick,
    activeGroup, setActiveGroup, showAddRefModal, setShowAddRefModal, setGrupoSel, handleReversarPrestamo, handleReversarReproceso,
    showBodegaReprocesos, setShowBodegaReprocesos, bodegaReprocesos, openBodegaReprocesos
  } = useInventarioPT();

  // Search local en el Modal de añadir referencia
  const [addRefSearch, setAddRefSearch] = useState('');

  const baseGroups = useMemo(() => {
    const baseGroupsSet = new Set<string>();
    grupos.forEach(g => baseGroupsSet.add(g.split('|')[0]));
    inventario.forEach(i => baseGroupsSet.add(i.grupo.split('|')[0]));
    return Array.from(baseGroupsSet).sort();
  }, [inventario, grupos]);

  useEffect(() => {
    if (!activeGroup && baseGroups.length > 0) {
      setActiveGroup(baseGroups[0]);
    }
  }, [baseGroups, activeGroup, setActiveGroup]);

  const activeGroupRows = useMemo(() => {
    if (!activeGroup) return [];
    
    const rows: DisplayRow[] = [];
    const st = searchTerm.toLowerCase();

    for (const a of alimentos) {
      const invs = inventario.filter(i => i.codigo_sap === a.codigo_sap && i.grupo.startsWith(activeGroup));
      const text = `${a.codigo_sap} ${a.descripcion}`.toLowerCase();
      
      if (st && !text.includes(st)) continue;
      
      if (invs.length > 0) {
        for (const inv of invs) {
          const isEspecial = inv.grupo.includes('|');
          const isPinned = inv.isFijo || false;
          const isAllZeros = (inv.inventario_inicial || 0) === 0 && (inv.producido || 0) === 0 && (inv.despachado || 0) === 0 && (inv.saldo_actual || 0) === 0;
          
          if (!st && !isEspecial && !isPinned && isAllZeros) continue;

          const especialText = isEspecial ? inv.grupo.split('|')[1] : '';
          rows.push({ ...a, inv, isEspecial, especialText, rowKey: `${inv.grupo}|${a.codigo_sap}`, grp: inv.grupo });
        }
      }
    }
    
    return rows;
  }, [inventario, alimentos, searchTerm, activeGroup]);

  // Alimentos para el Modal de Agregar
  const addRefOptions = useMemo(() => {
    const st = addRefSearch.toLowerCase();
    return alimentos.filter(a => `${a.codigo_sap} ${a.descripcion}`.toLowerCase().includes(st)).slice(0, 50); // limit for perf
  }, [alimentos, addRefSearch]);

  const totalItems = inventario.length;
  const itemsBajoCero = inventario.filter(i => (i.saldo_actual || 0) < 0).length;

  return (
    <div style={{ marginTop: 16 }}>
      {/* HEADER TIPO DASHBOARD */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-color)', margin: 0 }}>Dashboard de Inventario PT</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Cálculo automatizado desde el historial de movimientos.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-color)', padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: 8 }}>Semana ISO:</span>
            <input type="number" className="form-input btn-sm" style={{ width: 70, border: 'none', background: 'transparent', padding: 0 }} value={semana} onChange={e => setSemana(Number(e.target.value))} />
          </div>
          <button className="btn btn-primary" onClick={loadData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={16} className={loading ? 'spinning' : ''} /> {loading ? 'Calculando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* KPIs Rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 16, borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>Total Referencias Activas</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-color)' }}>{totalItems}</div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: '4px solid var(--color-error)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>Referencias en Negativo</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-error)' }}>{itemsBajoCero}</div>
        </div>
      </div>

      {/* SPLIT VIEW LAYOUT */}
      <div style={{ display: 'flex', gap: 20, minHeight: '600px' }}>
        
        {/* SIDEBAR DE GRUPOS */}
        <div style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-muted)', paddingBottom: 8, borderBottom: '1px solid var(--border-color)', marginBottom: 8 }}>Grupos de Inventario</div>
          {baseGroups.map(bg => {
            const isActive = activeGroup === bg;
            return (
              <button 
                key={bg} 
                onClick={() => setActiveGroup(bg)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  backgroundColor: isActive ? 'var(--color-primary)' : 'var(--card-bg)',
                  color: isActive ? 'white' : 'var(--text-color)',
                  boxShadow: isActive ? '0 4px 6px rgba(var(--color-primary-rgb), 0.3)' : '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'all 0.2s ease', fontWeight: isActive ? 600 : 500,
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={18} opacity={isActive ? 1 : 0.6} />
                  <span>{bg}</span>
                </div>
                <ChevronRight size={16} opacity={isActive ? 1 : 0.3} />
              </button>
            )
          })}
        </div>

        {/* TABLA PRINCIPAL DEL GRUPO ACTIVO */}
        <div className="card" style={{ flex: 1, overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', display: 'flex', flexDirection: 'column' }}>
          
          <div className="card-header" style={{ backgroundColor: 'rgba(var(--color-primary-rgb), 0.03)', borderBottom: '1px solid var(--border-color)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-primary)' }}>{activeGroup}</h3>
              <span style={{ background: 'var(--bg-color)', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--border-color)' }}>{activeGroupRows.length} ítems</span>
            </div>
            
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="search-box" style={{ width: 250, background: 'var(--bg-color)' }}>
                <Search size={16} />
                <input type="text" className="form-input btn-sm" placeholder="Buscar en tabla..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ paddingLeft: 32, border: '1px solid var(--border-color)' }} />
              </div>

              {canEdit && activeGroup && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => { setGrupoSel(activeGroup); setAddRefSearch(''); setShowAddRefModal(true); }} title="Fijar un nuevo alimento a este grupo">
                    <Plus size={14} /> Añadir Ref.
                  </button>
                  <div style={{ width: 1, height: 24, background: 'var(--border-color)', margin: '0 4px' }}></div>
                  <button className="btn btn-outline btn-sm" onClick={() => openBodegaReprocesos()} title="Ver Bultos en Reproceso Disponibles">
                    <Package size={14} /> Bodega Reprocesos
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => openHistorial(activeGroup)} title="Ver Historial del Grupo"><History size={14} /> Historial</button>
                  <button className="btn btn-danger btn-sm" onClick={() => openReprocesoModal(activeGroup)} title="Registrar Reproceso para este Grupo"><AlertTriangle size={14} /></button>
                  <button className="btn btn-warning btn-sm" onClick={() => openPrestamoModal(activeGroup)} title="Realizar Préstamo"><ArrowRightLeft size={14} /></button>
                </>
              )}
            </div>
          </div>
          
          <div className="data-table-wrapper" style={{ flex: 1, overflowY: 'auto' }}>
            <table className="data-table" style={{ margin: 0 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--card-bg)' }}>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th style={{ width: 40 }}></th>
                  <th style={{ width: 90 }}>Código SAP</th>
                  <th>Referencia</th>
                  <th style={{ textAlign: 'right', width: 100 }}>Inv. Inicial</th>
                  <th style={{ textAlign: 'right', color: 'var(--color-success)', width: 100 }}>+ Producido</th>
                  <th style={{ textAlign: 'right', color: 'var(--color-info)', width: 100 }}>+ Recibido</th>
                  <th style={{ textAlign: 'right', color: 'var(--color-warning)', width: 100 }}>- Despachado</th>
                  <th style={{ textAlign: 'right', color: 'var(--color-error)', width: 100 }}>- Prestado</th>
                  <th style={{ textAlign: 'right', color: '#e74c3c', width: 100 }}>- Reproceso</th>
                  <th style={{ textAlign: 'right', fontWeight: 800, width: 110 }}>Saldo Actual</th>
                </tr>
              </thead>
              <tbody>
                {activeGroupRows.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay inventario activo en este grupo que coincida con la búsqueda.</td></tr>
                )}
                {activeGroupRows.map(r => {
                  const isPinned = r.inv?.isFijo || false;
                  const isExpanded = expandedRow === r.rowKey;
                  const inicial = r.inv?.inventario_inicial || 0;
                  const saldo = r.inv?.saldo_actual || 0;

                  return (
                    <React.Fragment key={r.rowKey}>
                      <tr 
                        className={isExpanded ? 'expanded-row-active' : ''} 
                        onClick={() => handleRowClick(r.grp, r.codigo_sap)}
                        style={{ cursor: 'pointer', backgroundColor: isExpanded ? 'rgba(var(--color-primary-rgb), 0.05)' : '' }}
                      >
                        <td style={{ color: 'var(--color-primary)' }}>
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </td>
                        <td>
                          <button 
                            className={`btn-icon ${isPinned ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleTogglePin(r.grp, r.codigo_sap, isPinned); }}
                            title={isPinned ? 'Desfijar Referencia' : 'Fijar Referencia para este Cliente'}
                            style={{ color: isPinned ? 'var(--color-warning)' : 'var(--text-muted)', background: 'none', border: 'none', padding: 4 }}
                          >
                            {isPinned ? <Pin size={16} fill="currentColor" /> : <PinOff size={16} />}
                          </button>
                        </td>
                        <td style={{ fontWeight: 500, color: 'var(--text-muted)' }}>{r.codigo_sap}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 500 }}>{r.descripcion}</span>
                            {r.isEspecial && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600, marginTop: 2, background: 'rgba(var(--color-primary-rgb), 0.1)', padding: '2px 6px', borderRadius: 4, width: 'fit-content' }}>
                                Especial: {r.especialText}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>{inicial}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: 500 }}>{r.inv?.producido || 0}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-info)', fontWeight: 500 }}>{r.inv?.recibido || 0}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-warning)', fontWeight: 500 }}>{r.inv?.despachado || 0}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-error)', fontWeight: 500 }}>{r.inv?.prestado || 0}</td>
                        <td style={{ textAlign: 'right', color: '#e74c3c', fontWeight: 500 }}>{r.inv?.reproceso || 0}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: saldo < 0 ? 'var(--color-error)' : (saldo > 0 ? 'var(--color-success)' : 'var(--text-color)'), fontSize: '1.05rem' }}>
                          {saldo}
                        </td>
                      </tr>
                    
                    {isExpanded && (
                      <tr>
                        <td colSpan={11} style={{ padding: 0, backgroundColor: 'rgba(0,0,0,0.02)' }}>
                          <div style={{ padding: '16px 40px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            {loadingDetalles ? (
                              <div style={{ padding: 20, textAlign: 'center', width: '100%', color: 'var(--text-muted)' }}>Cargando desglose de la semana...</div>
                            ) : (
                              (() => {
                                const entradas = !detalles ? [] : [
                                  ...((detalles as any).saldos_anteriores || []).map((s: any) => ({ fecha: s.fecha, tipo: 'Saldo Anterior', desc: `OP ${s.lote} (Remanente de semanas previas)`, cant: s.bultos })),
                                  ...detalles.produccion.map(p => ({ fecha: p.fecha_produccion, tipo: 'Producción', desc: `OP ${p.lote} (Turno ${p.turno})`, cant: p.bultos_entregados })),
                                  ...detalles.prestamos.filter(p => p.tipo === 'RECIBIDO').map(p => ({ fecha: p.fecha, tipo: p.estado === 'COMPENSADO' ? 'Préstamo Recibido (Compensado)' : p.estado === 'DEFINITIVO' ? 'Cesión Recibida' : 'Préstamo Recibido', desc: `De: ${p.contraparte}${p.motivo ? ` (${p.motivo.split('|')[0].trim()})` : ''}`, cant: p.cantidad })),
                                  ...detalles.prestamos.filter(p => p.tipo === 'PRESTADO' && p.cantidad_compensada > 0).map(p => {
                                    const repuesto = p.motivo ? p.motivo.split('|').find(m => m.includes('Repuesto'))?.trim() : '';
                                    return { fecha: p.compensado_at || p.fecha, tipo: 'Préstamo Recuperado', desc: `De: ${p.contraparte} (Devolución)${repuesto ? ` - ${repuesto}` : ''}`, cant: p.cantidad_compensada };
                                  })
                                ].sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

                                const salidas = !detalles ? [] : [
                                  ...detalles.despachos.map(d => ({ fecha: d.fecha, tipo: 'Despacho', desc: `Remisión ${d.remision} | OP ${d.lote} | Placa ${d.placa}`, cant: d.bultos_despachados })),
                                  ...detalles.prestamos.filter(p => p.tipo === 'PRESTADO').map(p => ({ fecha: p.fecha, tipo: p.estado === 'COMPENSADO' ? 'Préstamo Otorgado (Compensado)' : p.estado === 'DEFINITIVO' ? 'Cesión Otorgada' : 'Préstamo Otorgado', desc: `Hacia: ${p.contraparte}${p.motivo ? ` (${p.motivo.split('|')[0].trim()})` : ''}`, cant: p.cantidad })),
                                  ...detalles.prestamos.filter(p => p.tipo === 'RECIBIDO' && p.cantidad_compensada > 0).map(p => {
                                    const repuesto = p.motivo ? p.motivo.split('|').find(m => m.includes('Repuesto'))?.trim() : '';
                                    return { fecha: p.compensado_at || p.fecha, tipo: 'Pago de Préstamo', desc: `Hacia: ${p.contraparte} (Reposición)${repuesto ? ` - ${repuesto}` : ''}`, cant: p.cantidad_compensada };
                                  }),
                                  ...((detalles as any).reprocesos || []).map((r: any) => ({ fecha: r.fecha, tipo: 'Reproceso (Baja)', desc: r.motivo, cant: r.cantidad }))
                                ].sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

                                return (
                                  <>
                                    {/* TABLA ENTRADAS */}
                                    <div style={{ flex: 1, minWidth: 300, backgroundColor: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                      <div style={{ padding: '10px 14px', backgroundColor: 'rgba(var(--color-success-rgb), 0.1)', fontWeight: 600, borderBottom: '1px solid var(--border-color)', color: 'var(--color-success)', fontSize: '0.9rem' }}>
                                        Entradas (+)
                                      </div>
                                      <table className="data-table" style={{ margin: 0, fontSize: '0.85rem' }}>
                                        <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle / Referencia</th><th style={{textAlign:'right'}}>Bultos</th></tr></thead>
                                        <tbody>
                                          {entradas.length === 0 && <tr><td colSpan={4} style={{textAlign:'center', color:'var(--text-muted)'}}>No hay entradas registradas</td></tr>}
                                          {entradas.map((e, idx) => (
                                            <tr key={idx}>
                                              <td>{e.fecha}</td>
                                              <td style={{ fontWeight: 500, color: 'var(--color-success)' }}>{e.tipo}</td>
                                              <td style={{ fontSize: '0.8rem' }}>{e.desc}</td>
                                              <td style={{textAlign:'right', fontWeight:600, color: 'var(--color-success)'}}>+{e.cant}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>

                                    {/* TABLA SALIDAS */}
                                    <div style={{ flex: 1, minWidth: 300, backgroundColor: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                      <div style={{ padding: '10px 14px', backgroundColor: 'rgba(var(--color-error-rgb), 0.1)', fontWeight: 600, borderBottom: '1px solid var(--border-color)', color: 'var(--color-error)', fontSize: '0.9rem' }}>
                                        Salidas (-)
                                      </div>
                                      <table className="data-table" style={{ margin: 0, fontSize: '0.85rem' }}>
                                        <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle / Referencia</th><th style={{textAlign:'right'}}>Bultos</th></tr></thead>
                                        <tbody>
                                          {salidas.length === 0 && <tr><td colSpan={4} style={{textAlign:'center', color:'var(--text-muted)'}}>No hay salidas registradas</td></tr>}
                                          {salidas.map((s, idx) => (
                                            <tr key={idx}>
                                              <td>{s.fecha}</td>
                                              <td style={{ fontWeight: 500, color: 'var(--color-error)' }}>{s.tipo}</td>
                                              <td style={{ fontSize: '0.8rem' }}>{s.desc}</td>
                                              <td style={{textAlign:'right', fontWeight:600, color: 'var(--color-error)'}}>-{s.cant}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                );
                              })()
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* MODAL AÑADIR REFERENCIA A GRUPO */}
      {showAddRefModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 600, padding: 24, borderRadius: 12, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={20} className="text-primary" /> Añadir Referencia a {grupoSel}
            </h3>
            
            <div className="search-box" style={{ background: 'var(--bg-color)', marginBottom: 16 }}>
              <Search size={18} />
              <input 
                type="text" className="form-input" placeholder="Buscar alimento para fijar..." 
                value={addRefSearch} onChange={e => setAddRefSearch(e.target.value)} 
                style={{ paddingLeft: 36, border: '1px solid var(--border-color)' }} autoFocus
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
              <table className="data-table" style={{ margin: 0, fontSize: '0.9rem' }}>
                <thead style={{ background: 'var(--bg-color)', position: 'sticky', top: 0, zIndex: 1 }}><tr><th style={{width: 80}}>SAP</th><th>Descripción</th><th style={{width: 100, textAlign: 'center'}}>Acción</th></tr></thead>
                <tbody>
                  {addRefOptions.map(a => (
                    <tr key={a.codigo_sap}>
                      <td>{a.codigo_sap}</td>
                      <td>{a.descripcion}</td>
                      <td style={{textAlign: 'center'}}>
                        <button className="btn btn-primary btn-sm" onClick={() => {
                          handleTogglePin(grupoSel, a.codigo_sap, false);
                          setShowAddRefModal(false);
                        }}>Fijar</button>
                      </td>
                    </tr>
                  ))}
                  {addRefOptions.length === 0 && <tr><td colSpan={3} style={{textAlign: 'center', padding: 20}}>No hay resultados</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setShowAddRefModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REPROCESO */}
      {showReproceso && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 450, padding: 24, borderRadius: 12 }}>
            <h3 style={{ marginBottom: 20, color: 'var(--text-color)' }}>Registrar Reproceso</h3>
            <form onSubmit={handleReproceso}>
              <div className="form-group">
                <label className="form-label">Grupo Afectado</label>
                <input type="text" className="form-input" disabled value={grupoSel} style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-muted)' }} />
              </div>
              <div className="form-group">
                <label className="form-label">OP a Reprocesar (Origen físico)</label>
                <select className="form-input" required value={formData.op_origen || ''} onChange={e => {
                  const op = opsPendientes.find(o => o.lote == Number(e.target.value));
                  setFormData({...formData, op_origen: e.target.value, codigo_sap: op ? String(op.codigo_sap) : ''});
                }}>
                  <option value="">— Seleccionar OP con saldo disponible —</option>
                  {opsPendientes.map(o => (
                    <option key={o.lote} value={o.lote}>OP {o.lote} - {o.maestro_alimentos?.descripcion} ({o.bultos_disponibles} bt disponibles)</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Alimento</label>
                <select className="form-input" required value={formData.codigo_sap || ''} disabled style={{ backgroundColor: 'var(--bg-color)' }}>
                  <option value="">— Seleccionado automáticamente —</option>
                  {alimentos.map(a => <option key={a.codigo_sap} value={a.codigo_sap}>{a.descripcion}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cantidad (Bultos)</label>
                <input type="number" className="form-input" required min={1} value={formData.cantidad || ''} onChange={e => setFormData({...formData, cantidad: e.target.value})} placeholder="Ej. 10" />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 6, display: 'block' }}>
                  No puede exceder el inventario físico real disponible en la OP seleccionada.
                </small>
              </div>
              <div className="form-group">
                <label className="form-label">Motivo de Reproceso</label>
                <input type="text" className="form-input" required value={formData.motivo || ''} onChange={e => setFormData({...formData, motivo: e.target.value})} placeholder="Ej. Empaque roto, mezcla húmeda..." />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowReproceso(false)}>Cancelar</button>
                <button type="submit" className="btn btn-danger" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><AlertTriangle size={16} /> Confirmar Reproceso</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRÉSTAMO */}
      {showPrestamo && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 450, padding: 24, borderRadius: 12 }}>
            <h3 style={{ marginBottom: 20, color: 'var(--text-color)' }}>Préstamo de Inventario</h3>
            <form onSubmit={handlePrestamo}>
              <div className="form-group">
                <label className="form-label">Origen (Se descuenta de)</label>
                <input type="text" className="form-input" disabled value={grupoSel} style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-muted)' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Destino (Se presta a)</label>
                <select className="form-input" required value={formData.grupo_destino || ''} onChange={e => setFormData({...formData, grupo_destino: e.target.value})}>
                  <option value="">— Seleccionar Grupo Destino —</option>
                  {grupos.filter(g => g !== grupoSel).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">OP Prestada (Salida Física)</label>
                <select className="form-input" required value={formData.op_origen || ''} onChange={e => setFormData({...formData, op_origen: e.target.value})}>
                  <option value="">— Seleccionar OP con Inventario —</option>
                  {opsPendientes.map(o => (
                    <option key={o.lote} value={o.lote}>OP {o.lote} - {o.maestro_alimentos?.descripcion} ({o.bultos_disponibles !== undefined ? o.bultos_disponibles : o.bultos_programados} bt disponibles)</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cantidad a Prestar (Bultos)</label>
                <input type="number" className="form-input" required min={1} value={formData.cantidad || ''} onChange={e => setFormData({...formData, cantidad: e.target.value})} placeholder="Ej. 50" />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 6, display: 'block' }}>
                  No puede exceder el inventario físico real disponible en la OP seleccionada.
                </small>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                <input type="checkbox" id="es_definitivo" checked={formData.es_definitivo || false} onChange={e => setFormData({...formData, es_definitivo: e.target.checked})} style={{ width: 16, height: 16 }} />
                <label htmlFor="es_definitivo" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Es Cesión Definitiva (No requiere reposición)</label>
              </div>
              <div style={{ marginTop: 16, marginBottom: 16, padding: '12px 16px', background: formData.es_definitivo ? 'rgba(var(--color-primary-rgb), 0.1)' : 'rgba(var(--color-success-rgb), 0.1)', borderRadius: 8, border: `1px solid ${formData.es_definitivo ? 'rgba(var(--color-primary-rgb), 0.3)' : 'rgba(var(--color-success-rgb), 0.3)'}` }}>
                <small style={{ color: formData.es_definitivo ? 'var(--color-primary)' : 'var(--color-success)', fontSize: '0.8rem', display: 'block', fontWeight: 500 }}>
                  {formData.es_definitivo ? 
                    `Cesión Definitiva: El alimento se cede a ${formData.grupo_destino || 'destino'}. NO se repondrá automáticamente el inventario.` : 
                    `Repunte Automático Activado: El préstamo se repondrá automáticamente tan pronto se registre cualquier producción de este alimento para el grupo ${grupoSel}.`}
                </small>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowPrestamo(false)}>Cancelar</button>
                <button type="submit" className="btn btn-warning" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><ArrowRightLeft size={16} /> Crear Préstamo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HISTORIAL DE MOVIMIENTOS */}
      {showHistorial && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 800, padding: 24, maxHeight: '85vh', overflowY: 'auto', borderRadius: 12 }}>
            <h3 style={{ marginBottom: 20, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={20} /> Historial de Movimientos — <span style={{ color: 'var(--color-primary)' }}>{grupoSel}</span>
            </h3>
            
            {/* Reprocesos */}
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ margin: '0 0 12px', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={16} /> Reprocesos</h4>
              {historial.reprocesos.length === 0 ? (
                <div style={{ padding: '16px', background: 'var(--bg-color)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>Sin reprocesos registrados</div>
              ) : (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
                  <table className="data-table" style={{ fontSize: '0.85rem', margin: 0 }}>
                    <thead style={{ background: 'var(--bg-color)' }}><tr><th>Fecha</th><th>SAP</th><th style={{textAlign: 'right'}}>Cantidad</th><th>Motivo</th><th>Registrado por</th><th style={{textAlign: 'center'}}>Acciones</th></tr></thead>
                    <tbody>
                      {historial.reprocesos.map((r: HistorialReproceso) => (
                        <tr key={r.id}>
                          <td>{r.fecha}</td>
                          <td style={{ fontWeight: 500 }}>{r.codigo_sap}</td>
                          <td style={{ fontWeight: 600, color: 'var(--color-error)', textAlign: 'right' }}>-{r.cantidad}</td>
                          <td>{r.motivo}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{r.created_by}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--color-error)', borderColor: 'rgba(var(--color-error-rgb), 0.3)', padding: '4px 8px' }} onClick={() => handleReversarReproceso(r.id, r.motivo)} title="Reversar Reproceso (Eliminar)">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Préstamos */}
            <div>
              <h4 style={{ margin: '0 0 12px', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: 6 }}><ArrowRightLeft size={16} /> Préstamos</h4>
              {historial.prestamos.length === 0 ? (
                <div style={{ padding: '16px', background: 'var(--bg-color)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>Sin préstamos registrados</div>
              ) : (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
                  <table className="data-table" style={{ fontSize: '0.85rem', margin: 0 }}>
                    <thead style={{ background: 'var(--bg-color)' }}><tr><th>Fecha</th><th>Origen → Destino</th><th>SAP</th><th style={{textAlign: 'right'}}>Prestado</th><th style={{textAlign: 'right'}}>Compensado</th><th>Estado</th><th>OP Comp.</th><th style={{textAlign: 'center'}}>Acciones</th></tr></thead>
                    <tbody>
                      {historial.prestamos.map((p: HistorialPrestamo) => (
                        <tr key={p.id}>
                          <td>{p.fecha?.split('T')[0] || p.created_at?.split('T')[0]}</td>
                          <td style={{ fontSize: '0.8rem', fontWeight: 500 }}>{p.grupo_origen} → {p.grupo_destino}</td>
                          <td>{p.codigo_sap}</td>
                          <td style={{ fontWeight: 600, textAlign: 'right' }}>{p.cantidad}</td>
                          <td style={{ textAlign: 'right', color: p.cantidad_compensada === p.cantidad ? 'var(--color-success)' : 'var(--text-color)' }}>{p.cantidad_compensada || 0}</td>
                          <td>
                            <span style={{
                              padding: '4px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600,
                              background: p.estado === 'COMPENSADO' ? 'rgba(var(--color-success-rgb), 0.1)' : p.estado === 'DEFINITIVO' ? 'rgba(var(--color-primary-rgb), 0.1)' : p.estado === 'PARCIAL' ? 'rgba(var(--color-warning-rgb), 0.1)' : 'rgba(var(--color-error-rgb), 0.1)',
                              color: p.estado === 'COMPENSADO' ? 'var(--color-success)' : p.estado === 'DEFINITIVO' ? 'var(--color-primary)' : p.estado === 'PARCIAL' ? 'var(--color-warning)' : 'var(--color-error)'
                            }}>
                              {p.estado === 'DEFINITIVO' ? 'CEDIDO' : p.estado}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{p.op_compensacion || '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {p.cantidad_compensada === 0 && (
                              <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--color-error)', borderColor: 'rgba(var(--color-error-rgb), 0.3)', padding: '4px 8px' }} onClick={() => handleReversarPrestamo(p.id, p.motivo || '', p.grupo_destino)} title="Reversar Préstamo (Eliminar)">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="btn btn-outline" onClick={() => setShowHistorial(false)}>Cerrar Historial</button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL BODEGA DE REPROCESOS */}
      {showBodegaReprocesos && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" style={{ width: 800, padding: 24, maxHeight: '85vh', overflowY: 'auto', borderRadius: 12 }}>
            <h3 style={{ marginBottom: 20, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={20} className="text-primary" /> Bodega Global de Reprocesos
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>
              Este inventario muestra los bultos dados de baja por reproceso que <strong>aún no han sido consumidos</strong> en una nueva orden de producción.
            </p>

            {bodegaReprocesos.length === 0 ? (
              <div style={{ padding: '24px', background: 'var(--bg-color)', borderRadius: 8, color: 'var(--text-muted)', textAlign: 'center' }}>
                No hay bultos de reproceso disponibles en este momento.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
                <table className="data-table" style={{ margin: 0, fontSize: '0.9rem' }}>
                  <thead style={{ background: 'var(--bg-color)' }}>
                    <tr>
                      <th>OP Origen</th>
                      <th>Grupo</th>
                      <th>SAP</th>
                      <th style={{ textAlign: 'right' }}>Enviado a Baja</th>
                      <th style={{ textAlign: 'right' }}>Reutilizado</th>
                      <th style={{ textAlign: 'right', color: 'var(--color-primary)' }}>Saldo Disponible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bodegaReprocesos.map((b) => (
                      <tr key={b.lote}>
                        <td style={{ fontWeight: 600 }}>OP {b.lote}</td>
                        <td style={{ fontSize: '0.85rem' }}>{b.grupo}</td>
                        <td style={{ fontSize: '0.85rem' }}>{b.codigo_sap}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-error)' }}>{b.enviado} bt</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>{b.consumido} bt</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-primary)' }}>{b.disponible} bt</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="btn btn-outline" onClick={() => setShowBodegaReprocesos(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
