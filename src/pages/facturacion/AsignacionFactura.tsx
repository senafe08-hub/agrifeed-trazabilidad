import { useState, useEffect } from 'react';
import { Search, FileCheck, Inbox } from 'lucide-react';
import {
  fetchPedidosLiberados,
  fetchAllOrdenSapOP,
  crearFactura,
  eliminarPedido,
  actualizarEstadoPedido,
  fetchProgramacionParaOPs,
  eliminarOrdenSapOP,
} from '../../lib/supabase';
import { toast } from '../../components/Toast';

export default function AsignacionFactura({ onRefreshKpis, isAdmin, canEdit = true }: { onRefreshKpis?: () => void; isAdmin?: boolean; canEdit?: boolean }) {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Factura form
  const [numFactura, setNumFactura] = useState('');
  const [numEntrega, setNumEntrega] = useState('');
  const [fechaFacturacion, setFechaFacturacion] = useState(new Date().toISOString().split('T')[0]);
  const [ordenSapInputs, setOrdenSapInputs] = useState<Record<number, string>>({});
  const [ordenSapLocked, setOrdenSapLocked] = useState<Record<number, boolean>>({});
  const [programacionOPs, setProgramacionOPs] = useState<Record<number, number>>({});
  const [pedidoGroups, setPedidoGroups] = useState<number[][]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pedidosData, sapMap] = await Promise.all([
        fetchPedidosLiberados(),
        fetchAllOrdenSapOP(),
      ]);
      setPedidos(pedidosData);

      const sapInputs: Record<number, string> = {};
      const sapLocked: Record<number, boolean> = {};
      const uniqueOps = new Set<number>();
      for (const p of pedidosData) {
        for (const d of (p.pedido_detalle || [])) {
          if (sapMap[d.op]) {
            sapInputs[d.op] = sapMap[d.op];
            sapLocked[d.op] = true;
          }
          uniqueOps.add(d.op);
        }
      }
      setOrdenSapInputs(sapInputs);
      setOrdenSapLocked(sapLocked);

      // Build groups of interconnected pedidos
      const adj: Record<number, number[]> = {};
      pedidosData.forEach((p: any) => {
        adj[p.id] = adj[p.id] || [];
        if (p.pedido_relacionado_id) {
          adj[p.pedido_relacionado_id] = adj[p.pedido_relacionado_id] || [];
          adj[p.id].push(p.pedido_relacionado_id);
          adj[p.pedido_relacionado_id].push(p.id);
        }
      });
      const groups: number[][] = [];
      const visited = new Set<number>();
      pedidosData.forEach((p: any) => {
        if (!visited.has(p.id)) {
          const grp: number[] = [];
          const q = [p.id];
          visited.add(p.id);
          while(q.length) {
            const curr = q.shift()!;
            grp.push(curr);
            for (const nxt of adj[curr]) {
               if (!visited.has(nxt)) {
                  visited.add(nxt);
                  q.push(nxt);
               }
            }
          }
          groups.push(grp);
        }
      });
      setPedidoGroups(groups);

      // Programacion amounts
      const progOps = await fetchProgramacionParaOPs(Array.from(uniqueOps));
      const progMap: Record<number, number> = {};
      for (const po of progOps) progMap[po.op] = po.bultos;
      setProgramacionOPs(progMap);

    } catch (e: any) {
      toast.error('Error cargando pedidos liberados: ' + e.message);
    }
    setLoading(false);
  };

  const toggleSelect = (id: number) => {
    // Find group
    const grp = pedidoGroups.find(g => g.includes(id)) || [id];
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        grp.forEach(gid => next.delete(gid));
      } else {
        grp.forEach(gid => next.add(gid));
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const filtered = pedidos.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (p.num_pedido || '').toLowerCase().includes(term) ||
      (p.nombre_cliente || '').toLowerCase().includes(term) ||
      String(p.num_remision || '').includes(term);
  }).sort((a, b) => {
    const gA = pedidoGroups.findIndex(g => g.includes(a.id));
    const gB = pedidoGroups.findIndex(g => g.includes(b.id));
    if (gA !== gB) return gA - gB;
    return a.id - b.id;
  });

  // Get all unique OPs from selected pedidos
  const selectedPedidos = pedidos.filter(p => selectedIds.has(p.id));
  const selectedOPs = new Map<number, any>();
  const selectedOPsTotalBultos = new Map<number, number>();

  for (const p of selectedPedidos) {
    for (const d of (p.pedido_detalle || [])) {
      if (!selectedOPs.has(d.op)) {
        selectedOPs.set(d.op, d);
      }
      selectedOPsTotalBultos.set(d.op, (selectedOPsTotalBultos.get(d.op) || 0) + (d.bultos_pedido || 0));
    }
  }

  const handleOrdenSapChange = (op: number, value: string) => {
    if (!canEdit) return;
    setOrdenSapInputs(prev => ({ ...prev, [op]: value }));
  };

  const handleUnlockSAP = (op: number) => {
    if (!canEdit) return;
    setOrdenSapLocked(prev => ({ ...prev, [op]: false }));
  };

  const handleDeleteSAPdb = async (op: number) => {
    if (!canEdit) return;
    if (!window.confirm(`¿Estás seguro de borrar permanentemente el amarre previo de la Orden SAP para la OP ${op}?`)) return;
    try {
      await eliminarOrdenSapOP(op);
      toast.success(`Orden SAP desvinculada de la OP ${op}.`);
      setOrdenSapInputs(prev => {
        const next = { ...prev };
        next[op] = '';
        return next;
      });
      setOrdenSapLocked(prev => {
        const next = { ...prev };
        next[op] = false;
        return next;
      });
    } catch (e: any) {
      toast.error('Error al desvincular Orden SAP: ' + e.message);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;
    if (selectedIds.size === 0) {
      toast.error('Selecciona al menos un pedido.');
      return;
    }
    if (!numFactura.trim()) {
      toast.error('El número de factura es obligatorio.');
      return;
    }
    if (!fechaFacturacion) {
      toast.error('La fecha de facturación es obligatoria.');
      return;
    }

    setSaving(true);
    try {
      await crearFactura(
        {
          num_factura: numFactura.trim(),
          num_entrega: numEntrega.trim() || undefined,
          fecha_facturacion: fechaFacturacion,
        },
        Array.from(selectedIds),
        ordenSapInputs,
      );
      toast.success('Factura asignada correctamente.');

      // Reset
      setSelectedIds(new Set());
      setNumFactura('');
      setNumEntrega('');
      setFechaFacturacion(new Date().toISOString().split('T')[0]);
      loadData();
      if (onRefreshKpis) onRefreshKpis();
    } catch (e: any) {
      toast.error('Error al crear factura: ' + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (pedidoId: number, numPedido: string) => {
    if (!canEdit) return;
    if (!window.confirm(`¿Estás seguro de eliminar el pedido ${numPedido || pedidoId}?`)) return;
    try {
      await eliminarPedido(pedidoId);
      toast.success('Pedido eliminado correctamente.');
      if (selectedIds.has(pedidoId)) {
        toggleSelect(pedidoId);
      }
      loadData();
      if (onRefreshKpis) onRefreshKpis();
    } catch (e: any) {
      toast.error('Error al eliminar: ' + e.message);
    }
  };

  const handleDevolver = async (pedidoId: number, numPedido: string) => {
    if (!canEdit) return;
    if (!window.confirm(`¿Estás seguro de devolver el pedido ${numPedido || pedidoId} para que sea editado de nuevo?`)) return;
    try {
      await actualizarEstadoPedido(pedidoId, 'VERIFICAR PEDIDO');
      toast.success('Pedido devuelto exitosamente.');
      if (selectedIds.has(pedidoId)) toggleSelect(pedidoId);
      loadData();
      if (onRefreshKpis) onRefreshKpis();
    } catch(e:any) {
      toast.error('Error al devolver: ' + e.message);
    }
  };

  const renderEstado = (est: string) => {
    const cls = est.toLowerCase().replace(/\s+/g, '-').replace(/ó/g, 'o');
    return <span className={`estado-tag ${cls}`}>{est}</span>;
  };

  return (
    <div className="fact-tab-content">
      {/* Pedidos Table */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">🧾 Pedidos Liberados — Seleccionar para Facturar ({pedidos.length})</span>
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              className="form-input"
              placeholder="Buscar pedido, cliente, remisión..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: 36, width: 280 }}
            />
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="data-table-wrapper" style={{ maxHeight: 'calc(100vh - 500px)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      className="op-checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                      onChange={selectAll}
                    />
                  </th>
                  <th>N° Pedido</th>
                  <th>Remisión</th>
                  <th>Fecha Despacho</th>
                  <th>Cliente</th>
                  <th>Cód. Cliente</th>
                  <th>OPs / Detalle</th>
                  <th>Bultos</th>
                  <th>KG</th>
                  <th>Estado</th>
                  {canEdit && <th style={{ width: 120 }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    Cargando pedidos liberados...
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10}>
                    <div className="fact-empty">
                      <Inbox size={48} />
                      <h3>No hay pedidos liberados</h3>
                      <p>Los pedidos deben ser liberados por Cartera antes de poder asignar factura.</p>
                    </div>
                  </td></tr>
                ) : filtered.map(p => {
                  const isSelected = selectedIds.has(p.id);
                  const totalBultos = (p.pedido_detalle || []).reduce((s: number, d: any) => s + (d.bultos_pedido || 0), 0);
                  const totalKg = totalBultos * 40;

                  // Find if interconnected
                  const grp = pedidoGroups.find(g => g.includes(p.id)) || [];
                  const isInterconnected = grp.length > 1;

                  return (
                    <tr 
                      key={p.id} 
                      className={`select-row ${isSelected ? 'selected' : ''}`} 
                      onClick={() => {
                        const sel = window.getSelection();
                        if (sel && sel.toString().length > 0) return;
                        toggleSelect(p.id);
                      }}
                      style={isInterconnected ? { borderLeft: '4px solid var(--primary-color)', background: 'rgba(59, 130, 246, 0.05)' } : { borderLeft: '4px solid transparent' }}
                    >
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="op-checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {p.num_pedido || '—'}
                        {isInterconnected && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--primary-color)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            🔗 ESCALERA
                          </div>
                        )}
                      </td>
                      <td>
                        {p.num_remision || (p.es_anticipado
                          ? <span className="estado-tag anticipado" style={{ fontSize: '0.68rem' }}>Anticipado</span>
                          : '—'
                        )}
                      </td>
                      <td>{p.fecha_despacho || '—'}</td>
                      <td>{p.nombre_cliente || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{p.codigo_cliente || '—'}</td>
                      <td>
                        <div className="pedido-detail-inline">
                          <table>
                            <thead>
                              <tr>
                                <th>OP</th>
                                <th>Referencia</th>
                                <th>Cód. Alimento</th>
                                <th>Bultos</th>
                                <th>KG</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(p.pedido_detalle || []).map((d: any, i: number) => (
                                <tr key={i}>
                                  <td style={{ fontWeight: 700 }}>{d.op}</td>
                                  <td>{d.referencia || '—'}</td>
                                  <td style={{ fontFamily: 'monospace' }}>{d.codigo_alimento || '—'}</td>
                                  <td>{d.bultos_pedido}</td>
                                  <td>{(d.bultos_pedido * 40)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{totalBultos}</td>
                      <td>{totalKg}</td>
                      <td>
                        {renderEstado(p.estado)}
                      </td>
                      {canEdit && (
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleDevolver(p.id, p.num_pedido)}
                              title="Devolver pedido para edición"
                            >
                              Devolver
                            </button>
                            {isAdmin && (
                              <button
                                className="btn btn-danger btn-sm btn-icon"
                                onClick={() => handleDelete(p.id, p.num_pedido)}
                                title="Eliminar Pedido"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
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

      {/* Factura Assignment Form */}
      {selectedIds.size > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              📋 Asignar Factura a {selectedIds.size} pedido{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
          <div className="card-body">
            {/* Orden SAP per OP */}
            {selectedOPs.size > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ marginBottom: 10, fontSize: '0.9rem' }}>Detalle SAP por OP Seleccionada</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {Array.from(selectedOPs.entries()).map(([op, det]) => {
                    const totalPedir = selectedOPsTotalBultos.get(op) || 0;
                    const programado = programacionOPs[op] || 0;
                    return (
                      <div key={op} className="form-group" style={{ marginBottom: 0, padding: 12, border: '1px solid var(--border-color)', borderRadius: 6, background: '#fafafa' }}>
                        <label className="form-label" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', alignSelf: 'flex-start', background: 'var(--bg-app)', padding: '2px 8px', borderRadius: 12 }}>
                            OP {op}
                          </span>
                          <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>Cód. Alimento: {det.codigo_alimento || '—'}</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Ref: {det.referencia || '—'}</span>
                          <div style={{ marginTop: 6, padding: '6px 8px', background: '#fff', borderRadius: 4, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Prog. total:</span> <strong style={{ color: 'var(--text-color)' }}>{programado} bultos</strong>
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Facturando:</span> <strong style={{ color: 'var(--color-primary)' }}>{totalPedir} bultos</strong>
                              </div>
                          </div>
                          {ordenSapLocked[op] && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              <span style={{ fontSize: '0.68rem', color: 'var(--color-success)' }}>
                                🔒 Asignada previamente
                              </span>
                              {isAdmin && canEdit && (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button
                                    className="btn btn-outline btn-sm"
                                    style={{ padding: '0px 4px', fontSize: '0.7rem' }}
                                    onClick={() => handleUnlockSAP(op)}
                                    title="Desbloquear para editar"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    style={{ padding: '0px 4px', fontSize: '0.7rem' }}
                                    onClick={() => handleDeleteSAPdb(op)}
                                    title="Borrar amarre SAP permanentemente"
                                  >
                                    🗑️ Borrar
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Orden SAP: 402XXXX"
                          value={ordenSapInputs[op] || ''}
                          onChange={e => handleOrdenSapChange(op, e.target.value)}
                          readOnly={ordenSapLocked[op] || !canEdit}
                          style={(ordenSapLocked[op] || !canEdit) ? { background: '#f5f5f5', cursor: 'not-allowed', marginTop: 8 } : { marginTop: 8 }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Factura fields */}
            <div className="factura-form-panel">
              <div className="grid-4" style={{ gap: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">N° Entrega</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="821XXXXXX"
                    value={numEntrega}
                    onChange={e => setNumEntrega(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">N° Factura *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="400XXXXX"
                    value={numFactura}
                    onChange={e => setNumFactura(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha Facturación *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={fechaFacturacion}
                    onChange={e => setFechaFacturacion(e.target.value)}
                    required
                  />
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', alignItems: 'end' }}>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
                      <FileCheck size={16} />
                      {saving ? 'Guardando...' : 'Asignar Factura'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
