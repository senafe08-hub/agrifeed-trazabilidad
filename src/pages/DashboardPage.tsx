import { useState, useEffect } from 'react';
import {
  Calendar, Factory, Truck, Receipt, AlertTriangle, TrendingUp, Package, Users, RefreshCw, Award,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  AreaChart, Area,
} from 'recharts';
import supabase from '../lib/supabase';

const META_BULTOS = 5500;
const META_BACHES = 108;

const COLORS_CATEGORY = [
  '#2E7D32', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#22c55e',
  '#a855f7', '#14b8a6', '#f87171', '#facc15',
];

const PERIOD_PRESETS = [
  { label: 'Hoy', getValue: () => { const t = new Date().toISOString().split('T')[0]; return [t, t]; } },
  { label: 'Esta semana', getValue: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return [d.toISOString().split('T')[0], new Date().toISOString().split('T')[0]]; } },
  { label: 'Este mes', getValue: () => { const d = new Date(); return [`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`, d.toISOString().split('T')[0]]; } },
  { label: 'Mes pasado', getValue: () => { const d = new Date(); d.setMonth(d.getMonth()-1); const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'); return [`${y}-${m}-01`, `${y}-${m}-${new Date(y, d.getMonth()+1, 0).getDate()}`]; } },
  { label: 'Últimos 3 meses', getValue: () => { const d = new Date(); d.setMonth(d.getMonth()-3); return [d.toISOString().split('T')[0], new Date().toISOString().split('T')[0]]; } },
  { label: 'Todo', getValue: () => ['2020-01-01', new Date().toISOString().split('T')[0]] },
];


import { Navigate } from 'react-router-dom';
import { usePermissions } from '../lib/permissions';

export default function DashboardPage() {
  const { canView } = usePermissions('dashboard');
  
  // if (!canView) then we must return early. However Hooks need to call on all renders. Wait, `useState` comes first? No, we shouldn't put conditional return before hooks.
  // Wait, I should put the conditional return AFTER `usePermissions`. But actually React allows early return, BUT NOT before remaining hooks!
  // It's best to put early return AFTER ALL hooks. 

  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<any>({
    programados: 0, producidos: 0, despachados: 0, facturados: 0,
    lotesPendientes: 0, lotesCompletos: 0, totalOps: 0,
    clientesActivos: 0,
  });
  const [barData, setBarData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [areaData, setAreaData] = useState<any[]>([]);
  const [clienteData, setClienteData] = useState<any[]>([]);
  const [supervisorData, setSupervisorData] = useState<any[]>([]);
  const [dosificadorData, setDosificadorData] = useState<any[]>([]);
  const [recentOps, setRecentOps] = useState<any[]>([]);
  const [activePreset, setActivePreset] = useState('Últimos 3 meses');

  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchDashboardData();
  }, [fechaDesde, fechaHasta]);

  const applyPreset = (preset: typeof PERIOD_PRESETS[0]) => {
    const [desde, hasta] = preset.getValue();
    setFechaDesde(desde);
    setFechaHasta(hasta);
    setActivePreset(preset.label);
  };

  const fetchDashboardData = async () => {
    setLoading(true);

    let query = supabase
      .from('programacion')
      .select(`
        lote, fecha, bultos_programados,
        maestro_alimentos(descripcion, categoria),
        maestro_clientes(nombre),
        produccion(fecha_produccion, bultos_entregados),
        despachos(bultos_despachados, bultos_danados)
      `);

    if (fechaDesde) query = query.gte('fecha', fechaDesde);
    if (fechaHasta) query = query.lte('fecha', fechaHasta);

    // Fetch reportes_turno for supervisor/dosificador stats
    let reportQuery = supabase.from('reportes_turno').select('supervisor, dosificador, total_bultos, baches_dosificados, fecha, turno');
    if (fechaDesde) reportQuery = reportQuery.gte('fecha', fechaDesde);
    if (fechaHasta) reportQuery = reportQuery.lte('fecha', fechaHasta);

    const [{ data: rawData, error }, { data: detData }, { data: reportesData }] = await Promise.all([
      query.order('lote', { ascending: false }).limit(10000),
      supabase.from('pedido_detalle').select('op, bultos_pedido, pedidos(estado)'),
      reportQuery.order('fecha', { ascending: false }),
    ]);

    const facturadoMap = new Map<number, number>();
    if (detData) {
      for (const d of detData) {
        if ((d.pedidos as any)?.estado === 'FACTURADO') {
          facturadoMap.set(d.op, (facturadoMap.get(d.op) || 0) + (d.bultos_pedido || 0));
        }
      }
    }

    // Supervisor & Dosificador aggregation
    if (reportesData) {
      const supStats: Record<string, { totalPct: number; count: number }> = {};
      const dosStats: Record<string, { totalPct: number; count: number }> = {};

      for (const r of reportesData) {
        if (r.supervisor) {
          const bultos = r.total_bultos || 0;
          const pct = (bultos / META_BULTOS) * 100;
          if (!supStats[r.supervisor]) supStats[r.supervisor] = { totalPct: 0, count: 0 };
          supStats[r.supervisor].totalPct += pct;
          supStats[r.supervisor].count += 1;
        }
        if (r.dosificador) {
          const baches = r.baches_dosificados || 0;
          const pct = (baches / META_BACHES) * 100;
          if (!dosStats[r.dosificador]) dosStats[r.dosificador] = { totalPct: 0, count: 0 };
          dosStats[r.dosificador].totalPct += pct;
          dosStats[r.dosificador].count += 1;
        }
      }

      const supArr = Object.entries(supStats)
        .map(([nombre, s]) => ({ nombre, promedio: s.count > 0 ? Math.round(s.totalPct / s.count) : 0, turnos: s.count }))
        .sort((a, b) => b.promedio - a.promedio);
      setSupervisorData(supArr);

      const dosArr = Object.entries(dosStats)
        .map(([nombre, s]) => ({ nombre, promedio: s.count > 0 ? Math.round(s.totalPct / s.count) : 0, turnos: s.count }))
        .sort((a, b) => b.promedio - a.promedio);
      setDosificadorData(dosArr);
    }

    if (!error && rawData) {
      let pg = 0, pr = 0, dp = 0, fc = 0;
      let pendientes = 0, completos = 0;
      const categories: Record<string, number> = {};
      const weeklyMap: Record<string, { prog: number; ent: number; desp: number; fact: number }> = {};
      const productionDailyMap: Record<string, number> = {};
      const clientesMap: Record<string, number> = {};
      const ops: any[] = [];
      const clientesSet = new Set<string>();

      for (const item of rawData) {
        const prog = item.bultos_programados || 0;
        let ent = 0, desp = 0;

        if (item.produccion && Array.isArray(item.produccion)) {
          ent = item.produccion.reduce((acc: number, curr: any) => acc + (curr.bultos_entregados || 0), 0);
          item.produccion.forEach((p: any) => {
            if (p.fecha_produccion && p.bultos_entregados) {
              productionDailyMap[p.fecha_produccion] = (productionDailyMap[p.fecha_produccion] || 0) + p.bultos_entregados;
            }
          });
        }

        if (item.despachos && Array.isArray(item.despachos)) {
          desp = item.despachos.reduce((acc: number, curr: any) => acc + (curr.bultos_despachados || 0), 0);
        }

        const fact = facturadoMap.get(item.lote) || 0;

        pg += prog; pr += ent; dp += desp; fc += fact;

        if (prog > 0 && prog === ent && ent === desp && desp === fact) {
          completos++;
        } else if (prog > 0) {
          pendientes++;
        }

        const alimentoCat = (item.maestro_alimentos as any)?.categoria || 'Otros';
        const alimentoDesc = (item.maestro_alimentos as any)?.descripcion || 'Desconocido';
        const clienteNombre = (item.maestro_clientes as any)?.nombre || 'Sin Cliente';
        clientesSet.add(clienteNombre);

        categories[alimentoCat] = (categories[alimentoCat] || 0) + prog;
        clientesMap[clienteNombre] = (clientesMap[clienteNombre] || 0) + prog;

        if (item.fecha) {
          const weekStart = getWeekStart(item.fecha);
          if (!weeklyMap[weekStart]) weeklyMap[weekStart] = { prog: 0, ent: 0, desp: 0, fact: 0 };
          weeklyMap[weekStart].prog += prog;
          weeklyMap[weekStart].ent += ent;
          weeklyMap[weekStart].desp += desp;
          weeklyMap[weekStart].fact += fact;
        }

        if (ops.length < 15) {
          let status = 'Completado';
          if (ent < prog) status = 'En Producción';
          if (ent >= prog && desp < ent) status = 'En Despacho';
          if (desp >= ent && fact < desp) status = 'Pendiente Factura';
          if (ent === 0) status = 'Sin iniciar';

          ops.push({ lote: item.lote, alimento: alimentoDesc, cliente: clienteNombre, bultos: prog, producido: ent, despachado: desp, facturado: fact, status });
        }
      }

      setKpis({
        programados: pg, producidos: pr, despachados: dp, facturados: fc,
        lotesPendientes: pendientes, lotesCompletos: completos,
        totalOps: rawData.length, clientesActivos: clientesSet.size,
      });

      const bData = Object.keys(productionDailyMap).sort().slice(-21).map(fecha => ({
        fecha: fecha.substring(5),
        bultos: productionDailyMap[fecha],
      }));
      setBarData(bData);

      // Pie chart - top 6 only to avoid label overlap
      const pData = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, value], idx) => ({
          name: name.replace('Alimento ', '').replace('Premezcla ', 'Pre. '),
          value,
          color: COLORS_CATEGORY[idx % COLORS_CATEGORY.length],
        }));

      // Group remaining into "Otros"
      const topNames = new Set(pData.map(p => p.name));
      const otrosSum = Object.entries(categories)
        .filter(([name]) => !topNames.has(name.replace('Alimento ', '').replace('Premezcla ', 'Pre. ')))
        .reduce((s, [, v]) => s + v, 0);
      if (otrosSum > 0) pData.push({ name: 'Otros', value: otrosSum, color: '#94a3b8' });
      setPieData(pData);

      const aData = Object.keys(weeklyMap).sort().map(semana => ({
        semana: semana.substring(5),
        Programado: weeklyMap[semana].prog,
        Producido: weeklyMap[semana].ent,
        Despachado: weeklyMap[semana].desp,
        Facturado: weeklyMap[semana].fact,
      }));
      setAreaData(aData);

      const cData = Object.entries(clientesMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, bultos]) => ({
        name: name.length > 22 ? name.substring(0, 20) + '…' : name,
        bultos,
      }));
      setClienteData(cData);
      setRecentOps(ops);
    }
    setLoading(false);
  };

  function getWeekStart(dateStr: string) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
  }

  const cumplimientoProduccion = kpis.programados > 0 ? ((kpis.producidos / kpis.programados) * 100).toFixed(1) : '0';
  const cumplimientoDespacho = kpis.producidos > 0 ? ((kpis.despachados / kpis.producidos) * 100).toFixed(1) : '0';
  const cumplimientoFactura = kpis.despachados > 0 ? ((kpis.facturados / kpis.despachados) * 100).toFixed(1) : '0';

  const pctColor = (pct: number) => {
    if (pct >= 100) return '#22c55e';
    if (pct >= 85) return '#f59e0b';
    return '#ef4444';
  };

  const tooltipStyle = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
    fontSize: '0.82rem', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  };

  const CustomPieLabel = ({ cx, cy, midAngle, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 25;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if ((percent || 0) < 0.03) return null;
    return (
      <text x={x} y={y} fill="#334155" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={600}>
        {name} {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };
  if (!canView) return <Navigate to="/" replace />;

  return (
    <div>
      {/* Date Filter Bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 20, padding: '10px 16px',
        background: '#fff', borderRadius: 12, border: '1px solid var(--border-color)',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Calendar size={18} style={{ color: 'var(--primary-color)' }} />
          {PERIOD_PRESETS.map(p => (
            <button
              key={p.label}
              className={`filter-pill ${activePreset === p.label ? 'active' : ''}`}
              onClick={() => applyPreset(p)}
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" className="form-input" value={fechaDesde}
            onChange={e => { setFechaDesde(e.target.value); setActivePreset(''); }}
            style={{ width: 140, padding: '5px 8px', fontSize: '0.85rem' }} />
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <input type="date" className="form-input" value={fechaHasta}
            onChange={e => { setFechaHasta(e.target.value); setActivePreset(''); }}
            style={{ width: 140, padding: '5px 8px', fontSize: '0.85rem' }} />
          <button className="btn btn-outline btn-sm" onClick={fetchDashboardData} disabled={loading}>
            <RefreshCw size={14} /> {loading ? '...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="kpi-icon gold"><Calendar size={22} /></div>
          <div className="kpi-info">
            <h3>Programado</h3>
            <div className="kpi-value">{loading ? '...' : kpis.programados.toLocaleString()}</div>
            <div className="kpi-change">{kpis.totalOps} OPs en rango</div>
          </div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #22c55e' }}>
          <div className="kpi-icon green"><Factory size={22} /></div>
          <div className="kpi-info">
            <h3>Producido</h3>
            <div className="kpi-value">{loading ? '...' : kpis.producidos.toLocaleString()}</div>
            <div className="kpi-change positive">{cumplimientoProduccion}% cumplimiento</div>
          </div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #3b82f6' }}>
          <div className="kpi-icon blue"><Truck size={22} /></div>
          <div className="kpi-info">
            <h3>Despachado</h3>
            <div className="kpi-value">{loading ? '...' : kpis.despachados.toLocaleString()}</div>
            <div className="kpi-change">{cumplimientoDespacho}% de producido</div>
          </div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div className="kpi-icon" style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}><Receipt size={22} /></div>
          <div className="kpi-info">
            <h3>Facturado</h3>
            <div className="kpi-value">{loading ? '...' : kpis.facturados.toLocaleString()}</div>
            <div className="kpi-change">{cumplimientoFactura}% de despachado</div>
          </div>
        </div>
      </div>

      {/* Secondary KPIs Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ padding: '14px 18px', background: '#fff', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Package size={20} style={{ color: '#22c55e' }} />
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>OPs Completas</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22c55e' }}>{kpis.lotesCompletos}</div>
          </div>
        </div>
        <div style={{ padding: '14px 18px', background: '#fff', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertTriangle size={20} style={{ color: '#ef4444' }} />
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>OPs Incompletas</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>{kpis.lotesPendientes}</div>
          </div>
        </div>
        <div style={{ padding: '14px 18px', background: '#fff', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Users size={20} style={{ color: '#3b82f6' }} />
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Clientes Activos</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{kpis.clientesActivos}</div>
          </div>
        </div>
        <div style={{ padding: '14px 18px', background: '#fff', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <TrendingUp size={20} style={{ color: '#8b5cf6' }} />
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>KG Totales Prog.</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{(kpis.programados * 40).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Alert Bar */}
      {(!loading && kpis.lotesPendientes > 0) && (
        <div style={{
          padding: '12px 18px', background: '#FFF3E0', border: '1px solid #FFE0B2',
          borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 24, fontSize: '0.88rem',
        }}>
          <AlertTriangle size={18} color="#E65100" />
          <span>
            <strong>{kpis.lotesPendientes} lotes</strong> tienen trazabilidad incompleta.
            <a href="/trazabilidad" style={{ color: '#E65100', fontWeight: 600, marginLeft: 8 }}>Ver detalle →</a>
          </span>
        </div>
      )}

      {/* Charts Row 1: Trend + Pie */}
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">📈 Tendencia Semanal (Embudo Operativo)</div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id="colorProg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
                <linearGradient id="colorDesp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                <linearGradient id="colorFact" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="semana" fontSize={11} stroke="#94a3b8" />
              <YAxis fontSize={11} stroke="#94a3b8" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend verticalAlign="top" height={36} />
              <Area type="monotone" dataKey="Programado" stroke="#f59e0b" fill="url(#colorProg)" strokeWidth={2} />
              <Area type="monotone" dataKey="Producido" stroke="#22c55e" fill="url(#colorProd)" strokeWidth={2} />
              <Area type="monotone" dataKey="Despachado" stroke="#3b82f6" fill="url(#colorDesp)" strokeWidth={2} />
              <Area type="monotone" dataKey="Facturado" stroke="#8b5cf6" fill="url(#colorFact)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">🥧 Distribución por Categoría</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={CustomPieLabel}
                labelLine={true}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => Number(val).toLocaleString() + ' blts'} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2: Production Daily + Top Clients */}
      <div className="charts-grid" style={{ marginTop: 20 }}>
        <div className="chart-card">
          <div className="chart-title">🏭 Producción Diaria (Bultos Entregados)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="fecha" fontSize={10} stroke="#94a3b8" angle={-35} textAnchor="end" height={50} />
              <YAxis fontSize={11} stroke="#94a3b8" />
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => Number(val).toLocaleString() + ' blts'} />
              <Bar dataKey="bultos" fill="#22c55e" radius={[4, 4, 0, 0]} name="Bultos" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">👥 Top Clientes (Bultos Programados)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={clienteData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" fontSize={11} stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" fontSize={10} stroke="#94a3b8" width={160} />
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => Number(val).toLocaleString() + ' blts'} />
              <Bar dataKey="bultos" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Bultos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 3: Supervisor & Dosificador Compliance */}
      <div className="charts-grid" style={{ marginTop: 20 }}>
        <div className="chart-card">
          <div className="chart-title"><Award size={16} style={{ marginRight: 6, color: '#f59e0b' }} />Cumplimiento Supervisores (Meta: {META_BULTOS} blts/turno)</div>
          <div style={{ padding: '12px 16px' }}>
            {supervisorData.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Sin datos de reportes de turno en este periodo</p>
            ) : (
              supervisorData.map(s => (
                <div key={s.nombre} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{s.nombre}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.turnos} turnos</span>
                  </div>
                  <div style={{ width: '100%', height: 26, background: 'rgba(0,0,0,0.04)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      width: `${Math.min(s.promedio, 100)}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${pctColor(s.promedio)}cc, ${pctColor(s.promedio)})`,
                      borderRadius: 8,
                      transition: 'width 0.5s ease',
                    }}></div>
                    <span style={{
                      position: 'absolute', right: 10, top: 5,
                      fontSize: '0.78rem', fontWeight: 800,
                      color: s.promedio > 40 ? '#fff' : '#333',
                    }}>
                      {s.promedio}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-title"><Award size={16} style={{ marginRight: 6, color: '#3b82f6' }} />Cumplimiento Dosificadores (Meta: {META_BACHES} baches/turno)</div>
          <div style={{ padding: '12px 16px' }}>
            {dosificadorData.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Sin datos de reportes de turno en este periodo</p>
            ) : (
              dosificadorData.map(d => (
                <div key={d.nombre} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{d.nombre}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.turnos} turnos</span>
                  </div>
                  <div style={{ width: '100%', height: 26, background: 'rgba(0,0,0,0.04)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      width: `${Math.min(d.promedio, 100)}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${pctColor(d.promedio)}cc, ${pctColor(d.promedio)})`,
                      borderRadius: 8,
                      transition: 'width 0.5s ease',
                    }}></div>
                    <span style={{
                      position: 'absolute', right: 10, top: 5,
                      fontSize: '0.78rem', fontWeight: 800,
                      color: d.promedio > 40 ? '#fff' : '#333',
                    }}>
                      {d.promedio}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Operations Table */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <span className="card-title">📋 Últimas Operaciones Programadas</span>
          <a href="/trazabilidad" className="btn btn-secondary btn-sm">Ver trazabilidad completa →</a>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="data-table-wrapper" style={{ maxHeight: 380 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>OP</th><th>Alimento</th><th>Cliente</th>
                  <th style={{ textAlign: 'right' }}>Prog.</th>
                  <th style={{ textAlign: 'right' }}>Prod.</th>
                  <th style={{ textAlign: 'right' }}>Desp.</th>
                  <th style={{ textAlign: 'right' }}>Fact.</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }}>Cargando dashboard...</td></tr>
                ) : recentOps.map(op => (
                  <tr key={op.lote}>
                    <td style={{ fontWeight: 800 }}>{op.lote}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.85rem' }}>{op.alimento}</td>
                    <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{op.cliente}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{op.bultos.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{op.producido.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{op.despachado.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{op.facturado.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${
                        op.status === 'Completado' ? 'badge-success' :
                        op.status === 'Sin iniciar' ? 'badge-neutral' :
                        op.status === 'Pendiente Factura' ? 'badge-warning' :
                        'badge-info'
                      }`} style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        {op.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
