import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldX, Search, Inbox, Trash2 } from 'lucide-react';
import { fetchPedidosPorEstado, actualizarEstadoPedido, eliminarPedido } from '../../lib/supabase';
import { toast } from '../../components/Toast';

export default function CarteraLiberacion({ onRefreshKpis, isAdmin, canEdit = true }: { onRefreshKpis?: () => void; isAdmin?: boolean; canEdit?: boolean }) {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);

  useEffect(() => {
    loadPedidos();
  }, []);

  const loadPedidos = async () => {
    setLoading(true);
    try {
      const data = await fetchPedidosPorEstado('PENDIENTE LIBERACIÓN');
      setPedidos(data);
    } catch (e: any) {
      toast.error('Error cargando cartera: ' + e.message);
    }
    setLoading(false);
  };

  const handleLiberar = async (pedidoId: number) => {
    if (!canEdit) return;
    setProcessing(pedidoId);
    try {
      await actualizarEstadoPedido(pedidoId, 'LIBERADO');
      toast.success('Pedido liberado correctamente.');
      loadPedidos();
      if (onRefreshKpis) onRefreshKpis();
    } catch (e: any) {
      toast.error('Error al liberar: ' + e.message);
    }
    setProcessing(null);
  };

  const handleRechazar = async (pedidoId: number) => {
    if (!canEdit) return;
    setProcessing(pedidoId);
    try {
      await actualizarEstadoPedido(pedidoId, 'VERIFICAR PEDIDO');
      toast.success('Pedido rechazado — marcado como VERIFICAR PEDIDO.');
      loadPedidos();
      if (onRefreshKpis) onRefreshKpis();
    } catch (e: any) {
      toast.error('Error al rechazar: ' + e.message);
    }
    setProcessing(null);
  };

  const handleDelete = async (pedidoId: number, numPedido: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el pedido ${numPedido || pedidoId}?`)) return;
    setProcessing(pedidoId);
    try {
      await eliminarPedido(pedidoId);
      toast.success('Pedido eliminado correctamente.');
      loadPedidos();
      if (onRefreshKpis) onRefreshKpis();
    } catch (e: any) {
      toast.error('Error al eliminar: ' + e.message);
    }
    setProcessing(null);
  };

  const filtered = pedidos.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (p.num_pedido || '').toLowerCase().includes(term) ||
      (p.nombre_cliente || '').toLowerCase().includes(term) ||
      String(p.num_remision || '').includes(term);
  });

  return (
    <div className="fact-tab-content">
      <div className="card">
        <div className="card-header">
          <span className="card-title">🏦 Cartera — Pedidos Pendientes de Liberación ({pedidos.length})</span>
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              className="form-input"
              placeholder="Buscar pedido, cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: 36, width: 280 }}
            />
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="data-table-wrapper" style={{ maxHeight: 'calc(100vh - 380px)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha Pedido</th>
                  <th>Hora</th>
                  <th>N° Pedido</th>
                  <th>Remisión</th>
                  <th>Cliente</th>
                  <th>Código Cliente</th>
                  <th>OPs</th>
                  <th>Bultos Total</th>
                  <th>Estado</th>
                  {canEdit && <th style={{ width: 180 }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    Cargando pedidos de cartera...
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10}>
                    <div className="fact-empty">
                      <Inbox size={48} />
                      <h3>Sin pedidos pendientes</h3>
                      <p>No hay pedidos esperando liberación de cartera.</p>
                    </div>
                  </td></tr>
                ) : filtered.map(p => {
                  const fecha = new Date(p.created_at);
                  const totalBultos = (p.pedido_detalle || []).reduce((s: number, d: any) => s + (d.bultos_pedido || 0), 0);
                  return (
                    <tr key={p.id}>
                      <td>{fecha.toLocaleDateString('es-CO')}</td>
                      <td>{fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ fontWeight: 700 }}>{p.num_pedido || '—'}</td>
                      <td>
                        {p.num_remision || (p.es_anticipado
                          ? <span className="estado-tag anticipado" style={{ fontSize: '0.68rem' }}>Anticipado</span>
                          : '—'
                        )}
                      </td>
                      <td>{p.nombre_cliente || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{p.codigo_cliente || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {(p.pedido_detalle || []).map((d: any, i: number) => (
                            <span key={i} style={{
                              background: 'var(--green-50)', border: '1px solid var(--green-200)',
                              borderRadius: 4, padding: '1px 5px', fontSize: '0.7rem', fontWeight: 700,
                            }}>{d.op}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{totalBultos.toLocaleString()}</td>
                      <td>
                        <span className="estado-tag pendiente-liberacion">PENDIENTE LIBERACIÓN</span>
                      </td>
                      {canEdit && (
                        <td>
                          <div className="action-btn-group">
                            <button
                              className="btn-liberar"
                              onClick={() => handleLiberar(p.id)}
                              disabled={processing === p.id}
                            >
                              <ShieldCheck size={14} /> Liberar
                            </button>
                            <button
                              className="btn-rechazar"
                              onClick={() => handleRechazar(p.id)}
                              disabled={processing === p.id}
                            >
                              <ShieldX size={14} /> Rechazar
                            </button>
                            {isAdmin && (
                              <button
                                className="btn btn-danger btn-sm btn-icon"
                                onClick={() => handleDelete(p.id, p.num_pedido)}
                                disabled={processing === p.id}
                                title="Eliminar Pedido"
                              >
                                <Trash2 size={14} />
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
          {/* Detail expandable per row */}
          {filtered.length > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {filtered.length} pedido{filtered.length !== 1 ? 's' : ''} en espera de liberación
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
