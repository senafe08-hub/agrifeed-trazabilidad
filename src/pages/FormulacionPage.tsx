import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FlaskConical, Search, Plus, Edit2, Trash2, ChevronDown, ChevronUp,
  Download, Link2, Zap, Package, X, Check, AlertTriangle, Copy, CheckSquare, Square, RotateCcw, FileText
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import supabase, {
  fetchFormulas, fetchFormulaConDetalle, createFormula, updateFormula, deleteFormula,
  toggleFormulaEstado, assignFormulaToOP, fetchOPsConFormula,
  fetchInventarioMateriales, fetchOPsParaExplosion, liquidarExplosionInventario, calcularInventarioConsolidado,
  reversarLiquidacionExplosion,
  type FormulaHeader, type FormulaDetalle,
} from '../lib/supabase';
import { toast } from '../components/Toast';
import { usePermissions } from '../lib/permissions';
import type { MaestroAlimento, MaestroCliente, InventarioMaterial, ProgramacionRow } from '../lib/types';

/* ── Reusable material search select ── */
const MaterialSearchSelect = ({ value, onChange, materiales, style }: { value: string | number; onChange: (val: string) => void; materiales: InventarioMaterial[]; style?: React.CSSProperties }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const m = materiales.find((x) => x.id === Number(value));
  const display = m ? `${m.codigo} — ${m.nombre}` : '';
  const filtered = materiales.filter((x) =>
    `${x.codigo} - ${x.nombre}`.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 60);
  return (
    <div style={{ position: 'relative', ...style }}>
      <input className="form-input" value={open ? search : display}
        placeholder={display || 'Buscar material...'}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', borderColor: open ? '#43A047' : 'var(--border-color)', background: '#fff' }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '6px', maxHeight: 220, overflowY: 'auto', zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          {filtered.length === 0 ? <div style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Sin resultados</div> :
            filtered.map((x) => (
              <div
                key={x.id}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-color)' }}
                onMouseDown={() => { onChange(String(x.id)); setOpen(false); }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
              >
                {x.codigo} - {x.nombre}
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

const REFS = ['MACROS', 'MICROS', 'MENORES', 'LIQUIDOS', 'EMPAQUES'];

interface FormulacionPanelProps {
  canEdit: boolean;
  tab: 'catalogo' | 'asociar' | 'explosion';
}

export default function FormulacionPanel({ canEdit, tab }: FormulacionPanelProps) {
  const [materiales, setMateriales] = useState<InventarioMaterial[]>([]);
  const [alimentos, setAlimentos] = useState<MaestroAlimento[]>([]);
  const [clientes, setClientes] = useState<MaestroCliente[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  useEffect(() => {
    fetchInventarioMateriales().then(setMateriales).catch(() => {});
    supabase.from('maestro_alimentos').select('codigo_sap, descripcion, categoria').order('descripcion').then(({ data }) => {
      if (data) {
        setAlimentos(data);
        // Extract unique categories from the actual food master data
        const cats = [...new Set((data.map((a: MaestroAlimento) => a.categoria).filter(Boolean) as string[]))].sort();
        setCategorias(cats);
      }
    });
    supabase.from('maestro_clientes').select('codigo_sap, nombre').order('nombre').then(({ data }) => { if (data) setClientes(data); });
  }, []);

  return (
    <>
      {tab === 'catalogo' && <CatalogoTab canEdit={canEdit} materiales={materiales} alimentos={alimentos} clientes={clientes} categorias={categorias} />}
      {tab === 'asociar' && <AsociarTab canEdit={canEdit} />}
      {tab === 'explosion' && <ExplosionTab clientes={clientes} />}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  TAB 1: CATÁLOGO DE FÓRMULAS (grouped by category)           */
/* ══════════════════════════════════════════════════════════════ */
function CatalogoTab({ canEdit, materiales, alimentos, clientes, categorias }: { canEdit: boolean; materiales: InventarioMaterial[]; alimentos: MaestroAlimento[]; clientes: MaestroCliente[]; categorias: string[] }) {
  const { userRole } = usePermissions('formulacion');
  const isAdmin = userRole === 'Administrador';
  const [formulas, setFormulas] = useState<FormulaHeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<'all' | 'activa' | 'inactiva'>('all');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [detalleCache, setDetalleCache] = useState<Record<number, FormulaDetalle[]>>({});
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    nombre: '', alimento_sap: '', cliente_sap: '',
    observaciones: '', sacos_por_bache: '50', estado: 'activa' as 'activa' | 'inactiva',
    categoria: '',
    fecha_formulacion: new Date().toISOString().split('T')[0],
  });
  const [formDetalles, setFormDetalles] = useState<{ material_id: string | number; cantidad_base: string; referencia: string; observaciones: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setFormulas(await fetchFormulas()); } catch (e: unknown) { toast.error((e as Error).message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = formulas;
    if (filterEstado !== 'all') list = list.filter(f => f.estado === filterEstado);
    if (filterCategoria) list = list.filter(f => f.categoria === filterCategoria);
    if (search) { const s = search.toLowerCase(); list = list.filter(f => f.nombre.toLowerCase().includes(s) || (f.observaciones || '').toLowerCase().includes(s)); }
    return list;
  }, [formulas, search, filterEstado, filterCategoria]);

  type GroupedFormulas = Record<string, Record<string, FormulaHeader[]>>;

  const grouped = useMemo<GroupedFormulas>(() => {
    const groups: GroupedFormulas = {};
    for (const f of filtered) {
      const cat = f.categoria || 'Sin categoría';
      const rawDate = f.created_at ? f.created_at.split('T')[0] : '1970-01-01';
      
      if (!groups[cat]) groups[cat] = {};
      if (!groups[cat][rawDate]) groups[cat][rawDate] = [];
      
      groups[cat][rawDate].push(f);
    }
    return groups;
  }, [filtered]);

  const handleExpand = async (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) { next.delete(id); } else {
      next.add(id);
      if (!detalleCache[id]) { try { const { detalle } = await fetchFormulaConDetalle(id); setDetalleCache(prev => ({ ...prev, [id]: detalle })); } catch (e: unknown) { toast.error((e as Error).message); } }
    }
    setExpanded(next);
  };

  const handleNew = () => {
    setEditingId(null);
    setForm({ nombre: '', alimento_sap: '', cliente_sap: '', observaciones: '', sacos_por_bache: '50', estado: 'activa', categoria: categorias[0] || '', fecha_formulacion: new Date().toISOString().split('T')[0] });
    setFormDetalles([{ material_id: '', cantidad_base: '', referencia: 'MACROS', observaciones: '' }]);
    setShowForm(true);
  };

  const handleEdit = async (f: FormulaHeader) => {
    setEditingId(f.id!);
    setForm({ nombre: f.nombre, alimento_sap: String(f.alimento_sap || ''), cliente_sap: String(f.cliente_sap || ''), observaciones: f.observaciones || '', sacos_por_bache: String(f.sacos_por_bache || 50), estado: f.estado, categoria: f.categoria || '', fecha_formulacion: f.created_at ? f.created_at.split('T')[0] : new Date().toISOString().split('T')[0] });
    try { const { detalle } = await fetchFormulaConDetalle(f.id!); setFormDetalles(detalle.map(d => ({ material_id: d.material_id, cantidad_base: String(d.cantidad_base), referencia: d.referencia || 'MACROS', observaciones: d.observaciones || '' }))); } catch { setFormDetalles([]); }
    setShowForm(true);
  };

  const handleDuplicate = async (f: FormulaHeader) => {
    setEditingId(null);
    setForm({ nombre: f.nombre + ' (copia)', alimento_sap: String(f.alimento_sap || ''), cliente_sap: String(f.cliente_sap || ''), observaciones: f.observaciones || '', sacos_por_bache: String(f.sacos_por_bache || 50), estado: 'activa', categoria: f.categoria || '', fecha_formulacion: new Date().toISOString().split('T')[0] });
    try { const { detalle } = await fetchFormulaConDetalle(f.id!); setFormDetalles(detalle.map(d => ({ material_id: d.material_id, cantidad_base: String(d.cantidad_base), referencia: d.referencia || 'MACROS', observaciones: d.observaciones || '' }))); } catch { setFormDetalles([]); }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) return toast.error('El nombre es requerido');
    const validDetalles = formDetalles.filter(d => d.material_id && d.cantidad_base);
    if (validDetalles.length === 0) return toast.error('Agrega al menos un ingrediente');
    const header = { nombre: form.nombre.trim(), alimento_sap: form.alimento_sap ? Number(form.alimento_sap) : null, cliente_sap: form.cliente_sap ? Number(form.cliente_sap) : null, observaciones: form.observaciones, sacos_por_bache: Number(form.sacos_por_bache) || 50, categoria: form.categoria, estado: form.estado, created_at: `${form.fecha_formulacion}T12:00:00.000Z` };
    const detalles = validDetalles.map(d => ({ material_id: Number(d.material_id), cantidad_base: Number(d.cantidad_base), unidad: 'KG', referencia: d.referencia || '', observaciones: d.observaciones || '' }));
    try {
      if (editingId) { await updateFormula(editingId, header, detalles); toast.success('Fórmula actualizada'); setDetalleCache(prev => { const n = { ...prev }; delete n[editingId]; return n; }); }
      else { await createFormula(header, detalles); toast.success('Fórmula creada'); }
      setShowForm(false); load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const handleToggle = async (f: FormulaHeader) => { try { await toggleFormulaEstado(f.id!, f.estado === 'activa' ? 'inactiva' : 'activa'); toast.success('Estado actualizado'); load(); } catch (e: unknown) { toast.error((e as Error).message); } };
  
  const handleDelete = async (f: FormulaHeader) => {
    if (!window.confirm(`¿Estás seguro de eliminar permanentemente la fórmula "${f.nombre}"?`)) return;
    try { await deleteFormula(f.id!); toast.success('Fórmula eliminada correctamente'); load(); } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const addIngrediente = () => setFormDetalles(p => [...p, { material_id: '', cantidad_base: '', referencia: 'MACROS', observaciones: '' }]);
  const removeIngrediente = (idx: number) => setFormDetalles(p => p.filter((_, i) => i !== idx));
  const updateIngrediente = (idx: number, field: string, val: string | number) => setFormDetalles(p => p.map((d, i) => i === idx ? { ...d, [field]: val } : d));
  const toggleCat = (cat: string) => setExpandedCats(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
  const toggleDate = (key: string) => setExpandedDates(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  // Color palette for categories
  const catColors: Record<string, string> = {};
  const palette = ['#2E7D32','#E91E63','#FF9800','#795548','#00BCD4','#9C27B0','#607D8B','#1565C0','#F44336','#009688','#FF5722','#3F51B5'];
  categorias.forEach((c, i) => { catColors[c] = palette[i % palette.length]; });

  const renderFormulaRow = (f: FormulaHeader) => {
    const isExp = expanded.has(f.id!);
    const det = detalleCache[f.id!];
    return (
      <> 
        <tr key={f.id} onClick={() => handleExpand(f.id!)} style={{ cursor: 'pointer' }}>
          <td>{isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
          <td style={{ fontWeight: 700 }}>{f.nombre}</td>
          <td style={{ textAlign: 'center' }}><span className="badge badge-info">{f.sacos_por_bache} sacos</span></td>
          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.observaciones || '—'}</td>
          <td style={{ textAlign: 'center' }}>
            <span className={`badge ${f.estado === 'activa' ? 'badge-success' : 'badge-warning'}`} style={f.estado === 'activa' ? { background: 'rgba(46,125,50,0.12)', color: '#2E7D32' } : { background: 'rgba(245,124,0,0.12)', color: '#E65100' }}>
              {f.estado === 'activa' ? '● Activa' : '○ Inactiva'}
            </span>
          </td>
          {canEdit && <td>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
              <button className="btn btn-outline btn-sm btn-icon" title="Editar" onClick={() => handleEdit(f)}><Edit2 size={14} /></button>
              <button className="btn btn-outline btn-sm btn-icon" title="Duplicar" onClick={() => handleDuplicate(f)} style={{ color: '#1565C0', borderColor: '#1565C0' }}><Copy size={14} /></button>
              <button className={`btn btn-sm btn-icon ${f.estado === 'activa' ? 'btn-outline' : 'btn-primary'}`} title={f.estado === 'activa' ? 'Inactivar' : 'Activar'} onClick={() => handleToggle(f)} style={f.estado === 'activa' ? { borderColor: '#E65100', color: '#E65100' } : {}}>{f.estado === 'activa' ? <X size={14} /> : <Check size={14} />}</button>
              {isAdmin && (
                <button className="btn btn-outline btn-sm btn-icon" title="Eliminar definitivamente" onClick={() => handleDelete(f)} style={{ color: '#F44336', borderColor: '#F44336' }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </td>}
        </tr>
        {isExp && (
          <tr key={`exp-${f.id}`} style={{ background: 'rgba(46,125,50,0.02)' }}>
            <td colSpan={canEdit ? 6 : 5} style={{ padding: '12px 20px' }}>
              {!det ? <span style={{ color: 'var(--text-muted)' }}>Cargando...</span> : det.length === 0 ? <span>Sin ingredientes</span> : (
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border-color)' }}><th style={{ textAlign: 'left', padding: '4px 8px' }}>Código</th><th style={{ textAlign: 'left', padding: '4px 8px' }}>Materia Prima</th><th style={{ textAlign: 'right', padding: '4px 8px' }}>KG / Bache</th><th style={{ textAlign: 'center', padding: '4px 8px' }}>Ref</th></tr></thead>
                  <tbody>
                    {det.map((d, i) => (<tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}><td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--text-muted)' }}>{d.inventario_materiales?.codigo || d.material_id}</td><td style={{ padding: '4px 8px' }}>{d.inventario_materiales?.nombre || '—'}</td><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{Number(d.cantidad_base).toLocaleString('es-CO', { maximumFractionDigits: 2 })}</td><td style={{ padding: '4px 8px', textAlign: 'center' }}><span className="badge badge-info" style={{ fontSize: '0.75rem' }}>{d.referencia}</span></td></tr>))}
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-color)' }}><td colSpan={2} style={{ padding: '6px 8px', textAlign: 'right' }}>TOTAL KG / BACHE:</td><td style={{ padding: '6px 8px', textAlign: 'right', color: '#2E7D32', fontSize: '1rem' }}>{det.reduce((s, d) => s + Number(d.cantidad_base), 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })}</td><td></td></tr>
                  </tbody>
                </table>
              )}
            </td>
          </tr>
        )}
      </>
    );
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-box" style={{ position: 'relative' }}><Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} /><input type="text" className="form-input" placeholder="Buscar fórmula..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40, width: 260 }} /></div>
          <select className="form-input" value={filterEstado} onChange={e => setFilterEstado(e.target.value as 'all' | 'activa' | 'inactiva')} style={{ width: 140 }}><option value="all">Todos estados</option><option value="activa">Activa</option><option value="inactiva">Inactiva</option></select>
          <select className="form-input" value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)} style={{ width: 200 }}>
            <option value="">Todas categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={handleNew}><Plus size={18} /> Nueva Fórmula</button>}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, border: '2px solid #43A047', overflow: 'visible' }}>
          <div className="card-header" style={{ background: 'rgba(46,125,50,0.04)' }}><span className="card-title" style={{ color: '#2E7D32' }}>{editingId ? '✏️ Editar Fórmula' : '➕ Nueva Fórmula'}</span><button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}>Cancelar</button></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div className="form-group"><label className="form-label">Nombre *</label><input type="text" className="form-input" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: CERDO LEVANTE PREMEX" /></div>
              <div className="form-group"><label className="form-label">Fecha Formulación</label><input type="date" className="form-input" value={form.fecha_formulacion} onChange={e => setForm(p => ({ ...p, fecha_formulacion: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Categoría</label>
                <select className="form-input" value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                  <option value="">— Seleccionar —</option>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Alimento</label><select className="form-input" value={form.alimento_sap} onChange={e => setForm(p => ({ ...p, alimento_sap: e.target.value }))}><option value="">— Seleccionar —</option>{alimentos.map((a) => <option key={a.codigo_sap} value={a.codigo_sap}>{a.descripcion}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Cliente</label><select className="form-input" value={form.cliente_sap} onChange={e => setForm(p => ({ ...p, cliente_sap: e.target.value }))}><option value="">— Seleccionar —</option>{clientes.map((c) => <option key={c.codigo_sap} value={c.codigo_sap}>{c.nombre}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Sacos / Bache</label><select className="form-input" value={form.sacos_por_bache} onChange={e => setForm(p => ({ ...p, sacos_por_bache: e.target.value }))}><option value="35">35 sacos</option><option value="50">50 sacos</option><option value="60">60 sacos</option></select></div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Observaciones</label><input type="text" className="form-input" value={form.observaciones} onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))} placeholder="Variante, modificación, etc." /></div>
            </div>
            <div style={{ background: 'rgba(46,125,50,0.03)', borderRadius: 10, padding: 16, border: '1px dashed var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2E7D32' }}>🧪 Ingredientes</span><span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>KG/Bache: <strong style={{ color: '#2E7D32' }}>{formDetalles.reduce((s, d) => s + (Number(d.cantidad_base) || 0), 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })}</strong></span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px auto', gap: '6px 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}><span>Material</span><span>KG / Bache</span><span>Referencia</span><span></span></div>
              {formDetalles.map((d, idx) => (<div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px auto', gap: '6px 8px', alignItems: 'center', marginBottom: 6 }}><div style={{ zIndex: 100 - idx }}><MaterialSearchSelect value={d.material_id} onChange={(id: string) => updateIngrediente(idx, 'material_id', id)} materiales={materiales} style={{ flex: 1.5 }} /></div><input type="number" className="form-input" placeholder="KG" value={d.cantidad_base} onChange={e => updateIngrediente(idx, 'cantidad_base', e.target.value)} step="0.01" min="0" /><select className="form-input" value={d.referencia} onChange={e => updateIngrediente(idx, 'referencia', e.target.value)}>{REFS.map(r => <option key={r} value={r}>{r}</option>)}</select><button className="btn btn-outline btn-sm btn-icon" onClick={() => removeIngrediente(idx)}><Trash2 size={14} /></button></div>))}
              <button className="btn btn-outline btn-sm" onClick={addIngrediente} style={{ marginTop: 8 }}><Plus size={14} /> Agregar ingrediente</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 8 }}><button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancelar</button><button className="btn btn-primary" onClick={handleSave}><Check size={16} /> {editingId ? 'Actualizar' : 'Crear'} Fórmula</button></div>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>⏳ Cargando fórmulas...</div> :
        Object.keys(grouped).length === 0 ? (<div className="card"><div className="card-body"><div className="empty-state"><FlaskConical size={48} /><p><strong>Sin fórmulas</strong></p><p>Crea tu primera fórmula</p></div></div></div>) :
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, datesGroup]) => {
          const color = catColors[cat] || '#607D8B';
          const isExpandedCat = expandedCats.has(cat);
          const catTotal = Object.values(datesGroup).reduce((acc, items) => acc + items.length, 0);
          return (
            <div key={cat} className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${color}` }}>
              <div className="card-header" onClick={() => toggleCat(cat)} style={{ cursor: 'pointer', background: `${color}08` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{!isExpandedCat ? <ChevronDown size={18} /> : <ChevronUp size={18} />}<span style={{ fontWeight: 800, color, fontSize: '1rem' }}>{cat}</span><span className="badge" style={{ background: `${color}18`, color, fontSize: '0.8rem' }}>{catTotal}</span></div>
              </div>
              {isExpandedCat && (
                <div className="card-body p-0">
                  {Object.entries(datesGroup).sort(([d1], [d2]) => d2.localeCompare(d1)).map(([rawDate, items]) => {
                    const displayDate = rawDate === '1970-01-01' ? 'Fecha no definida' : new Date(`${rawDate}T00:00:00`).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
                    const dateKey = `${cat}|${rawDate}`;
                    const isExpandedDate = expandedDates.has(dateKey);
                    
                    return (
                      <div key={rawDate} style={{ padding: '8px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        <h4 onClick={() => toggleDate(dateKey)} style={{ margin: '8px 0', color: '#555', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, textTransform: 'capitalize', cursor: 'pointer' }}>
                          {!isExpandedDate ? <ChevronDown size={16} style={{color: '#999'}}/> : <ChevronUp size={16} style={{color: '#999'}}/>}
                          📅 {displayDate} <span style={{ fontSize: '0.8rem', color: '#999', fontWeight: 'normal', textTransform: 'none' }}>({items.length} fórmulas)</span>
                        </h4>
                        {isExpandedDate && (
                          <div className="data-table-wrapper" style={{ boxShadow: 'none', border: '1px solid var(--border-color)', borderRadius: 6, marginTop: 12, marginBottom: 8 }}>
                            <table className="data-table w-full">
                              <thead><tr><th style={{ width: 30, background: '#fff' }}></th><th style={{ background: '#fff' }}>Nombre</th><th style={{ textAlign: 'center', background: '#fff' }}>Sacos/Bache</th><th style={{ background: '#fff' }}>Observaciones</th><th style={{ textAlign: 'center', background: '#fff' }}>Estado</th>{canEdit && <th style={{ width: 120, background: '#fff' }}>Acc.</th>}</tr></thead>
                              <tbody>{items.map(f => renderFormulaRow(f))}</tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      }
      <div className="pagination"><span>Total: {filtered.length} fórmulas</span></div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  TAB 2: ASOCIAR OP ↔ FÓRMULA                                 */
/* ══════════════════════════════════════════════════════════════ */
function AsociarTab({ canEdit }: { canEdit: boolean }) {
  const [ops, setOps] = useState<ProgramacionRow[]>([]);
  const [formulas, setFormulas] = useState<FormulaHeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'con' | 'sin'>('all');
  const [editingOp, setEditingOp] = useState<number | null>(null);
  const [searchFormulaModalTerm, setSearchFormulaModalTerm] = useState('');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const load = async () => { setLoading(true); try { const [o, f] = await Promise.all([fetchOPsConFormula(), fetchFormulas()]); setOps(o as ProgramacionRow[]); setFormulas(f); } catch (e: unknown) { toast.error((e as Error).message); } setLoading(false); };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = ops;
    if (filterStatus === 'con') list = list.filter(o => o.formula_id);
    if (filterStatus === 'sin') list = list.filter(o => !o.formula_id);
    if (search) { const s = search.toLowerCase(); list = list.filter(o => String(o.lote).includes(s) || (o.maestro_alimentos?.descripcion || '').toLowerCase().includes(s) || (o.maestro_clientes?.nombre || '').toLowerCase().includes(s)); }
    return list;
  }, [ops, search, filterStatus]);

  const handleAssign = async (opId: number, formulaId: number | null) => { try { await assignFormulaToOP(opId, formulaId); toast.success(formulaId ? 'Fórmula asignada' : 'Fórmula desasignada'); setEditingOp(null); load(); } catch (e: unknown) { toast.error((e as Error).message); } };
  
  const handleRevert = async (opId: number) => {
    try { await reversarLiquidacionExplosion(opId); toast.success('Liquidación reversada excitósamente.'); load(); } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const activeFormulas = formulas.filter(f => f.estado === 'activa');
  type GroupedActiveFormulas = Record<string, Record<string, FormulaHeader[]>>;
  const groupedActiveFormulas = useMemo<GroupedActiveFormulas>(() => {
    const groups: GroupedActiveFormulas = {};
    for (const f of activeFormulas) {
      const cat = f.categoria || 'Sin categoría';
      const rawDate = f.created_at ? f.created_at.split('T')[0] : '1970-01-01';
      if (!groups[cat]) groups[cat] = {};
      if (!groups[cat][rawDate]) groups[cat][rawDate] = [];
      groups[cat][rawDate].push(f);
    }
    return groups;
  }, [activeFormulas]);

  const toggleCat = (cat: string) => setExpandedCats(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
  const toggleDate = (key: string) => setExpandedDates(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const catColors: Record<string, string> = {};
  const palette = ['#2E7D32','#E91E63','#FF9800','#795548','#00BCD4','#9C27B0','#607D8B','#1565C0','#F44336','#009688','#FF5722','#3F51B5'];
  const categorias = [...new Set(formulas.map(f => f.categoria || 'Sin categoría'))].sort();
  categorias.forEach((c, i) => { catColors[c] = palette[i % palette.length]; });
  const kpis = useMemo(() => ({ total: ops.length, con: ops.filter(o => o.formula_id).length, sin: ops.filter(o => !o.formula_id).length }), [ops]);

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[{ key: 'all', label: 'Total OPs', value: kpis.total, color: '#455A64', icon: Package }, { key: 'con', label: 'Con Fórmula', value: kpis.con, color: '#2E7D32', icon: Check }, { key: 'sin', label: 'Sin Fórmula', value: kpis.sin, color: '#E65100', icon: AlertTriangle }].map(k => (
          <div key={k.key} onClick={() => setFilterStatus(k.key as 'con' | 'all' | 'sin')} style={{ flex: 1, padding: '14px 18px', borderRadius: 12, cursor: 'pointer', border: filterStatus === k.key ? `2px solid ${k.color}` : '1px solid var(--border-color)', background: filterStatus === k.key ? `${k.color}08` : 'var(--bg-card)', transition: 'all 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><k.icon size={20} style={{ color: k.color }} /><span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{k.label}</span></div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}><div className="search-box" style={{ position: 'relative', display: 'inline-block' }}><Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} /><input type="text" className="form-input" placeholder="Buscar OP, alimento, cliente..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40, width: 320 }} /></div></div>
      <div className="card"><div className="card-body p-0"><div className="data-table-wrapper">
        <table className="data-table w-full"><thead><tr><th>OP</th><th>Fecha</th><th>Alimento</th><th>Cliente</th><th>Observaciones</th><th style={{ textAlign: 'center' }}>Bultos</th><th style={{ textAlign: 'center' }}>Baches</th><th>Fórmula</th>{canEdit && <th style={{ width: 140 }}>Acción</th>}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>⏳</td></tr> :
              filtered.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><Link2 size={48} /><p>Sin OPs</p></div></td></tr> :
                filtered.slice(0, 200).map(o => (
                  <tr key={o.id}><td style={{ fontWeight: 700, color: '#1565C0' }}>{o.lote}</td><td>{o.fecha}</td><td>{o.maestro_alimentos?.descripcion || '—'}</td><td>{o.maestro_clientes?.nombre || '—'}</td><td style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={o.observaciones || undefined}>{o.observaciones || '—'}</td><td style={{ textAlign: 'center' }}>{o.bultos_programados ?? '—'}</td><td style={{ textAlign: 'center' }}>{o.num_baches ?? '—'}</td>
                    <td>{o.formulas ? <span style={{ fontWeight: 600, color: o.estado_formulacion === 'LIQUIDADA' ? '#9E9E9E' : '#2E7D32' }}>{o.estado_formulacion === 'LIQUIDADA' ? '🔒(Liq.)' : '✅'} {o.formulas.nombre}</span> : <span style={{ color: '#E65100', fontSize: '0.85rem' }}>⚠️ Sin fórmula</span>}</td>
                    {canEdit && <td>{(<div style={{ display: 'flex', gap: 6 }}><button className="btn btn-outline btn-sm" onClick={() => { setEditingOp(o.id); }} disabled={o.estado_formulacion === 'LIQUIDADA'} title={o.estado_formulacion === 'LIQUIDADA' ? 'Fórmula bloqueada por liquidación' : ''}><Link2 size={14} /> {o.formula_id ? 'Cambiar' : 'Asignar'}</button> {o.estado_formulacion === 'LIQUIDADA' && <button className="btn btn-outline btn-sm btn-icon" onClick={() => handleRevert(o.id)} title="Reversar Liquidación" style={{ borderColor: '#E65100', color: '#E65100' }}><RotateCcw size={14} /></button>}</div>)}</td>}
                  </tr>
                ))}
          </tbody></table>
      </div><div className="pagination"><span>Mostrando {Math.min(filtered.length, 200)} de {filtered.length}</span></div></div></div>

      {editingOp && (() => {
        const opDetails = ops.find(o => o.id === editingOp);
        return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 700, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-app)' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}><Link2 size={24}/> Asignar Fórmula a OP</h3>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => { setEditingOp(null); setSearchFormulaModalTerm(''); }}><X size={18}/></button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {opDetails && (
                <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, marginBottom: 20, border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>OP Lote:</span> <br/><strong style={{ color: '#1565C0', fontSize: '1.1rem' }}>{opDetails.lote}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Fecha:</span> <br/><strong>{opDetails.fecha}</strong></div>
                    <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Alimento:</span> <br/><strong>{opDetails.maestro_alimentos?.descripcion || '—'}</strong></div>
                    <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Cliente:</span> <br/><strong>{opDetails.maestro_clientes?.nombre || '—'}</strong></div>
                    {opDetails.observaciones && (
                      <div style={{ gridColumn: '1 / -1', background: '#fff3cd', padding: '8px 12px', borderRadius: 6, borderLeft: '4px solid #ffc107' }}>
                        <span style={{ color: '#856404', fontSize: '0.8rem', fontWeight: 600 }}>Observaciones OP:</span> <br/>
                        <span style={{ color: '#856404', fontSize: '0.9rem' }}>{opDetails.observaciones}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div style={{ marginBottom: 16 }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Buscar fórmula por nombre..." 
                  value={searchFormulaModalTerm}
                  onChange={e => setSearchFormulaModalTerm(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <button className="btn btn-outline" style={{ width: '100%', borderColor: '#E65100', color: '#E65100' }} onClick={() => handleAssign(editingOp, null)}>
                  — Desasignar Fórmula (Dejar OP sin fórmula) —
                </button>
              </div>
              
              {(() => {
                // Filter grouped active formulas based on search term
                const filteredGroups: typeof groupedActiveFormulas = {};
                const searchLower = searchFormulaModalTerm.toLowerCase();
                
                let hasResults = false;
                for (const [cat, datesGroup] of Object.entries(groupedActiveFormulas)) {
                  for (const [dateStr, formulasList] of Object.entries(datesGroup)) {
                    const filteredList = formulasList.filter(f => f.nombre.toLowerCase().includes(searchLower));
                    if (filteredList.length > 0) {
                      if (!filteredGroups[cat]) filteredGroups[cat] = {};
                      filteredGroups[cat][dateStr] = filteredList;
                      hasResults = true;
                    }
                  }
                }

                if (!hasResults) return <div style={{textAlign:'center', padding: 40}}>No hay fórmulas que coincidan con la búsqueda</div>;

                return Object.entries(filteredGroups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, datesGroup]) => {
                  const color = catColors[cat] || '#607D8B';
                  const isExpandedCat = expandedCats.has(cat) || searchFormulaModalTerm.length > 0;
                  const catTotal = Object.values(datesGroup).reduce((acc, items) => acc + items.length, 0);
                  return (
                    <div key={cat} className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <div className="card-header p-2" onClick={() => toggleCat(cat)} style={{ cursor: 'pointer', background: `${color}08`, padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{!isExpandedCat ? <ChevronDown size={18} /> : <ChevronUp size={18} />}<span style={{ fontWeight: 800, color, fontSize: '1rem' }}>{cat}</span><span className="badge" style={{ background: `${color}18`, color, fontSize: '0.8rem' }}>{catTotal}</span></div>
                      </div>
                      {isExpandedCat && (
                        <div className="card-body p-0">
                          {Object.entries(datesGroup).sort(([d1], [d2]) => d2.localeCompare(d1)).map(([rawDate, items]) => {
                            const displayDate = rawDate === '1970-01-01' ? 'Fecha no definida' : new Date(`${rawDate}T00:00:00`).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
                            const dateKey = `${cat}|${rawDate}`;
                            const isExpandedDate = expandedDates.has(dateKey) || searchFormulaModalTerm.length > 0;
                            
                            return (
                              <div key={rawDate} style={{ padding: '8px 16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)' }}>
                                <h4 onClick={() => toggleDate(dateKey)} style={{ margin: '8px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, textTransform: 'capitalize', cursor: 'pointer' }}>
                                  {!isExpandedDate ? <ChevronDown size={16} style={{color: 'var(--text-muted)'}}/> : <ChevronUp size={16} style={{color: 'var(--text-muted)'}}/>}
                                  📅 {displayDate} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal', textTransform: 'none' }}>({items.length} fórmulas)</span>
                                </h4>
                                {isExpandedDate && (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, marginTop: 12, marginBottom: 8 }}>
                                    {items.map(f => (
                                      <div key={f.id} onClick={() => { handleAssign(editingOp, f.id!); setSearchFormulaModalTerm(''); }} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8, cursor: 'pointer', background: 'var(--bg-app)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onMouseEnter={(e) => e.currentTarget.style.borderColor = color} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{f.nombre}</span>
                                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sacos/Bache: {f.sacos_por_bache}</span>
                                        </div>
                                        <Check size={18} style={{ color: 'var(--border-color)' }} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
        );
      })()}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  TAB 3: EXPLOSIÓN DE TRASLADO                                */
/* ══════════════════════════════════════════════════════════════ */
function ExplosionTab({ clientes }: { clientes: MaestroCliente[] }) {
  const [fechaDesde, setFechaDesde] = useState(new Date().toISOString().split('T')[0]);
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split('T')[0]);
  const [clienteSap, setClienteSap] = useState('');
  const [ops, setOps] = useState<ProgramacionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detallesFormula, setDetallesFormula] = useState<Record<number, FormulaDetalle[]>>({});
  const [overrides, setOverrides] = useState<Record<number, { sacos: string; baches: string }>>({});
  const [mode, setMode] = useState<'total' | 'parcial'>('total');
  const [selectedOps, setSelectedOps] = useState<Set<number>>(new Set());
  const [stockVal, setStockVal] = useState<Record<number, number>>({});
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [pdfOptions, setPdfOptions] = useState<Set<string>>(new Set());

  const handleBuscar = async () => {
    if (!fechaDesde || !fechaHasta) return toast.error('Selecciona rango de fechas');
    setLoading(true);
    try {
      const data = await fetchOPsParaExplosion(fechaDesde, fechaHasta, clienteSap ? Number(clienteSap) : undefined);
      setOps(data);
      const detalles: Record<number, FormulaDetalle[]> = {};
      const fids = [...new Set(data.filter(o => o.formula_id).map(o => o.formula_id))];
      for (const fid of fids) { try { const { detalle } = await fetchFormulaConDetalle(fid); detalles[fid] = detalle; } catch {} }
      setDetallesFormula(detalles);
      const ov: Record<number, { sacos: string; baches: string }> = {};
      for (const o of data) { ov[o.id] = { sacos: String(o.bultos_programados || 0), baches: String(o.num_baches || 0) }; }
      setOverrides(ov);
      // Fetch current stock
      const dDate = new Date();
      const stock = await calcularInventarioConsolidado(dDate.getMonth() + 1, dDate.getFullYear());
      const stMap: Record<number, number> = {};
      for (const s of stock || []) stMap[s.material_id] = s.stock_final || 0;
      setStockVal(stMap);
      // Select all by default (only pending)
      setSelectedOps(new Set(data.filter(o => o.estado_formulacion !== 'LIQUIDADA').map(o => o.id)));
    } catch (e: unknown) { toast.error((e as Error).message); }
    setLoading(false);
  };

  const toggleOp = (id: number) => setSelectedOps(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelectedOps(new Set(ops.map(o => o.id)));
  const selectNone = () => setSelectedOps(new Set());

  const handleChangeSacos = (opId: number, sacos: string, formula?: { sacos_por_bache?: number } | null) => {
    if (!formula) return;
    const spb = formula.sacos_por_bache || 50;
    const baches = spb > 0 ? (Number(sacos) || 0) / spb : 0;
    setOverrides(prev => ({ ...prev, [opId]: { sacos, baches: baches.toFixed(2) } }));
  };

  const handleChangeBaches = (opId: number, baches: string, formula?: { sacos_por_bache?: number } | null) => {
    if (!formula) return;
    const spb = formula.sacos_por_bache || 50;
    const sacos = (Number(baches) || 0) * spb;
    setOverrides(prev => ({ ...prev, [opId]: { sacos: sacos.toFixed(0), baches } }));
  };

  // Only use selected OPs for explosion
  const activeOps = useMemo(() => ops.filter(o => selectedOps.has(o.id)), [ops, selectedOps]);
  const opsWithFormula = useMemo(() => activeOps.filter(o => o.formula_id), [activeOps]);

  const uniqueRefs = useMemo(() => {
    const refs = new Set<string>();
    for (const op of opsWithFormula) {
      const detalle = detallesFormula[op.formula_id!];
      if (!detalle) continue;
      for (const d of detalle) {
        let rawRef = (d.referencia || '').trim().toUpperCase();
        if (!rawRef) rawRef = 'SIN CLASIFICAR';
        refs.add(rawRef);
      }
    }
    return Array.from(refs).sort();
  }, [opsWithFormula, detallesFormula]);

  useEffect(() => {
     setPdfOptions(new Set(uniqueRefs));
  }, [uniqueRefs]);

  const explosion = useMemo(() => {
    const consolidado: Record<number, { matId: number; codigo: number; nombre: string; totalKg: number; referencia: string; porOP: Record<number, number> }> = {};
    for (const op of activeOps) {
      if (!op.formula_id) continue;
      const detalle = detallesFormula[op.formula_id];
      if (!detalle) continue;
      const ov = overrides[op.id];
      const baches = mode === 'parcial' && ov ? Number(ov.baches) : (op.num_baches || 0);
      for (const d of detalle) {
        const kg = d.cantidad_base * baches;
        const matId = d.material_id;
        if (!consolidado[matId]) { consolidado[matId] = { matId, codigo: d.inventario_materiales?.codigo || matId, nombre: d.inventario_materiales?.nombre || '—', totalKg: 0, referencia: d.referencia || 'SIN CLASIFICAR', porOP: {} }; }
        consolidado[matId].totalKg += kg;
        consolidado[matId].porOP[op.lote] = (consolidado[matId].porOP[op.lote] || 0) + kg;
      }
    }
    return Object.values(consolidado).sort((a, b) => b.totalKg - a.totalKg);
  }, [activeOps, detallesFormula, overrides, mode]);

  const totalKg = explosion.reduce((s, e) => s + e.totalKg, 0);

  const handleLiquidar = async () => {
    const opsToLiquidar = activeOps.filter(o => o.estado_formulacion !== 'LIQUIDADA' && o.formula_id);
    if (!opsToLiquidar.length) return toast.error('No hay nuevas OPs pendientes seleccionadas.');
    const consumos = explosion.map(e => ({ material_id: e.matId, cantidad: e.totalKg }));
    const opsData = opsToLiquidar.map(o => ({
       id: o.id,
       snapshot: {
         lote: o.lote,
         formula: o.formulas,
         detalles: detallesFormula[o.formula_id!],
         baches_usados: overrides[o.id] ? Number(overrides[o.id].baches) : (o.num_baches || 0),
         sacos_usados: overrides[o.id] ? Number(overrides[o.id].sacos) : (o.bultos_programados || 0)
       }
    }));

    const negativos = explosion.filter(e => (stockVal[e.matId] || 0) < e.totalKg);
    if (negativos.length > 0) {
       toast.error(`¡Aviso crítico! Hay ${negativos.length} materiales que quedaron negativos o sin stock tras esta liquidación. Por favor, regulariza el inventario añadiendo sus entradas.`);
    }

    setLoading(true);
    try {
      await liquidarExplosionInventario(opsData, consumos);
      toast.success(`Inventario descontado exitosamente para ${opsToLiquidar.length} OPs.`);
      await handleBuscar();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
    setLoading(false);
  };

  // Excel export: DESCRIPCION ALIMENTO | BACHEZ | Código | Materia Prima | TOTAL KG | OP
  const exportExcel = () => {
    if (explosion.length === 0) return toast.error('No hay datos');
    const rows: Record<string, unknown>[] = [];
    for (const op of opsWithFormula) {
      const detalle = detallesFormula[op.formula_id!];
      if (!detalle) continue;
      const ov = overrides[op.id];
      const baches = mode === 'parcial' && ov ? Number(ov.baches) : (op.num_baches || 0);
      const alimentoDesc = op.maestro_alimentos?.descripcion || '';
      for (const d of detalle) {
        const kg = d.cantidad_base * baches;
        rows.push({
          'DESCRIPCION ALIMENTO': alimentoDesc,
          'BACHEZ': baches,
          'Código': d.inventario_materiales?.codigo || d.material_id,
          'Materia Prima': d.inventario_materiales?.nombre || '',
          'TOTAL KG': Number(kg.toFixed(2)),
          'OP': op.lote,
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);

    // Apply styles to the worksheet
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:F1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellRef]) continue;

        interface ExcelStyle {
          font?: { name?: string; sz?: number; bold?: boolean; color?: { rgb: string } };
          alignment?: { vertical?: string; horizontal?: string; wrapText?: boolean };
          border?: Record<string, { style: string; color: { rgb: string } }>;
          fill?: { fgColor: { rgb: string }; patternType: string };
          numF?: string;
        }

        const cellStyle: ExcelStyle = {
          font: { name: 'Arial', sz: 10 },
          alignment: { vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: 'CCCCCC' } },
            bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
            left: { style: 'thin', color: { rgb: 'CCCCCC' } },
            right: { style: 'thin', color: { rgb: 'CCCCCC' } }
          }
        };

        // Header Row Styling (R === 0)
        if (R === 0) {
          cellStyle.font!.bold = true;
          cellStyle.font!.color = { rgb: 'FFFFFF' };
          cellStyle.fill = { fgColor: { rgb: '1B5E20' }, patternType: 'solid' }; // Agrifeed Green
          cellStyle.alignment!.horizontal = 'center';
        } else {
          // Data Rows Styling
          // Alternating row background
          if (R % 2 === 0) {
            cellStyle.fill = { fgColor: { rgb: 'F5FAF5' }, patternType: 'solid' }; // Very light green
          }

          // Specific Column Styling
          if (C === 1) { // BACHEZ
            cellStyle.alignment!.horizontal = 'center';
            cellStyle.font!.bold = true;
          }
          if (C === 2) { // Código
            cellStyle.alignment!.horizontal = 'center';
          }
          if (C === 4) { // TOTAL KG
            cellStyle.numF = '#,##0.00'; // Number format
            cellStyle.font!.bold = true;
            cellStyle.font!.color = { rgb: '1B5E20' };
          }
          if (C === 5) { // OP
            cellStyle.alignment!.horizontal = 'center';
            cellStyle.font!.bold = true;
            cellStyle.font!.color = { rgb: '1565C0' }; // Blue tint array for OPs
          }
        }
        
        ws[cellRef].s = cellStyle;
      }
    }

    // Set column widths
    ws['!cols'] = [
      { wch: 35 }, // DESCRIPCION ALIMENTO
      { wch: 10 }, // BACHEZ
      { wch: 12 }, // Código
      { wch: 45 }, // Materia Prima
      { wch: 15 }, // TOTAL KG
      { wch: 12 }  // OP
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Explosión');
    const clienteObj = clientes.find((c) => String(c.codigo_sap) === clienteSap);
    
    try {
      XLSX.writeFile(wb, `Explosion_${clienteObj?.nombre || 'Todos'}_${fechaDesde}.xlsx`);
      toast.success('Excel exportado');
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') toast.error('Error al exportar matriz: ' + (e as Error).message);
    }
  };

  // ── PDF Export ──
  const exportPDF = async () => {
    if (explosion.length === 0) return toast.error('No hay datos');
    const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;

    // Load logo
    let logoImg: string | null = null;
    try {
      const resp = await fetch('/logo-agrifeed.png');
      const blob = await resp.blob();
      logoImg = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
    } catch { /* no logo */ }

    // Helper function to draw header on new pages
    const drawHeader = (title: string, omitLogoSpace = false) => {
      doc.setFillColor(27, 94, 32);  // #1B5E20
      doc.rect(0, 0, pageW, 28, 'F');
      
      const infoBoxW = 42;
      const infoX = pageW - margin - infoBoxW;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(infoX, 4, infoBoxW, 20, 2, 2, 'F');
      doc.setTextColor(27, 94, 32);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const now = new Date();
      doc.text('Fecha:', infoX + 3, 9);
      doc.text('Hora:', infoX + 3, 14);
      doc.text('Página:', infoX + 3, 19);
      doc.setFont('helvetica', 'normal');
      doc.text(`${now.toLocaleDateString('es-CO')}`, infoX + 16, 9);
      doc.text(`${now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`, infoX + 16, 14);
      doc.text(`${doc.getNumberOfPages()}`, infoX + 16, 19);

      if (logoImg && !omitLogoSpace) {
        doc.addImage(logoImg, 'PNG', margin, 3, 48, 22);
      }

      const textStartX = (logoImg && !omitLogoSpace) ? margin + 52 : margin;
      const maxTitleW = infoX - textStartX - 4;
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(title, textStartX, 12, { maxWidth: maxTitleW });
      
      const clienteObj = clientes.find((c) => String(c.codigo_sap) === clienteSap);
      const clienteLabel = clienteObj?.nombre || 'TODOS LOS CLIENTES';
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Cliente: ${clienteLabel}  |  Rango: ${fechaDesde} → ${fechaHasta}`, textStartX, 22);
      doc.setTextColor(0, 0, 0);
    };

    const drawFooter = () => {
      const now = new Date();
      doc.setFillColor(27, 94, 32);
      doc.rect(0, pageH - 8, pageW, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6.5);
      doc.text('AGRIFEED S.A.S  —  NIT 900.959.683-1  —  Zona Franca Palermo Km 1, Vía Barranquilla - Ciénaga', margin, pageH - 3);
      doc.text(`Generado: ${now.toLocaleString('es-CO')}`, pageW - margin - 45, pageH - 3);
    };

    // ── PAGE 1 & 2: CONSOLIDATED TABLES ──
    const explosionIngredientes = explosion.filter(e => e.referencia !== 'EMPAQUES');
    const explosionEmpaques = explosion.filter(e => e.referencia === 'EMPAQUES');

    const renderConsolidated = (title: string, data: typeof explosion, startY: number) => {
      drawHeader(title);

      const headRow2 = ['Código', 'Materia Prima'];
      const numColsTotal = opsWithFormula.length + 3;
      for (const o of opsWithFormula) {
        const ov = overrides[o.id];
        const baches = mode === 'parcial' && ov ? Number(ov.baches) : (o.num_baches || 0);
        let alimDesc = (o.maestro_alimentos?.descripcion || '').replace('ALIMENTO ', '').trim();
        
        // Aggressively truncate names when there are too many columns
        if (numColsTotal > 25) {
           alimDesc = alimDesc.substring(0, 6) + '.';
        } else if (numColsTotal > 15) {
           alimDesc = alimDesc.substring(0, 12) + '.';
        }

        headRow2.push(`OP ${o.lote}\n${alimDesc}\n${baches} bch`);
      }
      headRow2.push('Total KG');

      const body: (string | number)[][] = [];
      for (const e of data) {
        const row: (string | number)[] = [e.codigo, e.nombre];
        for (const o of opsWithFormula) {
          row.push((e.porOP[o.lote] || 0) > 0 ? Number((e.porOP[o.lote]).toFixed(2)).toLocaleString('es-CO') : '');
        }
        row.push(Number(e.totalKg.toFixed(2)).toLocaleString('es-CO'));
        body.push(row);
      }

      const tTotal = data.reduce((s, e) => s + e.totalKg, 0);
      const totalsRow: (string | number)[] = ['', 'TOTAL GENERAL'];
      for (const o of opsWithFormula) {
        const opT = data.reduce((s, e) => s + (e.porOP[o.lote] || 0), 0);
        totalsRow.push(Number(opT.toFixed(0)).toLocaleString('es-CO'));
      }
      totalsRow.push(Number(tTotal.toFixed(0)).toLocaleString('es-CO'));

      const numCols = headRow2.length;
      
      // Calculate exact column widths to prevent horizontal spill
      const maxTableWidth = pageW - (margin * 2); 
      const matWidth = numCols > 30 ? 25 : numCols > 20 ? 30 : numCols > 10 ? 45 : 55;
      const fixedColsWidth = 14 + 15; // Código (14) + Total KG (15)
      const remainingWidth = maxTableWidth - fixedColsWidth - matWidth;
      const opCols = Math.max(1, numCols - 3); // -3 for (Codigo, Materia Prima, Total KG)
      const opColWidth = remainingWidth / opCols;

      const fontSize = opColWidth < 6 ? 3.0 : opColWidth < 8 ? 4.0 : opColWidth < 12 ? 5.0 : 6.0;
      const cellPad = opColWidth < 8 ? 0.4 : 1.0;

      // Define explicitly all column styles
      const colStyles: Record<number, any> = {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: matWidth },
      };
      
      for (let i = 2; i < numCols - 1; i++) {
        colStyles[i] = { cellWidth: opColWidth, halign: 'center' };
      }
      colStyles[numCols - 1] = { cellWidth: 15, halign: 'center', fontStyle: 'bold' };

      autoTable(doc, {
        startY: startY,
        horizontalPageBreak: false, // Prevent it from creating horizontal overflow pages
        tableWidth: maxTableWidth, // Strictly enforce the total table width
        showFoot: 'lastPage', // Only show the totals row at the very end of the table
        head: [headRow2],
        body: body,
        foot: [totalsRow],
        theme: 'grid',
        styles: { fontSize: fontSize, cellPadding: cellPad, lineColor: [200, 200, 200], lineWidth: 0.2, overflow: 'hidden' },
        headStyles: { fillColor: [27, 94, 32], textColor: 255, fontStyle: 'bold', fontSize: fontSize, halign: 'center', minCellHeight: 8 },
        footStyles: { fillColor: [232, 245, 233], textColor: [27, 94, 32], fontStyle: 'bold', fontSize: fontSize + 0.5 },
        columnStyles: colStyles,
        alternateRowStyles: { fillColor: [250, 253, 250] },
        margin: { left: margin, right: margin },
        didDrawPage: drawFooter,
      });
    };

    renderConsolidated('TRASLADO MPR - MATERIAS PRIMAS (INGREDIENTES)', explosionIngredientes, 32);

    if (explosionEmpaques.length > 0) {
      doc.addPage();
      renderConsolidated('TRASLADO MPR - EMPAQUES', explosionEmpaques, 32);
    }


    // ── SUBSEQUENT PAGES: OP by OP, GROUPED BY CLASSIFICATION ──
    for (const op of opsWithFormula) {
      const detalle = detallesFormula[op.formula_id!];
      if (!detalle) continue;
      
      const ov = overrides[op.id];
      const baches = mode === 'parcial' && ov ? Number(ov.baches) : (op.num_baches || 0);
      const alimentoDesc = op.maestro_alimentos?.descripcion || '';
      const bultos = op.bultos_programados || 0;

      // Group materials by 'referencia' (MACRO, MICRO, etc.)
      const groupedData: Record<string, (string | number)[][]> = {};
      let hasValidItems = false;
      
      for (const d of detalle) {
        const kg = d.cantidad_base * baches;
        if (kg <= 0) continue;
        
        let rawRef = (d.referencia || '').trim().toUpperCase();
        if (!rawRef) rawRef = 'SIN CLASIFICAR';
        
        if (!pdfOptions.has(rawRef)) continue;

        if (!groupedData[rawRef]) groupedData[rawRef] = [];
        groupedData[rawRef].push([
          d.inventario_materiales?.codigo || d.material_id,
          d.inventario_materiales?.nombre || '',
          Number(d.cantidad_base.toFixed(3)).toLocaleString('es-CO'),
          Number(kg.toFixed(2)).toLocaleString('es-CO'),
        ]);
        hasValidItems = true;
      }

      if (!hasValidItems) continue;

      const groups = Object.keys(groupedData).sort();
      for (const gName of groups) {
        const groupRows = groupedData[gName];
        if (groupRows.length === 0) continue;

        doc.addPage();
        drawHeader(`HOJA DE EXPLOSIÓN: ${gName}`);

        // OP Details Banner
        const yOps = 32;
        doc.setFillColor(232, 245, 233);
        doc.rect(margin, yOps, pageW - margin * 2, 12, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(27, 94, 32);
        doc.text(`ORDEN DE PRODUCCIÓN (OP): ${op.lote}`, margin + 3, yOps + 5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(8);
        doc.text(`Alimento: ${alimentoDesc}`, margin + 3, yOps + 10);
        doc.text(`Programación: ${baches} BACHES  |  Equivalente: ${bultos} BULTOS`, margin + 140, yOps + 10);

        autoTable(doc, {
          startY: yOps + 15,
          head: [['Código', 'Materia Prima / Ingrediente', 'FÓRMULA (KG X BACHE)', `REQUERIMIENTO TOTAL (X ${baches} BACHES)`]],
          body: groupRows,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2.5, lineColor: [200, 200, 200], lineWidth: 0.2 },
          headStyles: { fillColor: [27, 94, 32], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
          columnStyles: {
            0: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 100 },
            2: { cellWidth: 40, halign: 'right', textColor: [100, 100, 100] },
            3: { cellWidth: 40, halign: 'right', fontStyle: 'bold', textColor: [27, 94, 32] },
          },
          alternateRowStyles: { fillColor: [245, 250, 245] },
          margin: { left: margin, right: margin },
          didDrawPage: drawFooter,
        });
      }
    }

    // Save
    const clienteObj = clientes.find((c) => String(c.codigo_sap) === clienteSap);
    const fileName = `Traslado_MP_${clienteObj?.nombre || 'Todos'}_${fechaDesde}.pdf`;
    try {
      doc.save(fileName);
      toast.success('PDF generado');
    } catch (err: unknown) { 
      toast.error('Error al generar PDF: ' + (err as Error).message); 
    }
  };

  return (
    <>
      {/* Search panel */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Fecha Desde</label>
              <input type="date" className="form-input" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Fecha Hasta</label>
              <input type="date" className="form-input" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 220 }}><label className="form-label">Cliente (opcional)</label>
              <select className="form-input" value={clienteSap} onChange={e => setClienteSap(e.target.value)}>
                <option value="">— Todos los clientes —</option>
                {clientes.map((c) => <option key={c.codigo_sap} value={c.codigo_sap}>{c.nombre}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleBuscar} disabled={loading}>
              {loading ? '⏳' : <><Search size={16} /> Buscar OPs</>}
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className={`btn btn-sm ${mode === 'total' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('total')}>Total</button>
              <button className={`btn btn-sm ${mode === 'parcial' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('parcial')}>Parcial</button>
            </div>
          </div>
        </div>
      </div>

      {ops.length > 0 && (
        <>
          {/* OPs table with checkboxes */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <span className="card-title">📋 OPs encontradas ({ops.length}) — Seleccionadas: {selectedOps.size}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-outline btn-sm" onClick={selectAll}><CheckSquare size={14} /> Todas</button>
                <button className="btn btn-outline btn-sm" onClick={selectNone}><Square size={14} /> Ninguna</button>
              </div>
            </div>
            <div className="card-body p-0"><div className="data-table-wrapper" style={{ maxHeight: 320 }}>
              <table className="data-table w-full">
                <thead><tr><th style={{ width: 40 }}>Sel.</th><th>OP</th><th>Fecha</th><th>Alimento</th><th>Cliente</th><th>Fórmula</th><th style={{ textAlign: 'center' }}>Sacos</th><th style={{ textAlign: 'center' }}>Baches</th></tr></thead>
                <tbody>
                  {ops.map(o => {
                    const checked = selectedOps.has(o.id);
                    const ov = overrides[o.id] || { sacos: '0', baches: '0' };
                    const formula = o.formulas;
                    return (
                      <tr key={o.id} style={{ opacity: checked ? 1 : 0.5 }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleOp(o.id)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                            {o.estado_formulacion === 'LIQUIDADA' && <span title="Ya liquidada en inventario" style={{ fontSize: '1rem', cursor: 'help' }}>🔒</span>}
                          </div>
                        </td>
                        <td style={{ fontWeight: 700, color: '#1565C0' }}>{o.lote}</td>
                        <td style={{ fontSize: '0.85rem' }}>{o.fecha}</td>
                        <td style={{ fontSize: '0.85rem' }}>{o.maestro_alimentos?.descripcion || '—'}</td>
                        <td style={{ fontSize: '0.85rem' }}>{o.maestro_clientes?.nombre || '—'}</td>
                        <td>{formula ? <span style={{ color: '#2E7D32', fontWeight: 600, fontSize: '0.85rem' }}>{formula.nombre}</span> : <span style={{ color: '#E65100', fontSize: '0.8rem' }}>⚠️ Sin fórmula</span>}</td>
                        <td style={{ textAlign: 'center' }}>
                          {mode === 'parcial' ? (<input type="number" className="form-input" value={ov.sacos} onChange={e => handleChangeSacos(o.id, e.target.value, formula)} style={{ width: 80, textAlign: 'center', fontWeight: 700, border: '2px solid #43A047' }} min="0" />) : <strong>{o.bultos_programados || 0}</strong>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {mode === 'parcial' ? (<input type="number" className="form-input" value={ov.baches} onChange={e => handleChangeBaches(o.id, e.target.value, formula)} style={{ width: 80, textAlign: 'center', fontWeight: 700, border: '2px solid #1565C0' }} min="0" step="0.01" />) : <strong>{o.num_baches || 0}</strong>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div></div>
          </div>

          {/* Explosion result */}
          <div className="card">
            <div className="card-header" style={{ background: 'rgba(46,125,50,0.04)' }}>
              <span className="card-title" style={{ color: '#2E7D32' }}>🧪 Explosión — {mode === 'total' ? 'TOTAL' : 'PARCIAL'}</span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Total: {totalKg.toLocaleString('es-CO', { maximumFractionDigits: 0 })} kg</span>
                <button className="btn btn-outline" onClick={() => setShowPdfOptions(true)} title="Descargar como PDF"><Zap size={16} /> Exportar Reporte Traslado PDF</button>
                <button className="btn btn-outline" onClick={exportExcel} style={{ color: '#2E7D32', borderColor: '#2E7D32' }} title="Descargar como Excel"><Download size={16} /> Exportar Excel</button>
                <button className="btn btn-primary" onClick={handleLiquidar} title="Descuenta físicamente del inventario y sella las OP" style={{ background: '#C62828', borderColor: '#C62828' }} disabled={loading}>Liquidación: Descontar Inventario</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Código</th><th>Materia Prima</th><th style={{ textAlign: 'right' }}>Stock Disp.</th><th style={{ textAlign: 'right' }}>Cantidad</th></tr></thead>
                <tbody>
                  {explosion.map((e, idx) => {
                    const st = stockVal[e.matId] || 0;
                    const deficit = st < e.totalKg;
                    return (
                      <tr key={idx} style={{ background: deficit ? '#FFEBEE' : 'transparent' }}>
                        <td>{e.codigo}</td>
                        <td style={{ fontWeight: 500, color: deficit ? '#C62828' : 'inherit' }}>{e.nombre}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: deficit ? '#C62828' : '#66BB6A' }}>{st.toLocaleString()} Kg</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#1B5E20' }}>{e.totalKg.toLocaleString()} Kg</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="card-body p-0"><div className="data-table-wrapper overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Código</th><th>Materia Prima</th>
                    {opsWithFormula.map(o => <th key={o.id} style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                      <div style={{ fontSize: '0.7rem', color: '#2E7D32' }}>{o.maestro_alimentos?.descripcion || ''}</div>
                      <div>OP {o.lote}</div>
                    </th>)}
                    <th style={{ textAlign: 'right', fontWeight: 800 }}>TOTAL KG</th>
                  </tr>
                </thead>
                <tbody>
                  {explosion.length === 0 ? <tr><td colSpan={opsWithFormula.length + 3}><div className="empty-state"><Zap size={48} /><p>Sin datos de explosión</p><p>Selecciona OPs con fórmulas asignadas</p></div></td></tr> :
                    explosion.map((e, i) => (
                      <tr key={i}><td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{e.codigo}</td><td>{e.nombre}</td>
                        {opsWithFormula.map(o => (<td key={o.id} style={{ textAlign: 'right', fontSize: '0.85rem' }}>{(e.porOP[o.lote] || 0) > 0 ? (e.porOP[o.lote]).toLocaleString('es-CO', { maximumFractionDigits: 2 }) : '—'}</td>))}
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#2E7D32' }}>{e.totalKg.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  {explosion.length > 0 && (
                    <tr style={{ fontWeight: 800, borderTop: '2px solid var(--border-color)', background: 'rgba(46,125,50,0.04)' }}>
                      <td colSpan={2} style={{ textAlign: 'right' }}>TOTAL:</td>
                      {opsWithFormula.map(o => { const opT = explosion.reduce((s, e) => s + (e.porOP[o.lote] || 0), 0); return <td key={o.id} style={{ textAlign: 'right' }}>{opT.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>; })}
                      <td style={{ textAlign: 'right', fontSize: '1.1rem', color: '#2E7D32' }}>{totalKg.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div></div>
          </div>
        </>
      )}

      {showPdfOptions && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 450, background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-app)' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={20}/> Opciones de Exportación PDF</h3>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => setShowPdfOptions(false)}><X size={16}/></button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                El PDF incluirá siempre el <strong>Reporte de Explosión TOTAL</strong>. 
                <br/><br/>
                Selecciona qué hojas individuales por OP deseas agregar al documento:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, background: 'var(--bg-app)', padding: 16, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                {uniqueRefs.map(ref => (
                  <label key={ref} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>
                    <input type="checkbox" checked={pdfOptions.has(ref)} onChange={(e) => {
                      const next = new Set(pdfOptions);
                      if (e.target.checked) next.add(ref); else next.delete(ref);
                      setPdfOptions(next);
                    }} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2E7D32' }} />
                    Hojas por OP de {ref}
                  </label>
                ))}
                {uniqueRefs.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No hay referencias disponibles para las OPs seleccionadas.</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button className="btn btn-outline" onClick={() => setShowPdfOptions(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={() => { setShowPdfOptions(false); exportPDF(); }}><FileText size={16} /> Generar PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
