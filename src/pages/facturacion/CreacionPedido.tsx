import { useState, useEffect, useMemo } from 'react';
import { Search, FileText, Plus, Calendar } from 'lucide-react';
import {
  fetchRemisionesPendientes,
  fetchRemisionDetalle,
  crearPedido,
  actualizarPedido,
  fetchPedidosPorEstado,
  fetchPedidosPorRemision,
  fetchProgramacionParaAnticipado,
  fetchMaestros,
  eliminarPedido,
} from '../../lib/supabase';
import { toast } from '../../components/Toast';

const ESTADOS = [
  'PENDIENTE LIBERACIÓN',
  'PENDIENTE PAGO',
  'PENDIENTE PV',
  'LIBERADO',
  'VERIFICAR PEDIDO',
];

interface OPRow {
  selected: boolean;
  op: number;
  codigo_alimento: number;
  referencia: string;
  bultos_despachados: number;
  bultos_ya_pedidos: number;
  saldo_pendiente: number;
  bultos_pedido: number;
  kg: number;
}

export default function CreacionPedido({ onRefreshKpis, isAdmin, canEdit = true }: { onRefreshKpis?: () => void; isAdmin?: boolean; canEdit?: boolean }) {
  // Remisiones
  const [remisiones, setRemisiones] = useState<any[]>([]);
  const [remisionSearch, setRemisionSearch] = useState('');
  const [selectedRemision, setSelectedRemision] = useState<any>(null);
  const [, setLoadingRemisiones] = useState(false);

  // Date range filter for remisiones
  const [fechaRemDesde, setFechaRemDesde] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [fechaRemHasta, setFechaRemHasta] = useState(() => new Date().toISOString().split('T')[0]);

  // Anticipado mode
  const [esAnticipado, setEsAnticipado] = useState(false);
  const [programacion, setProgramacion] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteAnticipado, setClienteAnticipado] = useState('');
  const [clienteNombreAnticipado, setClienteNombreAnticipado] = useState('');

  // OP rows
  const [opRows, setOpRows] = useState<OPRow[]>([]);

  // Pedido form
  const [numPedido, setNumPedido] = useState('');
  const [estado, setEstado] = useState('PENDIENTE LIBERACIÓN');
  const [esCompartido, setEsCompartido] = useState(false);
  const [pedidoRelacionado, setPedidoRelacionado] = useState<number | null>(null);
  const [pedidosDeRemision, setPedidosDeRemision] = useState<any[]>([]);

  // Edit state
  const [editingPedido, setEditingPedido] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Existing pedidos list
  const [pedidosExistentes, setPedidosExistentes] = useState<any[]>([]);
  const [showPedidosList, setShowPedidosList] = useState(false);
  const [pedidosListFilter, setPedidosListFilter] = useState('');

  // Load remisiones
  useEffect(() => {
    loadRemisiones();
    loadPedidosExistentes();
  }, []);

  const loadRemisiones = async () => {
    setLoadingRemisiones(true);
    try {
      const data = await fetchRemisionesPendientes();
      setRemisiones(data);
    } catch (e: any) {
      toast.error('Error cargando remisiones: ' + e.message);
    }
    setLoadingRemisiones(false);
  };

  const loadPedidosExistentes = async () => {
    try {
      const data = await fetchPedidosPorEstado([
        'PENDIENTE LIBERACIÓN', 'PENDIENTE PAGO', 'PENDIENTE PV', 'LIBERADO', 'VERIFICAR PEDIDO'
      ]);
      setPedidosExistentes(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadAnticipado = async () => {
    try {
      const [prog, maestros] = await Promise.all([
        fetchProgramacionParaAnticipado(),
        fetchMaestros(),
      ]);
      setProgramacion(prog);
      setClientes(maestros.clientes || []);
    } catch (e: any) {
      toast.error('Error cargando datos: ' + e.message);
    }
  };

  // Toggle anticipado mode
  const handleToggleAnticipado = () => {
    const newVal = !esAnticipado;
    setEsAnticipado(newVal);
    if (newVal) {
      setSelectedRemision(null);
      setOpRows([]);
      loadAnticipado();
    } else {
      setProgramacion([]);
      setClientes([]);
      setClienteAnticipado('');
      setClienteNombreAnticipado('');
    }
  };

  // Select a remision
  const handleSelectRemision = async (numRemision: number) => {
    try {
      const detalle = await fetchRemisionDetalle(numRemision);
      if (!detalle) {
        toast.error('Remisión no encontrada o completamente facturada.');
        return;
      }
      setSelectedRemision(detalle);
      setOpRows(detalle.ops.map((op: any) => ({
        selected: op.saldo_pendiente > 0,
        op: op.op,
        codigo_alimento: op.codigo_alimento,
        referencia: op.referencia,
        bultos_despachados: op.bultos_despachados,
        bultos_ya_pedidos: op.bultos_ya_pedidos,
        saldo_pendiente: op.saldo_pendiente,
        bultos_pedido: op.saldo_pendiente > 0 ? op.saldo_pendiente : 0,
        kg: (op.saldo_pendiente > 0 ? op.saldo_pendiente : 0) * 40,
      })));

      // Load related pedidos for compartido
      const pedRem = await fetchPedidosPorRemision(numRemision);
      setPedidosDeRemision(pedRem);
    } catch (e: any) {
      toast.error('Error al cargar remisión: ' + e.message);
    }
  };

  // Search remision by number
  const handleSearchRemision = () => {
    const num = parseInt(remisionSearch);
    if (isNaN(num)) {
      toast.error('Ingresa un número de remisión válido.');
      return;
    }
    handleSelectRemision(num);
  };

  const remisionesEnRango = useMemo(() => {
    return remisiones.filter(r => {
      if (fechaRemDesde && r.fecha_despacho < fechaRemDesde) return false;
      if (fechaRemHasta && r.fecha_despacho > fechaRemHasta) return false;
      return true;
    });
  }, [remisiones, fechaRemDesde, fechaRemHasta]);

  // Filtered remisiones for dropdown
  const filteredRemisiones = useMemo(() => {
    const term = remisionSearch.toLowerCase();
    return remisionesEnRango.filter(r => {
      if (term) {
        if (!String(r.num_remision).includes(term) && !(r.cliente_nombre || '').toLowerCase().includes(term)) {
          return false;
        }
      }
      return true;
    });
  }, [remisionesEnRango, remisionSearch]);

  // Toggle OP selection
  const toggleOP = (idx: number) => {
    setOpRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], selected: !next[idx].selected };
      if (!next[idx].selected) {
        next[idx].bultos_pedido = 0;
        next[idx].kg = 0;
      } else {
        next[idx].bultos_pedido = next[idx].saldo_pendiente;
        next[idx].kg = next[idx].saldo_pendiente * 40;
      }
      return next;
    });
  };

  // Update bultos_pedido
  const updateBultosPedido = (idx: number, value: number) => {
    setOpRows(prev => {
      const next = [...prev];
      const row = { ...next[idx] };
      const max = row.saldo_pendiente;
      if (value > max) {
        toast.error(`No puedes pedir más de ${max} bultos (saldo pendiente) para OP ${row.op}.`);
        row.bultos_pedido = max;
      } else if (value < 0) {
        row.bultos_pedido = 0;
      } else {
        row.bultos_pedido = value;
      }
      row.kg = row.bultos_pedido * 40;
      next[idx] = row;
      return next;
    });
  };

  // Add OP for anticipado
  const [opAnticipado, setOpAnticipado] = useState('');
  const addOPAnticipado = () => {
    const opNum = parseInt(opAnticipado);
    if (isNaN(opNum)) return;
    if (opRows.some(r => r.op === opNum)) {
      toast.error('Esa OP ya está agregada.');
      return;
    }
    const prog = programacion.find(p => p.op === opNum);
    setOpRows(prev => [...prev, {
      selected: true,
      op: opNum,
      codigo_alimento: prog?.codigo_alimento || 0,
      referencia: prog?.referencia || '',
      bultos_despachados: 0,
      bultos_ya_pedidos: 0,
      saldo_pendiente: 99999,
      bultos_pedido: 0,
      kg: 0,
    }]);
    setOpAnticipado('');
  };

  // Remove OP for anticipado
  const removeOPAnticipado = (idx: number) => {
    setOpRows(prev => prev.filter((_, i) => i !== idx));
  };

  // Save pedido
  const handleSave = async () => {
    if (!canEdit) return;
    // Validations
    const selectedOps = opRows.filter(r => r.selected && r.bultos_pedido > 0);
    if (selectedOps.length === 0) {
      toast.error('Selecciona al menos una OP con bultos a pedir.');
      return;
    }
    if (estado !== 'PENDIENTE PV' && !numPedido.trim()) {
      toast.error('El número de pedido es obligatorio (excepto para PENDIENTE PV).');
      return;
    }
    if (!esAnticipado && !selectedRemision) {
      toast.error('Selecciona una remisión.');
      return;
    }

    setSaving(true);
    try {
      const pedidoData = {
        num_pedido: numPedido.trim() || undefined,
        num_remision: esAnticipado ? null : selectedRemision?.num_remision,
        cliente_id: esAnticipado ? (clienteAnticipado ? parseInt(clienteAnticipado) : undefined) : selectedRemision?.cliente_codigo,
        codigo_cliente: esAnticipado ? (clienteAnticipado ? parseInt(clienteAnticipado) : undefined) : selectedRemision?.cliente_codigo,
        nombre_cliente: esAnticipado ? clienteNombreAnticipado : selectedRemision?.cliente_nombre,
        fecha_despacho: esAnticipado ? undefined : selectedRemision?.fecha_despacho,
        estado,
        es_anticipado: esAnticipado,
        pedido_relacionado_id: esCompartido ? pedidoRelacionado : null,
      };

      const detalles = selectedOps.map(op => ({
        op: op.op,
        codigo_alimento: op.codigo_alimento,
        referencia: op.referencia,
        bultos_despachados: op.bultos_despachados,
        bultos_pedido: op.bultos_pedido,
      }));

      if (editingPedido) {
        await actualizarPedido(editingPedido.id, {
          num_pedido: pedidoData.num_pedido,
          estado: pedidoData.estado,
          pedido_relacionado_id: pedidoData.pedido_relacionado_id,
        }, detalles);
        toast.success('Pedido actualizado correctamente.');
      } else {
        await crearPedido(pedidoData, detalles);
        toast.success('Pedido creado correctamente.');
      }

      // Reset form
      resetForm();
      loadRemisiones();
      loadPedidosExistentes();
      if (onRefreshKpis) onRefreshKpis();
    } catch (e: any) {
      toast.error('Error al guardar: ' + e.message);
    }
    setSaving(false);
  };

  const resetForm = () => {
    setSelectedRemision(null);
    setOpRows([]);
    setNumPedido('');
    setEstado('PENDIENTE LIBERACIÓN');
    setEsCompartido(false);
    setPedidoRelacionado(null);
    setEditingPedido(null);
    setRemisionSearch('');
    setEsAnticipado(false);
  };

  // Edit existing pedido
  const handleEditPedido = async (pedido: any) => {
    setEditingPedido(pedido);
    setNumPedido(pedido.num_pedido || '');
    setEstado(pedido.estado);
    setEsAnticipado(pedido.es_anticipado || false);
    setEsCompartido(!!pedido.pedido_relacionado_id);
    setPedidoRelacionado(pedido.pedido_relacionado_id);
    setShowPedidosList(false);

    if (pedido.es_anticipado) {
      loadAnticipado();
      setClienteAnticipado(String(pedido.codigo_cliente));
      setClienteNombreAnticipado(pedido.nombre_cliente);

      if (pedido.pedido_detalle) {
        setOpRows(pedido.pedido_detalle.map((d: any) => ({
          selected: true,
          op: d.op,
          codigo_alimento: d.codigo_alimento || 0,
          referencia: d.referencia || '',
          bultos_despachados: 0,
          bultos_ya_pedidos: 0,
          saldo_pendiente: 99999,
          bultos_pedido: d.bultos_pedido,
          kg: d.bultos_pedido * 40,
        })));
      }
    } else if (pedido.num_remision) {
      try {
        // Fetch remaining balance excluding this pedido's reserved amounts
        const detalle = await fetchRemisionDetalle(pedido.num_remision, pedido.id);
        if (!detalle) {
          toast.error('No se pudo cargar la remisión para editar.');
          return;
        }
        setSelectedRemision(detalle);

        const pedidoDetalleMap = new Map();
        for (const d of (pedido.pedido_detalle || [])) {
          pedidoDetalleMap.set(d.op, d);
        }

        setOpRows(detalle.ops.map((op: any) => {
          const det = pedidoDetalleMap.get(op.op);
          const selected = !!det;
          const bultos_pedido = selected ? det.bultos_pedido : 0;
          return {
            selected,
            op: op.op,
            codigo_alimento: op.codigo_alimento,
            referencia: op.referencia,
            bultos_despachados: op.bultos_despachados,
            bultos_ya_pedidos: op.bultos_ya_pedidos,
            saldo_pendiente: op.saldo_pendiente,
            bultos_pedido,
            kg: bultos_pedido * 40,
          };
        }));

        const pedRem = await fetchPedidosPorRemision(pedido.num_remision);
        setPedidosDeRemision(pedRem);
      } catch (e: any) {
        toast.error('Error al cargar remisión para edición: ' + e.message);
      }
    }
  };
  const handleDeletePedido = async (pedido: any) => {
    if (!window.confirm(`¿Estás seguro de eliminar el pedido ${pedido.num_pedido || pedido.id}?`)) return;
    try {
      await eliminarPedido(pedido.id);
      toast.success('Pedido eliminado correctamente.');
      loadPedidosExistentes();
      loadRemisiones();
      if (onRefreshKpis) onRefreshKpis();
    } catch (e: any) {
      toast.error('Error al eliminar: ' + e.message);
    }
  };

  // Render estado tag
  const renderEstado = (est: string) => {
    const cls = est.toLowerCase().replace(/\s+/g, '-').replace(/ó/g, 'o');
    return <span className={`estado-tag ${cls}`}>{est}</span>;
  };

  return (
    <div className="fact-tab-content">
      {/* Top Section: Search + Form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">
            {editingPedido ? '✏️ Editar Pedido' : '📝 Crear Nuevo Pedido'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => { setShowPedidosList(!showPedidosList); setPedidosListFilter(''); }}>
              <FileText size={14} /> {showPedidosList ? 'Ocultar' : 'Ver'} Pedidos Existentes
            </button>
            {editingPedido && (
              <button className="btn btn-outline btn-sm" onClick={resetForm}>Cancelar Edición</button>
            )}
          </div>
        </div>
        <div className="card-body">
          {/* Toggle Anticipado */}
          <div className="toggle-row">
            <button
              className={`toggle-switch ${esAnticipado ? 'on' : ''}`}
              onClick={handleToggleAnticipado}
            />
            <span className="toggle-label">
              Pedido Anticipado (sin remisión) — Para Puropollo, Incuba, Krokodeilos o Frijol Soya
            </span>
            {esAnticipado && <span className="estado-tag anticipado">ANTICIPADO</span>}
          </div>

          {/* Remision Search (not anticipado) */}
          {!esAnticipado && (
            <>
              {/* Date range for remisiones */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: 'var(--bg-app)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Rango de Remisiones:</span>
                <input type="date" className="form-input" value={fechaRemDesde} onChange={e => setFechaRemDesde(e.target.value)}
                  style={{ width: 145, padding: '4px 8px', fontSize: '0.85rem' }} title="Fecha Desde" />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>→</span>
                <input type="date" className="form-input" value={fechaRemHasta} onChange={e => setFechaRemHasta(e.target.value)}
                  style={{ width: 145, padding: '4px 8px', fontSize: '0.85rem' }} title="Fecha Hasta" />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({remisionesEnRango.length} remisiones en rango)
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'end' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Buscar Remisión</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="N° Remisión o nombre de cliente..."
                      value={remisionSearch}
                      onChange={e => setRemisionSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearchRemision()}
                    />
                    <button className="btn btn-primary btn-sm" onClick={handleSearchRemision}>
                      <Search size={14} /> Buscar
                    </button>
                  </div>
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Remisiones Pendientes ({filteredRemisiones.length})</label>
                  <select className="form-select" value="" onChange={e => {
                    const num = parseInt(e.target.value);
                    if (!isNaN(num)) handleSelectRemision(num);
                  }}>
                    <option value="">Seleccionar remisión pendiente...</option>
                    {filteredRemisiones.map(r => (
                      <option key={r.num_remision} value={r.num_remision}>
                        {r.num_remision} — {r.cliente_nombre} — {r.fecha_despacho} ({r.ops.filter((o: any) => o.saldo_pendiente > 0).length} OPs)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Anticipado client selection */}
          {esAnticipado && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Cliente *</label>
                <select className="form-select" value={clienteAnticipado} onChange={e => {
                  setClienteAnticipado(e.target.value);
                  const cl = clientes.find((c: any) => String(c.codigo_sap) === e.target.value);
                  setClienteNombreAnticipado(cl?.nombre || '');
                }}>
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map((c: any) => (
                    <option key={c.codigo_sap} value={c.codigo_sap}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Agregar OP</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="form-select" value={opAnticipado} onChange={e => setOpAnticipado(e.target.value)}>
                    <option value="">Seleccionar OP...</option>
                    {programacion.map(p => (
                      <option key={p.op} value={p.op}>{p.op} — {p.referencia}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={addOPAnticipado}>
                    <Plus size={14} /> Agregar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Remision Info Panel */}
          {selectedRemision && (
            <div className="remision-panel">
              <div className="info-item">
                <span className="info-label">N° Remisión</span>
                <span className="info-value large">{selectedRemision.num_remision}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Fecha Despacho</span>
                <span className="info-value">{selectedRemision.fecha_despacho}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Cliente</span>
                <span className="info-value">{selectedRemision.cliente_nombre}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Código Cliente</span>
                <span className="info-value">{selectedRemision.cliente_codigo}</span>
              </div>
            </div>
          )}

          {/* Pedido Form Fields */}
          {(selectedRemision || esAnticipado) && (
            <>
              <div className="grid-4" style={{ marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">N° Pedido {estado !== 'PENDIENTE PV' ? '*' : ''}</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="421XXXXXX"
                    value={numPedido}
                    onChange={e => setNumPedido(e.target.value)}
                    required={estado !== 'PENDIENTE PV'}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Estado del Pedido *</label>
                  <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}>
                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha Creación</label>
                  <input type="text" className="form-input" readOnly value={new Date().toLocaleString('es-CO')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Estado</label>
                  {renderEstado(estado)}
                </div>
              </div>

              {/* Compartido toggle */}
              {!esAnticipado && selectedRemision && (
                <div className="toggle-row">
                  <button
                    className={`toggle-switch ${esCompartido ? 'on' : ''}`}
                    onClick={() => setEsCompartido(!esCompartido)}
                  />
                  <span className="toggle-label">¿Este pedido va compartido con otro?</span>
                  {esCompartido && pedidosDeRemision.length > 0 && (
                    <select
                      className="form-select"
                      style={{ maxWidth: 350 }}
                      value={pedidoRelacionado || ''}
                      onChange={e => setPedidoRelacionado(e.target.value ? parseInt(e.target.value) : null)}
                    >
                      <option value="">Seleccionar pedido relacionado...</option>
                      {pedidosDeRemision.map(p => (
                        <option key={p.id} value={p.id}>
                          Pedido #{p.num_pedido || p.id} — {p.estado}
                        </option>
                      ))}
                    </select>
                  )}
                  {esCompartido && pedidosDeRemision.length === 0 && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No hay otros pedidos en esta remisión.</span>
                  )}
                </div>
              )}
            </>
          )}

          {/* OP Table */}
          {opRows.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ marginBottom: 10 }}>Detalle de OPs</h4>
              <div style={{ overflowX: 'auto' }}>
                <table className="op-select-table">
                  <thead>
                    <tr>
                      {!esAnticipado && <th style={{ width: 40 }}>✓</th>}
                      <th>OP</th>
                      <th>Referencia</th>
                      <th>Código Alimento</th>
                      <th>Bultos Desp.</th>
                      <th>Ya Pedidos</th>
                      <th>Saldo</th>
                      <th>Bultos a Pedir</th>
                      <th>KG</th>
                      {esAnticipado && <th style={{ width: 40 }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {opRows.map((row, idx) => (
                      <tr key={idx} className={row.selected ? 'selected' : (row.saldo_pendiente <= 0 && !esAnticipado) ? 'disabled' : ''}>
                        {!esAnticipado && (
                          <td>
                            <input
                              type="checkbox"
                              className="op-checkbox"
                              checked={row.selected}
                              onChange={() => toggleOP(idx)}
                              disabled={row.saldo_pendiente <= 0}
                            />
                          </td>
                        )}
                        <td style={{ fontWeight: 700 }}>{row.op}</td>
                        <td>{row.referencia || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.codigo_alimento || '—'}</td>
                        <td>{row.bultos_despachados || (esAnticipado ? '—' : 0)}</td>
                        <td>{esAnticipado ? '—' : row.bultos_ya_pedidos}</td>
                        <td>
                          {esAnticipado ? '—' : (
                            <span className={row.saldo_pendiente > 0 ? 'saldo-ok' : 'saldo-zero'}>
                              {row.saldo_pendiente}
                            </span>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: 90, padding: '6px 8px' }}
                            min={0}
                            max={esAnticipado ? undefined : row.saldo_pendiente}
                            value={row.bultos_pedido || ''}
                            onChange={e => {
                              const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                              updateBultosPedido(idx, val);
                            }}
                            disabled={!row.selected}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{(row.bultos_pedido * 40).toLocaleString()}</td>
                        {esAnticipado && (
                          <td>
                            <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeOPAnticipado(idx)}>✕</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700, background: 'rgba(46,125,50,0.06)' }}>
                      <td colSpan={esAnticipado ? 6 : 7} style={{ textAlign: 'right' }}>TOTAL</td>
                      <td>{opRows.filter(r => r.selected).reduce((s, r) => s + r.bultos_pedido, 0)}</td>
                      <td>{(opRows.filter(r => r.selected).reduce((s, r) => s + r.bultos_pedido, 0) * 40).toLocaleString()}</td>
                      {esAnticipado && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Save Button */}
          {canEdit && (selectedRemision || (esAnticipado && opRows.length > 0)) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-outline" onClick={resetForm}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : editingPedido ? 'Actualizar Pedido' : 'Crear Pedido'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Existing Pedidos List */}
      {showPedidosList && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Pedidos Existentes ({pedidosExistentes.length})</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Filtrar..."
                value={pedidosListFilter}
                onChange={e => setPedidosListFilter(e.target.value)}
                style={{ width: 200, padding: '6px 10px', fontSize: '0.82rem' }}
              />
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="data-table-wrapper" style={{ maxHeight: 400 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>N° Pedido</th>
                    <th>Remisión</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th>OPs</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosExistentes
                    .filter(p => {
                      if (!pedidosListFilter) return true;
                      const term = pedidosListFilter.toLowerCase();
                      return (p.num_pedido || '').toLowerCase().includes(term) ||
                        (p.nombre_cliente || '').toLowerCase().includes(term) ||
                        String(p.num_remision || '').includes(term);
                    })
                    .slice(0, 100)
                    .map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 700 }}>{p.num_pedido || '—'}</td>
                        <td>{p.num_remision || (p.es_anticipado ? <span className="estado-tag anticipado">Anticipado</span> : '—')}</td>
                        <td>{p.nombre_cliente || '—'}</td>
                        <td>{renderEstado(p.estado)}</td>
                        <td style={{ fontSize: '0.8rem' }}>{new Date(p.created_at).toLocaleDateString('es-CO')}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(p.pedido_detalle || []).map((d: any, i: number) => (
                              <span key={i} style={{
                                background: 'var(--green-50)',
                                border: '1px solid var(--green-200)',
                                borderRadius: 4, padding: '1px 6px',
                                fontSize: '0.72rem', fontWeight: 600,
                              }}>{d.op}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {canEdit && (!['PENDIENTE LIBERACIÓN', 'LIBERADO', 'FACTURADO', 'ANULADA'].includes(p.estado)) && (
                              <button className="btn btn-outline btn-sm" onClick={() => handleEditPedido(p)}>
                                Editar
                              </button>
                            )}
                            {isAdmin && (
                              <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDeletePedido(p)} title="Eliminar Pedido">
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
