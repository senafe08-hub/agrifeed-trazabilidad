import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Download, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import supabase from '../lib/supabase';
import { toast } from '../components/Toast';
import * as XLSX from 'xlsx';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../lib/permissions';

const PAGE_SIZE = 100;

function ProgressBar({ current, total, colorHex }: { current: number; total: number; colorHex: string }) {
  if (total === 0 && current === 0) return <span style={{color: 'var(--text-muted)'}}>-</span>;
  const perc = total > 0 ? (current / total) * 100 : (current > 0 ? 100 : 0);
  const displayPerc = Math.min(Math.round(perc), 100);
  const isOver = perc > 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', minWidth: 70 }}>
      <div style={{ fontSize: '0.72rem', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
        <span>{displayPerc}% {isOver && <span style={{color:'var(--color-error)'}}>↑</span>}</span>
        <span style={{ color: 'var(--text-muted)' }}>{current}/{total}</span>
      </div>
      <div style={{ width: '100%', height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(perc, 100)}%`, height: '100%', background: isOver ? 'var(--color-error)' : colorHex, transition: 'width 0.3s ease' }}></div>
      </div>
    </div>
  );
}

function StatusIcon({ bachesProg, bachesEnt, ent, desp, fact }: any) {
  const bp = Number(bachesProg) || 0;
  const be = Number(bachesEnt) || 0;
  const e = Number(ent) || 0;
  const d = Number(desp) || 0;
  const f = Number(fact) || 0;

  if (bp > 0 && be >= bp && e > 0 && d >= e && f >= d) {
    return <span className="badge badge-success"><CheckCircle2 size={12} style={{marginRight:4}} /> Completo</span>;
  }
  if (be === 0) {
    return <span className="badge badge-neutral">Pendiente</span>;
  }
  return <span className="badge badge-warning" title={`Debug: bP:${bp} bE:${be} e:${e} d:${d} f:${f}`}><AlertTriangle size={12} style={{marginRight:4}} /> Incompleto</span>;
}

export default function TrazabilidadPage() {
  const { canView } = usePermissions('trazabilidad');
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  if (!canView) return <Navigate to="/" replace />;

  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6); // Default to last 6 months to ensure demo data loads
    return d.toISOString().split('T')[0];
  });
  const [fechaHasta, setFechaHasta] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    fetchData();
  }, [fechaDesde, fechaHasta]); // Reload when dates change

  const setQuickRange = (days: number) => {
    const dStr = new Date().toISOString().split('T')[0];
    setFechaHasta(dStr);
    const d = new Date();
    d.setDate(d.getDate() - days);
    setFechaDesde(d.toISOString().split('T')[0]);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('programacion')
        .select(`
          lote, fecha, bultos_programados, num_baches,
          maestro_alimentos(descripcion, categoria),
          maestro_clientes(nombre),
          produccion(bultos_entregados, baches_entregados),
          despachos(bultos_despachados, bultos_danados)
        `);
      
      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);
      
      const [{ data: rawData, error }, { data: detData }] = await Promise.all([
        query.order('lote', { ascending: false }),
        supabase
          .from('pedido_detalle')
          .select('op, bultos_pedido, pedidos(estado)')
      ]);

      if (error) throw error;

      const facturadoMap = new Map<number, number>();
      if (detData) {
        for (const d of detData) {
          if ((d.pedidos as any)?.estado === 'FACTURADO') {
            facturadoMap.set(d.op, (facturadoMap.get(d.op) || 0) + (d.bultos_pedido || 0));
          }
        }
      }

      if (rawData) {
        const processed = rawData.map(item => {
          const programado = item.bultos_programados || 0;
          const bachesProgramados = item.num_baches || 0;
          let entregado = 0;
          let bachesEntregados = 0;
          if (item.produccion && Array.isArray(item.produccion)) {
            entregado = item.produccion.reduce((acc, curr) => acc + (curr.bultos_entregados || 0), 0);
            bachesEntregados = item.produccion.reduce((acc, curr) => acc + (curr.baches_entregados || 0), 0);
          }
          let despachado = 0;
          let danados = 0;
          if (item.despachos && Array.isArray(item.despachos)) {
            despachado = item.despachos.reduce((acc, curr) => acc + (curr.bultos_despachados || 0), 0);
            danados = item.despachos.reduce((acc, curr) => acc + (curr.bultos_danados || 0), 0);
          }
          const facturado = facturadoMap.get(item.lote) || 0;

          const alimento = (item.maestro_alimentos as any)?.descripcion || 'Sin Alimento';
          const categoria = (item.maestro_alimentos as any)?.categoria || '';
          const cliente = (item.maestro_clientes as any)?.nombre || 'Sin Cliente';

          let estado = 'Incompleto';
          if (bachesProgramados > 0 && bachesEntregados >= bachesProgramados && entregado > 0 && despachado >= entregado && facturado >= despachado) {
            estado = 'Completo';
          } else if (bachesEntregados === 0) {
            estado = 'Pendiente';
          }

          return {
            lote: item.lote,
            fecha: item.fecha,
            alimento,
            categoria,
            cliente,
            programado,
            bachesProgramados,
            entregado,
            bachesEntregados,
            despachado,
            danados,
            facturado,
            estado
          };
        });
        setData(processed);
      }
    } catch(err: any){
      toast.error('Error cargando trazabilidad: ' + err.message);
    }
    setLoading(false);
  };

  const handleColFilter = useCallback((key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const renderFilterInput = useCallback((colKey: string, placeholder = 'Filtrar...') => {
    return (
      <div style={{ marginTop: '4px' }}>
        <input
          type="text"
          className="col-filter-input"
          placeholder={placeholder}
          value={columnFilters[colKey] || ''}
          onChange={e => handleColFilter(colKey, e.target.value)}
          style={{ width: '100%', fontSize: '0.7rem', padding: '2px 4px' }}
        />
      </div>
    );
  }, [columnFilters, handleColFilter]);

  const filtered = useMemo(() => {
    const st = searchTerm.toLowerCase();
    return data.filter(item => {
      if (st && !`${item.alimento} ${item.lote} ${item.cliente} ${item.categoria}`.toLowerCase().includes(st)) return false;
      for (const key of Object.keys(columnFilters)) {
        const fv = columnFilters[key];
        if (!fv) continue;
        const val = String((item as any)[key] ?? '').toLowerCase();
        if (key === 'estado') {
          if (!val.startsWith(fv.toLowerCase()) && val !== fv.toLowerCase()) return false;
        } else {
          if (!val.includes(fv.toLowerCase())) return false;
        }
      }
      return true;
    });
  }, [data, searchTerm, columnFilters]);

  // KPIs
  const totalProg = filtered.reduce((s, i) => s + i.programado, 0);
  const totalEnt = filtered.reduce((s, i) => s + i.entregado, 0);
  const totalDesp = filtered.reduce((s, i) => s + i.despachado, 0);
  const totalFact = filtered.reduce((s, i) => s + i.facturado, 0);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const exportToExcel = () => {
    if (filtered.length === 0) { toast.error('No hay datos para exportar.'); return; }
    const dataForExcel = filtered.map(row => ({
      'OP / Lote': row.lote,
      'Fecha Prog.': row.fecha,
      'Alimento': row.alimento,
      'Cliente': row.cliente,
      'Categoría': row.categoria,
      'Prog. (Bultos)': row.programado,
      'Entregado (Bultos)': row.entregado,
      'Producción %': row.programado > 0 ? (row.entregado / row.programado) : 0,
      'Despachado (Bultos)': row.despachado,
      'Dañados': row.danados,
      'Logística %': row.entregado > 0 ? (row.despachado / row.entregado) : 0,
      'Facturado (Bultos)': row.facturado,
      'Comercial %': row.despachado > 0 ? (row.facturado / row.despachado) : 0,
    }));
    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TRAZABILIDAD');
    try {
      if ('showSaveFilePicker' in window) {
        (window as any).showSaveFilePicker({
          suggestedName: `Trazabilidad_Agrifeed_${new Date().toISOString().split('T')[0]}.xlsx`,
          types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        }).then(async (handle: any) => {
          const writable = await handle.createWritable();
          await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
          await writable.close();
          toast.success('Reporte exportado exitosamente.');
        });
      } else {
        XLSX.writeFile(wb, `Trazabilidad_Agrifeed_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success('Reporte exportado exitosamente.');
      }
    } catch(err:any){
      if (err.name !== 'AbortError') toast.error('Error al exportar: ' + err.message);
    }
  };

  return (
    <div className="trazabilidad-container">
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="kpi-info" style={{ marginLeft: 6 }}>
            <h3 style={{color: '#f59e0b'}}>Programado</h3>
            <div className="kpi-value">{totalProg.toLocaleString()} <span style={{fontSize:'1rem', color:'var(--text-muted)'}}>blts</span></div>
          </div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #22c55e' }}>
          <div className="kpi-info" style={{ marginLeft: 6 }}>
            <h3 style={{color: '#22c55e'}}>Entregado</h3>
            <div className="kpi-value">{totalEnt.toLocaleString()} <span style={{fontSize:'1rem', color:'var(--text-muted)'}}>blts</span></div>
          </div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #3b82f6' }}>
          <div className="kpi-info" style={{ marginLeft: 6 }}>
            <h3 style={{color: '#3b82f6'}}>Despachado</h3>
            <div className="kpi-value">{totalDesp.toLocaleString()} <span style={{fontSize:'1rem', color:'var(--text-muted)'}}>blts</span></div>
          </div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div className="kpi-info" style={{ marginLeft: 6 }}>
            <h3 style={{color: '#8b5cf6'}}>Facturado</h3>
            <div className="kpi-value">{totalFact.toLocaleString()} <span style={{fontSize:'1rem', color:'var(--text-muted)'}}>blts</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative' }}>
               <Search size={16} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-muted)' }} />
               <input
                 type="text"
                 className="form-input"
                 placeholder="Buscar general..."
                 value={searchTerm}
                 onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                 style={{ paddingLeft: 34, width: 220 }}
               />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-app)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
               <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
               <input type="date" className="filter-input-date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem' }} title="Fecha Desde" />
               <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>a</span>
               <input type="date" className="filter-input-date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem' }} title="Fecha Hasta" />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-app)', padding: '4px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
               <button className="btn btn-ghost btn-sm" style={{ fontSize:'0.75rem', padding:'2px 6px', height:'auto', minHeight: 24 }} onClick={() => setQuickRange(0)}>Hoy</button>
               <button className="btn btn-ghost btn-sm" style={{ fontSize:'0.75rem', padding:'2px 6px', height:'auto', minHeight: 24 }} onClick={() => setQuickRange(7)}>7D</button>
               <button className="btn btn-ghost btn-sm" style={{ fontSize:'0.75rem', padding:'2px 6px', height:'auto', minHeight: 24 }} onClick={() => setQuickRange(30)}>1M</button>
               <button className="btn btn-ghost btn-sm" style={{ fontSize:'0.75rem', padding:'2px 6px', height:'auto', minHeight: 24 }} onClick={() => setQuickRange(180)}>6M</button>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={exportToExcel}>
              <Download size={14} /> Exportar Excel
            </button>
          </div>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          <div className="data-table-wrapper" style={{ maxHeight: 'calc(100vh - 350px)' }}>
            <table className="data-table" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th colSpan={3} style={{ textAlign: 'center', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>📦 IDENTIFICACIÓN</th>
                  <th colSpan={2} style={{ textAlign: 'center', background: 'rgba(245, 158, 11, 0.05)', borderBottom: '2px solid #fcd34d' }}>⚙️ PRODUCCIÓN</th>
                  <th colSpan={2} style={{ textAlign: 'center', background: 'rgba(59, 130, 246, 0.05)', borderBottom: '2px solid #93c5fd' }}>🚚 LOGÍSTICA</th>
                  <th colSpan={2} style={{ textAlign: 'center', background: 'rgba(139, 92, 246, 0.05)', borderBottom: '2px solid #c4b5fd' }}>💵 COMERCIAL</th>
                </tr>
                <tr>
                  <th style={{ minWidth: 90 }}>OP {renderFilterInput('lote', 'Ej. 4950')}</th>
                  <th style={{ minWidth: 100 }}>Fecha</th>
                  <th style={{ minWidth: 180 }}>
                    Producto {renderFilterInput('alimento', 'Producto...')}
                    <div style={{ marginTop: 2 }}>{renderFilterInput('cliente', 'Cliente...')}</div>
                  </th>
                  <th style={{ background: 'rgba(245, 158, 11, 0.02)' }}>Prog. vs Ent.</th>
                  <th style={{ width: 130, background: 'rgba(245, 158, 11, 0.02)' }}>Progreso Fab.</th>
                  <th style={{ background: 'rgba(59, 130, 246, 0.02)' }}>Desp. / Dañ.</th>
                  <th style={{ width: 130, background: 'rgba(59, 130, 246, 0.02)' }}>Progreso Desp.</th>
                  <th style={{ background: 'rgba(139, 92, 246, 0.02)' }}>Facturado</th>
                  <th style={{ width: 130, background: 'rgba(139, 92, 246, 0.02)' }}>Estado {renderFilterInput('estado', 'Estado...')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Mapeando rutas de trazabilidad...</td></tr>
                ) : paginatedData.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No se encontraron operaciones en este rango de fechas.</td></tr>
                ) : paginatedData.map(row => (
                  <tr key={row.lote}>
                    <td style={{ fontWeight: 800 }}>{row.lote}</td>
                    <td>{row.fecha}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{row.alimento}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.cliente}</span>
                      </div>
                    </td>
                    
                    {/* PRODUCCIÓN */}
                    <td style={{ background: 'rgba(245, 158, 11, 0.01)' }}>
                      <div style={{ fontSize: '0.85rem' }}>
                        P: <strong style={{color: '#f59e0b'}}>{row.bachesProgramados} bch</strong> <span style={{fontSize: '0.7rem'}}>({row.programado} blt)</span>
                        <br/>
                        E: <strong>{row.bachesEntregados} bch</strong> <span style={{fontSize: '0.7rem'}}>({row.entregado} blt)</span>
                      </div>
                    </td>
                    <td style={{ background: 'rgba(245, 158, 11, 0.01)' }}>
                      <ProgressBar current={row.bachesEntregados} total={row.bachesProgramados} colorHex="#f59e0b" />
                    </td>

                    {/* LOGÍSTICA */}
                    <td style={{ background: 'rgba(59, 130, 246, 0.01)' }}>
                       <div style={{ fontSize: '0.85rem' }}>
                         D: <strong style={{color: '#3b82f6'}}>{row.despachado}</strong>
                         {row.danados > 0 && <span style={{ color: 'var(--color-error)', marginLeft: 6 }}>({row.danados} rotos)</span>}
                       </div>
                    </td>
                    <td style={{ background: 'rgba(59, 130, 246, 0.01)' }}>
                      <ProgressBar current={row.despachado} total={row.entregado} colorHex="#3b82f6" />
                    </td>

                    {/* COMERCIAL */}
                    <td style={{ background: 'rgba(139, 92, 246, 0.01)' }}>
                      <div style={{ fontSize: '0.85rem' }}>
                         F: <strong style={{color: '#8b5cf6'}}>{row.facturado}</strong>
                      </div>
                    </td>
                    <td style={{ background: 'rgba(139, 92, 246, 0.01)' }}>
                      <StatusIcon bachesProg={row.bachesProgramados} bachesEnt={row.bachesEntregados} ent={row.entregado} desp={row.despachado} fact={row.facturado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Mostrando {((currentPage - 1) * PAGE_SIZE) + (filtered.length > 0 ? 1 : 0)} – {Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} órdenes OP
            </span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn btn-outline btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft size={14} /></button>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Pág {currentPage} / {totalPages}</span>
                <button className="btn btn-outline btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight size={14} /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
