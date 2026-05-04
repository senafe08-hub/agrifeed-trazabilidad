import { useState, useRef, Fragment } from 'react';
import {
  Package, ArrowDownCircle, ArrowUpCircle, BookOpen,
  Search, Plus, Trash2, Download, Upload,
  AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp, Calendar, Edit2
} from 'lucide-react';

import type { 
  InventarioMaterial, InventarioEntradaRow, InventarioTrasladoRow
} from '../lib/types';
import { useInventarioMP, MESES, ITEMS_PER_PAGE } from '../hooks/useInventarioMP';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import '../styles/inventario.css';

const MaterialSearchSelect = ({ value, onChange, materiales }: { value: string | number; onChange: (id: number) => void; materiales: InventarioMaterial[] }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const m = materiales.find((x) => x.id === Number(value));
  const display = m ? `${m.codigo} — ${m.nombre}` : '';

  const filtered = materiales.filter((x) => 
    String(x.codigo).includes(search) || x.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ position: 'relative' }}>
      <input 
        className="form-input" 
        value={open ? search : display}
        placeholder={display || 'Buscar o seleccionar...'}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', borderColor: open ? '#43A047' : 'var(--border-color)', background: '#fff' }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '6px', maxHeight: 220, overflowY: 'auto', zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          {filtered.length === 0 ? <div style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>No hay resultados</div> :
          filtered.map((x) => (
            <div 
              key={x.id} 
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem', color: 'var(--text-primary)', backgroundColor: '#ffffff' }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(46, 125, 50, 0.08)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
              onMouseDown={() => { onChange(x.id); setOpen(false); }}
            >
              <strong>{x.codigo}</strong> — {x.nombre}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// MESES is imported from useInventarioMP

interface Props { canEdit: boolean; }

export default function InventarioMPPanel({ canEdit }: Props) {
  const {
    activeTab, setActiveTab,
    mes, setMes, anio, setAnio,
    loadingPanel, panelSearch, setPanelSearch, expandedPanel, 
    historicoData, loadingHistorico, lotesActivos, loadingLotes, kpiFilter, setKpiFilter,
    panelKpis, filteredPanel, exportPanelExcel, handleExpandPanel, loadPanel,
    loadingEntradas, showEntradaForm, setShowEntradaForm, entradaForm, setEntradaForm,
    entradasSearch, setEntradasSearch, entradasPage, setEntradasPage,
    filteredEntradas, handleSaveEntrada, handleDeleteEntrada,
    loadingTraslados, showTrasladoForm, setShowTrasladoForm, trasladoForm, setTrasladoForm,
    trasladosSearch, setTrasladosSearch, trasladosPage, setTrasladosPage,
    expandedTraslados, handleExpandTraslado, trasladoLotesData, loadingTrasladoLotes,
    filteredTraslados, handleSaveTraslado, handleDeleteTraslado,
    materiales, loadingMat, showMatForm, setShowMatForm, matForm, setMatForm,
    matSearch, setMatSearch, matPage, setMatPage,
    filteredMat, handleSaveMat, handleDeleteMat, handleImportMateriales, exportMatExcel,
    loadingStock, stockSearch, setStockSearch,
    filteredStock, dirtyCount, handleStockChange, handleSaveStock, handleImportStock,
  } = useInventarioMP();

  const fileRef = useRef<HTMLInputElement>(null);

  // ═══════════════════════════════════════════════════════
  //  MES SELECTOR
  // ═══════════════════════════════════════════════════════
  const MesSelector = () => (
    <div className="inv-mes-selector">
      <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
      <select value={mes} onChange={e => setMes(Number(e.target.value))}>
        {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))} style={{ width: 70 }} min={2024} max={2030} />
    </div>
  );

  const renderCobertura = (val: number | null, minCob: number) => {
    if (val === null) return <span className="cobertura-badge sin-ref">— Sin ref.</span>;
    if (val < minCob) return <span className="cobertura-badge critico">🔴 {val.toFixed(1)} sem</span>;
    if (val < minCob + 2) return <span className="cobertura-badge alerta">🟡 {val.toFixed(1)} sem</span>;
    return <span className="cobertura-badge ok">🟢 {val.toFixed(1)} sem</span>;
  };

  const renderPendiente = (val: number) => {
    if (val > 0) return <span className="pendiente-badge needs">{val.toLocaleString('es-CO', { maximumFractionDigits: 0 })} kg</span>;
    return <span className="pendiente-badge ok">—</span>;
  };

  // ═══════════════════════════════════════════════════════
  //  TAB: PANEL CONSOLIDADO
  // ═══════════════════════════════════════════════════════
  const renderPanelTab = () => (
    <>
      <div className="inv-kpi-strip">
        <div className={`inv-kpi ${kpiFilter === 'all' ? 'active' : ''}`} onClick={() => setKpiFilter('all')}><div className="inv-kpi-icon total"><Package size={20} /></div><div className="inv-kpi-info"><span className="inv-kpi-label">Materiales</span><span className="inv-kpi-value">{panelKpis.total}</span></div></div>
        <div className={`inv-kpi ${kpiFilter === 'critico' ? 'active' : ''}`} onClick={() => setKpiFilter('critico')}><div className="inv-kpi-icon alert"><AlertTriangle size={20} /></div><div className="inv-kpi-info"><span className="inv-kpi-label">Críticos (&lt;2 sem)</span><span className="inv-kpi-value">{panelKpis.criticos}</span></div></div>
        <div className={`inv-kpi ${kpiFilter === 'alerta' ? 'active' : ''}`} onClick={() => setKpiFilter('alerta')}><div className="inv-kpi-icon warn"><Clock size={20} /></div><div className="inv-kpi-info"><span className="inv-kpi-label">Alerta (2-4 sem)</span><span className="inv-kpi-value">{panelKpis.alertas}</span></div></div>
        <div className={`inv-kpi ${kpiFilter === 'ok' ? 'active' : ''}`} onClick={() => setKpiFilter('ok')}><div className="inv-kpi-icon ok"><CheckCircle size={20} /></div><div className="inv-kpi-info"><span className="inv-kpi-label">OK (&gt;4 sem)</span><span className="inv-kpi-value">{panelKpis.ok}</span></div></div>
      </div>
      <div className="inv-toolbar">
        <div className="inv-toolbar-left">
          <MesSelector />
          <div className="search-box"><Search size={18} /><input type="text" className="form-input" placeholder="Buscar material..." value={panelSearch} onChange={e => setPanelSearch(e.target.value)} style={{ paddingLeft: 40, width: 260 }} /></div>
        </div>
        <div className="inv-toolbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => loadPanel(true)} disabled={loadingPanel}>{loadingPanel ? '⏳' : '🔄'} Recalcular</button>
          <button className="btn btn-outline btn-sm" onClick={exportPanelExcel}><Download size={16} /> Excel</button>
        </div>
      </div>
      <div className="card"><div className="card-body p-0"><div className="data-table-wrapper overflow-x-auto">
        <table className="data-table w-full">
          <thead><tr>
            <th style={{ width: 30 }}></th>
            <th style={{ width: 80 }}>Código</th>
            <th>Material</th>
            <th style={{ textAlign: 'right' }}>Stock Ini.</th>
            <th style={{ textAlign: 'right' }}>Entradas</th>
            <th style={{ textAlign: 'right' }}>Traslados</th>
            <th style={{ textAlign: 'right', fontWeight: 700 }}>Stock Final</th>
            <th style={{ textAlign: 'center' }}>Vencimiento</th>
            <th style={{ textAlign: 'right' }}>Est. Mes</th>
            <th style={{ textAlign: 'center' }}>Cobertura</th>
            <th style={{ textAlign: 'right' }}>Pend. Ingresar</th>
          </tr></thead>
          <tbody>
            {loadingPanel ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32 }}>⏳ Calculando inventario...</td></tr>
            ) : filteredPanel.length === 0 ? (
              <tr><td colSpan={10}><div className="empty-state"><Package size={48} /><p><strong>Sin datos de inventario</strong></p><p>Configura el stock inicial en la pestaña "Stock Inicial"</p></div></td></tr>
            ) : filteredPanel.map(r => {
              const isExp = expandedPanel.has(r.material_id);
              return (
                <> 
                  <tr key={r.material_id} onClick={() => handleExpandPanel(r.material_id)} style={{ cursor: 'pointer' }}>
                    <td>{isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{r.codigo}</td>
                    <td style={{ fontWeight: 600 }}>{r.nombre}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{r.stock_inicial.toLocaleString('es-CO')}</td>
                    <td style={{ textAlign: 'right', color: '#1565C0' }}>{r.entradas > 0 ? `+${r.entradas.toLocaleString('es-CO')}` : '—'}</td>
                    <td style={{ textAlign: 'right', color: '#C62828' }}>{r.traslados > 0 ? `−${r.traslados.toLocaleString('es-CO')}` : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1.05rem' }}>{r.stock_final.toLocaleString('es-CO')}</td>
                    <td style={{ textAlign: 'center' }}>
                      {r.proximo_vencimiento ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', color: (r.dias_vencimiento ?? 0) < 0 ? '#D32F2F' : (r.dias_vencimiento ?? 0) <= 30 ? '#F57C00' : 'var(--text-muted)' }}>
                            {r.proximo_vencimiento}
                          </span>
                          {(r.dias_vencimiento ?? 0) < 0 ? (
                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#D32F2F', background: 'rgba(211,47,47,0.1)', padding: '2px 6px', borderRadius: 10 }}>Vencido</span>
                          ) : (
                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: (r.dias_vencimiento ?? 0) <= 30 ? '#F57C00' : '#4CAF50', background: (r.dias_vencimiento ?? 0) <= 30 ? 'rgba(245,124,0,0.1)' : 'rgba(76,175,80,0.1)', padding: '2px 6px', borderRadius: 10 }}>
                              {(r.dias_vencimiento ?? 0) === 0 ? 'Hoy' : `Faltan ${r.dias_vencimiento} días`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.consumo_estimado_mes.toLocaleString('es-CO')}</td>
                    <td style={{ textAlign: 'center' }}>{renderCobertura(r.semanas_cobertura, r.min_cobertura_semanas)}</td>
                    <td style={{ textAlign: 'center' }}>{renderPendiente(r.pendiente_ingresar)}</td>
                  </tr>
                  {isExp && (
                    <tr key={`exp-${r.material_id}`} style={{ background: 'rgba(46,125,50,0.03)' }}>
                      <td colSpan={11} style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 300px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Consumo Semanal (Mes Actual)</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                              {r.consumo_semana.map((val, i) => (
                                <div key={i} style={{ textAlign: 'center', padding: '8px 12px', background: val > 0 ? 'rgba(46,125,50,0.08)' : 'rgba(0,0,0,0.02)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>Semana {i+1}</div>
                                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{val > 0 ? val.toLocaleString('es-CO', { maximumFractionDigits: 0 }) : '—'}</div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>kg</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Consumo semanal estimado: <strong>{r.consumo_semanal.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg/sem</strong>
                              {r.peso_kg && <> · Peso por unidad: <strong>{r.peso_kg} kg</strong></>}
                            </div>
                          </div>
                          
                          <div style={{ flex: '1 1 350px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Tendencia Histórica OP (Últimos 6 meses)</div>
                            <div style={{ height: 160, background: '#fff', border: '1px solid var(--border-color)', borderRadius: 8, padding: '12px' }}>
                              {loadingHistorico[r.material_id] ? (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cargando datos históricos...</div>
                              ) : historicoData[r.material_id] && historicoData[r.material_id].length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={historicoData[r.material_id]} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e0e0e0' }} />
                                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} contentStyle={{ fontSize: '0.8rem', borderRadius: '4px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} formatter={(val: unknown) => [`${Number(val || 0).toLocaleString('es-CO')} kg`, 'Consumo']} labelStyle={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }} />
                                    <Bar dataKey="kg" fill="#43A047" radius={[4, 4, 0, 0]} barSize={32} />
                                  </BarChart>
                                </ResponsiveContainer>
                              ) : (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', fontSize: '0.85rem', color: 'var(--text-muted)' }}>No hay suficientes traslados históricos.</div>
                              )}
                            </div>
                          </div>

                          <div style={{ flex: '1 1 350px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Lotes Activos y Vencimientos</div>
                            <div style={{ height: 160, background: '#fff', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0', overflowY: 'auto' }}>
                              {loadingLotes[r.material_id] ? (
                                <div style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cargando lotes...</div>
                              ) : lotesActivos[r.material_id] && lotesActivos[r.material_id].length > 0 ? (
                                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                  <thead style={{ background: '#f5f5f5', position: 'sticky', top: 0 }}>
                                    <tr>
                                      <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Lote</th>
                                      <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Disp. (kg)</th>
                                      <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Vence</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lotesActivos[r.material_id]
                                      .filter((lote: any) => lote.fecha_vencimiento && !lote.fecha_vencimiento.startsWith('2099'))
                                      .map((lote: any) => {
                                      let statusColor = 'var(--text-primary)';
                                      let statusBg = 'transparent';
                                      let displayVencimiento = lote.fecha_vencimiento;
                                      const days = Math.ceil((new Date(lote.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                                      if (days < 0) { statusColor = '#D32F2F'; statusBg = 'rgba(211,47,47,0.08)'; } // Vencido
                                      else if (days <= 30) { statusColor = '#F57C00'; statusBg = 'rgba(245,124,0,0.08)'; } // Por vencer
                                      
                                      return (
                                        <tr key={lote.id} style={{ borderBottom: '1px solid var(--border-color)', background: statusBg }}>
                                          <td style={{ padding: '6px 12px', fontWeight: 500 }}>{lote.codigo_lote}</td>
                                          <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600 }}>{Number(lote.cantidad_disponible).toLocaleString('es-CO')}</td>
                                          <td style={{ padding: '6px 12px', textAlign: 'center', color: statusColor }}>{displayVencimiento}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              ) : (
                                <div style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>No hay lotes activos.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
        <div className="pagination"><span>Total: {filteredPanel.length} materiales</span></div>
      </div></div>
    </>
  );

  // ═══════════════════════════════════════════════════════
  //  TAB: ENTRADAS
  const renderEntradasTab = () => (
    <>
      <div className="inv-toolbar">
        <div className="inv-toolbar-left">
          <MesSelector />
          <div className="search-box"><Search size={18} /><input type="text" className="form-input" placeholder="Buscar material..." value={entradasSearch} onChange={e => { setEntradasSearch(e.target.value); setEntradasPage(1); }} style={{ paddingLeft: 40, width: 260 }} /></div>
        </div>
        <div className="inv-toolbar-right">
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setShowEntradaForm(true)}><Plus size={16} /> Nueva Entrada</button>}
        </div>
      </div>
      {showEntradaForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><span className="card-title">{entradaForm.id ? 'Editar Entrada' : 'Registrar Entrada'}</span><button className="btn btn-outline btn-sm" onClick={() => setShowEntradaForm(false)}>Cancelar</button></div>
          <div className="card-body"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div className="form-group"><label className="form-label">Fecha de Ingreso</label><input type="date" className="form-input" value={entradaForm.fecha} onChange={e => setEntradaForm(p => ({ ...p, fecha: e.target.value }))} /></div>
            <div className="form-group" style={{ zIndex: 101 }}><label className="form-label">Material</label>
              <MaterialSearchSelect value={entradaForm.material_id} onChange={(id: number) => setEntradaForm(p => ({ ...p, material_id: id }))} materiales={materiales} />
            </div>
            <div className="form-group"><label className="form-label">Cantidad (kg)</label><input type="number" className="form-input" value={entradaForm.cantidad_kg} onChange={e => setEntradaForm(p => ({ ...p, cantidad_kg: e.target.value }))} min="0" step="0.01" /></div>
            <div className="form-group"><label className="form-label">Vencimiento <span style={{color:'red'}}>*</span></label><input type="date" className="form-input" value={entradaForm.fecha_vencimiento} onChange={e => setEntradaForm(p => ({ ...p, fecha_vencimiento: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">Observaciones</label><input type="text" className="form-input" value={entradaForm.observaciones} onChange={e => setEntradaForm(p => ({ ...p, observaciones: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleSaveEntrada} disabled={loadingEntradas}>
              {loadingEntradas ? 'Guardando...' : 'Guardar Entrada'}
            </button>
          </div>
          </div>
        </div>
      )}
      <div className="card"><div className="card-body p-0"><div className="data-table-wrapper">
        <table className="data-table w-full">
          <thead><tr><th>Fecha Ingreso</th><th>Vencimiento</th><th>Código</th><th>Material</th><th style={{ textAlign: 'right' }}>Cantidad (kg)</th><th style={{ textAlign: 'right' }}>Bultos</th><th>Observaciones</th>{canEdit && <th style={{ width: 60 }}>Acc.</th>}</tr></thead>
          <tbody>
            {loadingEntradas ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32 }}>⏳ Cargando...</td></tr> :
            filteredEntradas.length === 0 ? <tr><td colSpan={7}><div className="empty-state"><ArrowDownCircle size={40} /><p>Sin entradas para {MESES[mes-1]} {anio}</p></div></td></tr> :
            filteredEntradas.slice((entradasPage - 1) * ITEMS_PER_PAGE, entradasPage * ITEMS_PER_PAGE).map((e: InventarioEntradaRow) => {
              const pesoU = e.inventario_materiales?.peso_kg;
              const bultos = pesoU && pesoU > 0 ? (e.cantidad_kg / pesoU).toFixed(0) : '—';
              return (
                <tr key={e.id}>
                  <td>{e.fecha}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{e.fecha_vencimiento || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{e.inventario_materiales?.codigo}</td>
                  <td>{e.inventario_materiales?.nombre}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(e.cantidad_kg).toLocaleString('es-CO')}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{bultos}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{e.observaciones || '—'}</td>
                  {canEdit && <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn btn-outline btn-sm btn-icon" style={{ borderColor: 'var(--border-color)' }} title="Editar" onClick={() => {
                        setEntradaForm({ id: e.id, fecha: e.fecha, material_id: e.material_id, cantidad_kg: e.cantidad_kg, observaciones: e.observaciones || '', fecha_vencimiento: e.fecha_vencimiento || '' });
                        setShowEntradaForm(true);
                      }}><Edit2 size={14} /></button>
                      <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => handleDeleteEntrada(e.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Mostrando {(entradasPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(entradasPage * ITEMS_PER_PAGE, filteredEntradas.length)} de {filteredEntradas.length} entradas</span>
        {filteredEntradas.length > ITEMS_PER_PAGE && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" disabled={entradasPage === 1} onClick={() => setEntradasPage(p => p - 1)}>Anterior</button>
            <button className="btn btn-outline btn-sm" disabled={entradasPage >= Math.ceil(filteredEntradas.length / ITEMS_PER_PAGE)} onClick={() => setEntradasPage(p => p + 1)}>Siguiente</button>
          </div>
        )}
      </div>
      </div></div>
    </>
  );

  // ═══════════════════════════════════════════════════════
  //  TAB: SALIDAS / MERMAS (Anteriormente Traslados)
  const renderTrasladosTab = () => (
    <>
      <div className="inv-toolbar">
        <div className="inv-toolbar-left">
          <MesSelector />
          <div className="search-box"><Search size={18} /><input type="text" className="form-input" placeholder="Buscar material o motivo..." value={trasladosSearch} onChange={e => { setTrasladosSearch(e.target.value); setTrasladosPage(1); }} style={{ paddingLeft: 40, width: 300 }} /></div>
        </div>
        <div className="inv-toolbar-right">
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setShowTrasladoForm(true)}><Plus size={16} /> Nueva Salida / Ajuste</button>}
        </div>
      </div>
      {showTrasladoForm && (
        <div className="card" style={{ marginBottom: 16, overflow: 'visible' }}>
          <div className="card-header"><span className="card-title">{trasladoForm.id ? 'Editar Salida' : 'Registrar Salida / Ajuste'}</span><button className="btn btn-outline btn-sm" onClick={() => setShowTrasladoForm(false)}>Cancelar</button></div>
          <div className="card-body">
            <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
              <div className="form-group"><label className="form-label">Fecha</label><input type="date" className="form-input" value={trasladoForm.fecha} onChange={e => setTrasladoForm(p => ({ ...p, fecha: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Motivo / Ref.</label><input type="text" className="form-input" placeholder="Ej: Merma, Ajuste Manual..." value={trasladoForm.cliente_op} onChange={e => setTrasladoForm(p => ({ ...p, cliente_op: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Semana</label>
                <select className="form-input" value={trasladoForm.semana} onChange={e => setTrasladoForm(p => ({ ...p, semana: e.target.value }))}>
                  {[1,2,3,4,5].map(s => <option key={s} value={s}>Semana {s}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Observaciones</label><input type="text" className="form-input" value={trasladoForm.observaciones} onChange={e => setTrasladoForm(p => ({ ...p, observaciones: e.target.value }))} /></div>
            </div>
            
            <div style={{ padding: '12px', background: 'rgba(46,125,50,0.03)', borderRadius: '8px', border: '1px dashed var(--border-color)', position: 'relative', zIndex: 100 }}>
              <div style={{ marginBottom: '10px', fontWeight: 600, fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>Materiales dados de baja</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>{trasladoForm.id ? 'Editando 1 material' : 'Puedes añadir varios materiales.'}</span>
              </div>
              {trasladoForm.materiales.map((mat, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '12px', marginBottom: '8px', alignItems: 'center' }}>
                  <div style={{ flex: 1, zIndex: 100 - idx }}>
                    <MaterialSearchSelect value={mat.material_id} onChange={(id: number) => {
                      const next = [...trasladoForm.materiales];
                      next[idx].material_id = id;
                      setTrasladoForm(p => ({...p, materiales: next}));
                    }} materiales={materiales} />
                  </div>
                  <div style={{ width: '150px' }}>
                    <input type="number" className="form-input" placeholder="Cantidad" value={mat.cantidad_kg} min="0" step="0.01" onChange={e => {
                      const next = [...trasladoForm.materiales];
                      next[idx].cantidad_kg = e.target.value;
                      setTrasladoForm(p => ({...p, materiales: next}));
                    }} />
                  </div>
                  {!trasladoForm.id && <div style={{ width: '40px' }}>
                    <button className="btn btn-outline btn-sm btn-icon" onClick={() => {
                      if (trasladoForm.materiales.length === 1) return setTrasladoForm(p => ({...p, materiales: [{ material_id: '', cantidad_kg: '' }]}));
                      const next = trasladoForm.materiales.filter((_, i) => i !== idx);
                      setTrasladoForm(p => ({...p, materiales: next}));
                    }}><Trash2 size={16} /></button>
                  </div>}
                </div>
              ))}
              {!trasladoForm.id && <div style={{ marginTop: '12px' }}>
                <button className="btn btn-outline btn-sm" onClick={() => {
                  setTrasladoForm(p => ({...p, materiales: [...p.materiales, { material_id: '', cantidad_kg: '' }]}));
                }}><Plus size={14} /> Añadir material</button>
              </div>}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button className="btn btn-primary" onClick={handleSaveTraslado}>Guardar Salida</button></div>
          </div>
        </div>
      )}
      <div className="card"><div className="card-body p-0"><div className="data-table-wrapper">
        <table className="data-table w-full">
          <thead><tr><th style={{ width: 30 }}></th><th>Fecha</th><th>Motivo / Ref.</th><th>Código</th><th>Material</th><th style={{ textAlign: 'right' }}>Cantidad (kg)</th><th style={{ textAlign: 'center' }}>Semana</th>{canEdit && <th style={{ width: 60 }}>Acc.</th>}</tr></thead>
          <tbody>
            {loadingTraslados ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>⏳ Cargando...</td></tr> :
            filteredTraslados.length === 0 ? <tr><td colSpan={8}><div className="empty-state"><ArrowUpCircle size={40} /><p>Sin salidas / mermas para {MESES[mes-1]} {anio}</p></div></td></tr> :
            filteredTraslados.slice((trasladosPage - 1) * ITEMS_PER_PAGE, trasladosPage * ITEMS_PER_PAGE).map((t: InventarioTrasladoRow) => {
              const isExp = expandedTraslados.has(t.id);
              return (
              <Fragment key={t.id}>
              <tr onClick={() => handleExpandTraslado(t.id)} style={{ cursor: 'pointer' }}>
                <td>{isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                <td>{t.fecha}</td>
                <td style={{ fontWeight: 500 }}>{t.cliente_op}</td>
                <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{t.inventario_materiales?.codigo}</td>
                <td>{t.inventario_materiales?.nombre}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#C62828' }}>−{Number(t.cantidad_kg).toLocaleString('es-CO')}</td>
                <td style={{ textAlign: 'center' }}><span className="badge badge-success">S{t.semana}</span></td>
                {canEdit && <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <button className="btn btn-outline btn-sm btn-icon" style={{ borderColor: 'var(--border-color)' }} title="Editar" onClick={() => {
                      setTrasladoForm({ id: t.id, fecha: t.fecha, cliente_op: t.cliente_op, semana: String(t.semana), observaciones: t.observaciones || '', materiales: [{ material_id: t.material_id, cantidad_kg: t.cantidad_kg }] });
                      setShowTrasladoForm(true);
                    }}><Edit2 size={14} /></button>
                    <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => handleDeleteTraslado(t.id)}><Trash2 size={14} /></button>
                  </div>
                </td>}
              </tr>
              {isExp && (
                <tr style={{ background: 'rgba(198, 40, 40, 0.02)' }}>
                  <td colSpan={8} style={{ padding: '12px 20px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Desglose de Lotes Consumidos (FIFO)</div>
                    <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0', overflowY: 'auto' }}>
                      {loadingTrasladoLotes[t.id] ? (
                        <div style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cargando desglose...</div>
                      ) : trasladoLotesData[t.id] && trasladoLotesData[t.id].length > 0 ? (
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                          <thead style={{ background: '#f5f5f5' }}>
                            <tr>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Lote</th>
                              <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Fecha Ingreso</th>
                              <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Descontado (kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trasladoLotesData[t.id].map((loteDesc: any, idx: number) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '6px 12px', fontWeight: 500 }}>{loteDesc.inventario_lotes?.codigo_lote || 'Lote Desconocido'}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>{loteDesc.inventario_lotes?.fecha_ingreso || '—'}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#C62828' }}>−{Number(loteDesc.cantidad).toLocaleString('es-CO')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>No hay desglose de lotes para esta salida. (Posible registro antiguo).</div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            )})}
          </tbody>
        </table>
      </div>
      <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Mostrando {(trasladosPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(trasladosPage * ITEMS_PER_PAGE, filteredTraslados.length)} de {filteredTraslados.length} salidas/ajustes</span>
        {filteredTraslados.length > ITEMS_PER_PAGE && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" disabled={trasladosPage === 1} onClick={() => setTrasladosPage(p => p - 1)}>Anterior</button>
            <button className="btn btn-outline btn-sm" disabled={trasladosPage >= Math.ceil(filteredTraslados.length / ITEMS_PER_PAGE)} onClick={() => setTrasladosPage(p => p + 1)}>Siguiente</button>
          </div>
        )}
      </div>
      </div></div>
    </>
  );

  // ═══════════════════════════════════════════════════════
  //  TAB: CATÁLOGO
  // ═══════════════════════════════════════════════════════

  const renderCatalogoTab = () => (
    <>
      <div className="inv-toolbar">
        <div className="inv-toolbar-left">
          <div className="search-box"><Search size={18} /><input type="text" className="form-input" placeholder="Buscar material..." value={matSearch} onChange={e => { setMatSearch(e.target.value); setMatPage(1); }} style={{ paddingLeft: 40, width: 300 }} /></div>
        </div>
        <div className="inv-toolbar-right">
          <input type="file" ref={fileRef} accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => handleImportMateriales(e, fileRef)} />
          {canEdit && <>
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}><Upload size={16} /> Importar Excel</button>
            <button className="btn btn-outline btn-sm" onClick={exportMatExcel}><Download size={16} /> Exportar Excel</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setMatForm({ id: 0, codigo: '', nombre: '', peso_kg: '', min_cobertura_semanas: '2' }); setShowMatForm(true); }}><Plus size={16} /> Nuevo Material</button>
          </>}
        </div>
      </div>
      {showMatForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><span className="card-title">{matForm.id ? 'Editar' : 'Nuevo'} Material</span><button className="btn btn-outline btn-sm" onClick={() => setShowMatForm(false)}>Cancelar</button></div>
          <div className="card-body"><div className="grid-4" style={{ gap: 12 }}>
            <div className="form-group"><label className="form-label">Código</label><input type="number" className="form-input" value={matForm.codigo} onChange={e => setMatForm(p => ({ ...p, codigo: e.target.value }))} autoFocus /></div>
            <div className="form-group"><label className="form-label">Nombre del Material</label><input type="text" className="form-input" value={matForm.nombre} onChange={e => setMatForm(p => ({ ...p, nombre: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Peso por unidad (kg)</label><input type="number" className="form-input" placeholder="Ej: 40 para bultos" value={matForm.peso_kg} onChange={e => setMatForm(p => ({ ...p, peso_kg: e.target.value }))} step="0.01" /></div>
            <div className="form-group"><label className="form-label">Alerta (Semanas mínimas)</label><input type="number" className="form-input" placeholder="Ej: 2" value={matForm.min_cobertura_semanas} onChange={e => setMatForm(p => ({ ...p, min_cobertura_semanas: e.target.value }))} step="0.1" min="0" /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-primary" onClick={handleSaveMat}>Guardar Material</button></div>
          </div>
        </div>
      )}
      <div className="card"><div className="card-body p-0"><div className="data-table-wrapper">
        <table className="data-table w-full">
          <thead><tr><th style={{ width: 100 }}>Código</th><th>Nombre de Material</th><th style={{ textAlign: 'center' }}>Peso (kg/ud)</th><th style={{ textAlign: 'center' }}>Lim. Crítico (Sem)</th>{canEdit && <th style={{ width: 80 }}>Acciones</th>}</tr></thead>
          <tbody>
            {loadingMat ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32 }}>⏳ Cargando maestro...</td></tr> :
            filteredMat.length === 0 ? <tr><td colSpan={5}><div className="empty-state"><BookOpen size={40} /><p>Sin materiales registrados</p></div></td></tr> :
            filteredMat.slice((matPage - 1) * ITEMS_PER_PAGE, matPage * ITEMS_PER_PAGE).map((m: InventarioMaterial) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 600 }}>{m.codigo}</td>
                <td>{m.nombre}</td>
                <td style={{ textAlign: 'center' }}>{m.peso_kg ? `${m.peso_kg} kg` : '—'}</td>
                <td style={{ textAlign: 'center' }}><span className="badge badge-warning" style={{ background: 'rgba(245, 124, 0, 0.1)', color: '#F57C00' }}>{m.min_cobertura_semanas || 2} sem</span></td>
                {canEdit && <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <button className="btn btn-outline btn-sm btn-icon" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }} title="Editar" onClick={() => { setMatForm({ id: m.id, codigo: String(m.codigo), nombre: m.nombre, peso_kg: m.peso_kg ? String(m.peso_kg) : '', min_cobertura_semanas: String(m.min_cobertura_semanas || 2) }); setShowMatForm(true); }}><Edit2 size={14} /></button>
                    <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={() => handleDeleteMat(m.id)}><Trash2 size={14} /></button>
                  </div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Mostrando {(matPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(matPage * ITEMS_PER_PAGE, filteredMat.length)} de {filteredMat.length} materiales</span>
        {filteredMat.length > ITEMS_PER_PAGE && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" disabled={matPage === 1} onClick={() => setMatPage(p => p - 1)}>Anterior</button>
            <button className="btn btn-outline btn-sm" disabled={matPage >= Math.ceil(filteredMat.length / ITEMS_PER_PAGE)} onClick={() => setMatPage(p => p + 1)}>Siguiente</button>
          </div>
        )}
      </div>
      </div></div>
    </>
  );

  // ═══════════════════════════════════════════════════════
  //  TAB: STOCK INICIAL
  const renderStockInicialTab = () => (
    <>
      <div className="inv-toolbar">
        <div className="inv-toolbar-left">
          <MesSelector />
          <div className="search-box"><Search size={18} /><input type="text" className="form-input" placeholder="Buscar material..." value={stockSearch} onChange={e => setStockSearch(e.target.value)} style={{ paddingLeft: 40, width: 260 }} /></div>
        </div>
        <div className="inv-toolbar-right">
          <input type="file" ref={fileRef} accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => handleImportStock(e, fileRef)} />
          {canEdit && <>
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}><Upload size={16} /> Importar Excel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSaveStock} disabled={dirtyCount === 0}>
              💾 Guardar Stock {dirtyCount > 0 && `(${dirtyCount} cambios)`}
            </button>
          </>}
        </div>
      </div>
      <div className="inv-import-notice">
        📋 <strong>Inventario Físico de {MESES[mes-1]} {anio}</strong> — Ingresa aquí el stock inicial real (conteo físico) y el consumo estimado del mes para cada material.
      </div>
      <div className="card"><div className="card-body p-0"><div className="data-table-wrapper">
        <table className="data-table w-full">
          <thead><tr><th style={{ width: 80 }}>Código</th><th>Material</th><th style={{ textAlign: 'right', width: 160 }}>Stock Inicial (kg)</th><th style={{ textAlign: 'right', width: 180 }}>Consumo Est. Mes (kg)</th></tr></thead>
          <tbody>
            {loadingStock ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32 }}>⏳ Cargando...</td></tr> :
            filteredStock.length === 0 ? <tr><td colSpan={4}><div className="empty-state"><Package size={40} /><p>Agrega materiales al catálogo primero</p></div></td></tr> :
            filteredStock.map((r, i: number) => (
              <tr key={r.material_id} style={r.dirty ? { background: 'rgba(46,125,50,0.04)' } : {}}>
                <td style={{ fontWeight: 600 }}>{r.codigo}</td>
                <td>{r.nombre}</td>
                <td style={{ textAlign: 'right' }}>
                  {canEdit ? (
                    <input type="number" className="form-input" style={{ textAlign: 'right', maxWidth: 140 }}
                      value={r.stock_kg} onChange={e => handleStockChange(i, 'stock_kg', e.target.value)} min="0" step="0.01" />
                  ) : (r.stock_kg || '—')}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {canEdit ? (
                    <input type="number" className="form-input" style={{ textAlign: 'right', maxWidth: 150 }}
                      value={r.consumo_estimado_mes} onChange={e => handleStockChange(i, 'consumo_estimado_mes', e.target.value)} min="0" step="0.01" />
                  ) : (r.consumo_estimado_mes || '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div><div className="pagination"><span>Total: {filteredStock.length} materiales</span></div></div></div>
    </>
  );

  // ═══════════════════════════════════════════════════════
  //  MAIN RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div>
      <div className="inv-tabs">
        <button className={`inv-tab ${activeTab === 'panel' ? 'active' : ''}`} onClick={() => setActiveTab('panel')}><Package size={16} /> Panel Inventario</button>
        <button className={`inv-tab ${activeTab === 'entradas' ? 'active' : ''}`} onClick={() => setActiveTab('entradas')}><ArrowDownCircle size={16} /> Entradas</button>
        <button className={`inv-tab ${activeTab === 'traslados' ? 'active' : ''}`} onClick={() => setActiveTab('traslados')}><ArrowUpCircle size={16} /> Salidas / Mermas</button>
        <button className={`inv-tab ${activeTab === 'stock_inicial' ? 'active' : ''}`} onClick={() => setActiveTab('stock_inicial')}><Calendar size={16} /> Stock Inicial</button>
        <button className={`inv-tab ${activeTab === 'catalogo' ? 'active' : ''}`} onClick={() => setActiveTab('catalogo')}><BookOpen size={16} /> Catálogo</button>
      </div>

      {activeTab === 'panel' && renderPanelTab()}
      {activeTab === 'entradas' && renderEntradasTab()}
      {activeTab === 'traslados' && renderTrasladosTab()}
      {activeTab === 'stock_inicial' && renderStockInicialTab()}
      {activeTab === 'catalogo' && renderCatalogoTab()}
    </div>
  );
}
