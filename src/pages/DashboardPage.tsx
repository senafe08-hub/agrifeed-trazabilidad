import { useState, useEffect } from 'react';
import {
  Calendar, Factory, Truck, Receipt, AlertTriangle, RefreshCw, Award, 
  Database, Activity, Search, AlertCircle, Clock, TrendingUp, TrendingDown, CheckCircle2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  AreaChart, Area, RadialBarChart, RadialBar, PolarAngleAxis
} from 'recharts';
import supabase from '../lib/supabase';
import { Navigate, Link } from 'react-router-dom';
import { usePermissions } from '../lib/permissions';

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


export default function DashboardPage() {
  const { canView } = usePermissions('dashboard');
  
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<any>({
    programados: 0, producidos: 0, despachados: 0, facturados: 0,
    lotesPendientes: 0, lotesCompletos: 0, totalOps: 0,
    clientesActivos: 0, bultos_danados_tot: 0,
  });
  const [radialData, setRadialData] = useState<any[]>([]);
  const [barData, setBarData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [areaData, setAreaData] = useState<any[]>([]);
  const [clienteData, setClienteData] = useState<any[]>([]);
  const [supervisorData, setSupervisorData] = useState<any[]>([]);
  const [dosificadorData, setDosificadorData] = useState<any[]>([]);
  const [bottlenecks, setBottlenecks] = useState<any>({ prod: [], desp: [], fact: [], totals: { retenidos: 0, sinFacturar: 0 } });
  const [mermasData, setMermasData] = useState<any[]>([]);
  const [mermasTotals, setMermasTotals] = useState({ prog: 0, ent: 0, variacion: 0 });
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
        lote, fecha, bultos_programados, num_baches,
        maestro_alimentos(descripcion, categoria),
        maestro_clientes(nombre),
        produccion(fecha_produccion, bultos_entregados, baches_entregados),
        despachos(bultos_despachados, bultos_danados)
      `);

    if (fechaDesde) query = query.gte('fecha', fechaDesde);
    if (fechaHasta) query = query.lte('fecha', fechaHasta);

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
      let pg = 0, pr = 0, dp = 0, fc = 0, da = 0;
      let pendientes = 0, completos = 0;
      const categories: Record<string, number> = {};
      const weeklyMap: Record<string, { prog: number; ent: number; desp: number; fact: number }> = {};
      const productionDailyMap: Record<string, number> = {};
      const clientesMap: Record<string, number> = {};
      const bnProd: any[] = [];
      const bnDesp: any[] = [];
      const bnFact: any[] = [];
      let totalRetenidos = 0;
      let totalSinFacturar = 0;
      let mProg = 0;
      let mEnt = 0;
      const clientesSet = new Set<string>();
      const mermasProcesadas: any[] = [];

      for (const item of rawData) {
        const prog = item.bultos_programados || 0;
        const bachesProg = item.num_baches || 0;
        let ent = 0, desp = 0, dan = 0, bachesEnt = 0;

        if (item.produccion && Array.isArray(item.produccion)) {
          ent = item.produccion.reduce((acc: number, curr: any) => acc + (curr.bultos_entregados || 0), 0);
          bachesEnt = item.produccion.reduce((acc: number, curr: any) => acc + (curr.baches_entregados || 0), 0);
          item.produccion.forEach((p: any) => {
            if (p.fecha_produccion && p.bultos_entregados) {
              productionDailyMap[p.fecha_produccion] = (productionDailyMap[p.fecha_produccion] || 0) + p.bultos_entregados;
            }
          });
        }

        if (item.despachos && Array.isArray(item.despachos)) {
          desp = item.despachos.reduce((acc: number, curr: any) => acc + (curr.bultos_despachados || 0), 0);
          dan = item.despachos.reduce((acc: number, curr: any) => acc + (curr.bultos_danados || 0), 0);
        }

        const fact = facturadoMap.get(item.lote) || 0;

        pg += prog; pr += ent; dp += desp; fc += fact; da += dan;

        if (bachesProg > 0 && bachesEnt >= bachesProg && desp >= ent && fact >= desp && ent > 0) {
          completos++;
        } else if (bachesProg > 0) {
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

        if (bachesProg > 0) {
          if (bachesEnt === 0) {
            if (bnProd.length < 5) bnProd.push({ lote: item.lote, alimento: alimentoDesc, cliente: clienteNombre, bultos: prog, st: 'Sin Actividad' });
          } else if (bachesEnt < bachesProg) {
            if (bnProd.length < 5) bnProd.push({ lote: item.lote, alimento: alimentoDesc, cliente: clienteNombre, bultos: prog, st: `Faltan ${bachesProg-bachesEnt} baches` });
          }
          
          if (ent > desp) {
            totalRetenidos += (ent - desp);
            if (bnDesp.length < 5) bnDesp.push({ lote: item.lote, alimento: alimentoDesc, cliente: clienteNombre, bultos: ent, st: `Retenidos ${ent-desp} blts` });
          }
          
          if (desp > fact) {
            totalSinFacturar += (desp - fact);
            if (bnFact.length < 5) bnFact.push({ lote: item.lote, alimento: alimentoDesc, cliente: clienteNombre, bultos: desp, st: `Sin facturar ${desp-fact} blts` });
          }

          if (bachesProg > 0 && bachesEnt >= bachesProg) {
            mProg += prog;
            mEnt += ent;
            const variacion = ent - prog;
            if (variacion !== 0) {
              mermasProcesadas.push({
                lote: item.lote,
                alimento: alimentoDesc,
                cliente: clienteNombre,
                prog: prog,
                ent: ent,
                variacion: variacion,
                porcentaje: prog > 0 ? (variacion / prog) * 100 : 0
              });
            }
          }
        }
      }

      setKpis({
        programados: pg, producidos: pr, despachados: dp, facturados: fc,
        lotesPendientes: pendientes, lotesCompletos: completos,
        totalOps: rawData.length, clientesActivos: clientesSet.size, bultos_danados_tot: da
      });

      const pctProd = pg > 0 ? (pr / pg) * 100 : 0;
      const pctDesp = pr > 0 ? (dp / pr) * 100 : 0;
      const pctFact = dp > 0 ? (fc / dp) * 100 : 0;

      setRadialData([
        { name: 'Facturado', uv: Math.min(pctFact, 100), fill: '#8b5cf6' },
        { name: 'Despachado', uv: Math.min(pctDesp, 100), fill: '#3b82f6' },
        { name: 'Producido', uv: Math.min(pctProd, 100), fill: '#22c55e' }
      ]);


      const bData = Object.keys(productionDailyMap).sort().slice(-21).map(fecha => ({
        fecha: fecha.substring(5),
        bultos: productionDailyMap[fecha],
      }));
      setBarData(bData);

      const pData = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, value], idx) => ({
          name: name.replace('Alimento ', '').replace('Premezcla ', 'Pre. '),
          value,
          color: COLORS_CATEGORY[idx % COLORS_CATEGORY.length],
        }));

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
      setBottlenecks({ prod: bnProd, desp: bnDesp, fact: bnFact, totals: { retenidos: totalRetenidos, sinFacturar: totalSinFacturar } });
      
      mermasProcesadas.sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion));
      setMermasData(mermasProcesadas);
      setMermasTotals({ prog: mProg, ent: mEnt, variacion: mEnt - mProg });
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
    <div style={{ animation: 'fadeIn 0.5s ease', paddingBottom: 40 }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 20, padding: '10px 16px',
        background: '#fff', borderRadius: 12, border: '1px solid var(--border-color)',
        gap: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Calendar size={18} style={{ color: 'var(--primary-color)' }} />
          {PERIOD_PRESETS.map(p => (
            <button
              key={p.label}
              className={`filter-pill ${activePreset === p.label ? 'active' : ''}`}
              onClick={() => applyPreset(p)}
              style={{ fontSize: '0.78rem', padding: '4px 10px', transition: 'all 0.2s' }}
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
          <button className="btn btn-primary btn-sm" onClick={fetchDashboardData} disabled={loading} style={{ border: 'none', background: 'linear-gradient(135deg, #2E7D32, #4CAF50)'}}>
            <RefreshCw size={14} className={loading ? 'spinning' : ''} /> {loading ? '...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div className="kpi-card hover-lift" style={{ borderLeft: '4px solid #f59e0b', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <div className="kpi-icon gold" style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)' }}><Calendar size={22} color="#d97706" /></div>
          <div className="kpi-info" style={{ width: '100%' }}>
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Programado</h3>
            <div className="kpi-value" style={{ fontSize: '1.6rem' }}>{loading ? '...' : kpis.programados.toLocaleString()}</div>
            <div className="kpi-change" style={{ color: '#64748b' }}>{kpis.totalOps} OPs programadas</div>
          </div>
        </div>
        <div className="kpi-card hover-lift" style={{ borderLeft: '4px solid #22c55e', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <div className="kpi-icon green" style={{ background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)' }}><Factory size={22} color="#15803d" /></div>
          <div className="kpi-info" style={{ width: '100%' }}>
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Producido</h3>
            <div className="kpi-value" style={{ fontSize: '1.6rem' }}>{loading ? '...' : kpis.producidos.toLocaleString()}</div>
            <div className="kpi-change positive">{cumplimientoProduccion}% sobre meta</div>
          </div>
        </div>
        <div className="kpi-card hover-lift" style={{ borderLeft: '4px solid #3b82f6', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <div className="kpi-icon blue" style={{ background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)' }}><Truck size={22} color="#1d4ed8" /></div>
          <div className="kpi-info" style={{ width: '100%' }}>
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Despachado</h3>
            <div className="kpi-value" style={{ fontSize: '1.6rem' }}>{loading ? '...' : kpis.despachados.toLocaleString()}</div>
            <div className="kpi-change">{cumplimientoDespacho}% sobre prod.</div>
          </div>
        </div>
        <div className="kpi-card hover-lift" style={{ borderLeft: '4px solid #8b5cf6', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #ede9fe, #ddd6fe)', color: '#6d28d9' }}><Receipt size={22} /></div>
          <div className="kpi-info" style={{ width: '100%' }}>
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Facturado</h3>
            <div className="kpi-value" style={{ fontSize: '1.6rem' }}>{loading ? '...' : kpis.facturados.toLocaleString()}</div>
            <div className="kpi-change">{cumplimientoFactura}% sobre desp.</div>
          </div>
        </div>
      </div>

      {(!loading && kpis.lotesPendientes > 0) && (
        <div style={{
          padding: '14px 20px', background: '#FFF3E0', border: '1px solid #FFE0B2',
          borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 20, fontSize: '0.9rem', boxShadow: '0 2px 10px rgba(230,81,0,0.05)'
        }}>
          <AlertTriangle size={20} color="#E65100" />
          <span>
            <strong>{kpis.lotesPendientes} lotes</strong> tienen trazabilidad incompleta en el rango.
            <Link to="/trazabilidad" style={{ color: '#E65100', fontWeight: 700, marginLeft: 12, textDecoration: 'underline' }}>Ver detalle completo →</Link>
          </span>
        </div>
      )}

      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-color)', marginBottom: 12, marginLeft: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Activity size={18} color="var(--primary-color)"/> Enlaces a Módulos e Inteligencia Operativa
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
        <Link to="/programacion" className="module-card" style={{ textDecoration: 'none', padding: '16px', background: 'linear-gradient(145deg, #fff, #f8fcf8)', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ padding: 8, background: '#f59e0b15', borderRadius: 8, color: '#d97706', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Search size={18} /></div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12 }}>Programación</span>
          </div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#334155' }}>{(kpis.programados * 40).toLocaleString()} KG</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Masa Programada Total</div>
          </div>
          <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>Ir a Programación →</div>
        </Link>
        
        <Link to="/produccion" className="module-card" style={{ textDecoration: 'none', padding: '16px', background: 'linear-gradient(145deg, #fff, #f8fcf8)', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ padding: 8, background: '#22c55e15', borderRadius: 8, color: '#15803d', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Factory size={18} /></div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12 }}>Producción</span>
          </div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#334155' }}>{kpis.lotesCompletos} OPs</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Producción Completa</div>
          </div>
          <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>Gestión Producción →</div>
        </Link>

        <Link to="/despachos" className="module-card" style={{ textDecoration: 'none', padding: '16px', background: 'linear-gradient(145deg, #fff, #f8fcf8)', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ padding: 8, background: '#3b82f615', borderRadius: 8, color: '#1d4ed8', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Truck size={18} /></div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12 }}>Despachos</span>
          </div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#334155' }}>{kpis.clientesActivos}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Clientes Atendidos</div>
          </div>
          <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>Control Despachos →</div>
        </Link>

        <Link to="/facturacion" className="module-card" style={{ textDecoration: 'none', padding: '16px', background: 'linear-gradient(145deg, #fff, #f8fcf8)', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ padding: 8, background: '#8b5cf615', borderRadius: 8, color: '#6d28d9', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Receipt size={18} /></div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12 }}>Facturación</span>
          </div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#334155' }}>{kpis.totalOps} OPs</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Órdenes Totales Filtradas</div>
          </div>
          <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>Ir a Facturación →</div>
        </Link>
        
        <Link to="/maestro" className="module-card" style={{ textDecoration: 'none', padding: '16px', background: 'linear-gradient(145deg, #fff, #f8fcf8)', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ padding: 8, background: '#64748b15', borderRadius: 8, color: '#334155', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Database size={18} /></div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12 }}>BD</span>
          </div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#334155' }}>CATÁLOGOS</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Clientes & Fórmulas</div>
          </div>
          <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>Modificar Base Datos →</div>
        </Link>
      </div>

      <style>{`
        .module-card:hover { border-color: var(--primary-color) !important; transform: translateY(-4px); box-shadow: 0 10px 25px rgba(0,0,0,0.08) !important; }
        .hover-lift { transition: transform 0.2s; }
        .hover-lift:hover { transform: translateY(-2px); }
      `}</style>


      <div className="charts-grid" style={{ gridTemplateColumns: '7fr 3fr' }}>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="semana" fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '0.85rem' }} />
              <Area type="monotone" dataKey="Programado" stroke="#f59e0b" fill="url(#colorProg)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="Producido" stroke="#22c55e" fill="url(#colorProd)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="Despachado" stroke="#3b82f6" fill="url(#colorDesp)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="Facturado" stroke="#8b5cf6" fill="url(#colorFact)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">⚖ Rendimiento Global (%)</div>
          <div style={{ height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height={260}>
              <RadialBarChart 
                cx="50%" cy="50%" innerRadius="30%" outerRadius="100%" 
                barSize={20} data={radialData} startAngle={90} endAngle={-270}
                style={{ padding: 0 }}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar
                  background={{ fill: '#f1f5f9' }}
                  dataKey="uv"
                  cornerRadius={10}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Legend iconSize={12} layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: '0.78rem' }} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="charts-grid" style={{ marginTop: 20 }}>
        <div className="chart-card">
          <div className="chart-title">🏭 Entrega por Días (Progreso Diario)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="fecha" fontSize={10} stroke="#94a3b8" angle={-35} textAnchor="end" height={50} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => Number(val).toLocaleString() + ' blts'} cursor={{ fill: 'rgba(34, 197, 94, 0.05)' }} />
              <Bar dataKey="bultos" fill="#22c55e" radius={[4, 4, 0, 0]} name="Entregado">
                {barData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === barData.length - 1 ? '#15803d' : '#22c55e'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">👥 Top 8 Clientes (Masa Movilizada)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={clienteData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" fontSize={10} stroke="#94a3b8" width={160} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => Number(val).toLocaleString() + ' blts'} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
              <Bar dataKey="bultos" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Bultos Totales">
                {clienteData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={`url(#colorDesp)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="charts-grid" style={{ marginTop: 20 }}>
        <div className="chart-card">
          <div className="chart-title">🥧 Concentración por Línea de Producto</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData} cx="50%" cy="50%"
                innerRadius={60} outerRadius={100}
                paddingAngle={4} dataKey="value"
                label={CustomPieLabel} labelLine={false}
                stroke="none"
              >
                {pieData.map((entry, i) => (
                   <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => Number(val).toLocaleString() + ' blts'} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="chart-title"><Award size={16} style={{ marginRight: 6, color: '#f59e0b' }} />Rendimiento Personal - Supervisores</div>
          <div style={{ padding: '8px 16px', flex: 1, overflowY: 'auto' }}>
            {supervisorData.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20, fontSize: '0.85rem' }}>Sin reportes en periodo</p>
            ) : (
              supervisorData.map(s => (
                <div key={s.nombre} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{s.nombre}</span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{s.turnos} turnos</span>
                  </div>
                  <div style={{ width: '100%', height: 18, background: '#f1f5f9', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      width: `${Math.min(s.promedio, 100)}%`, height: '100%',
                      background: `linear-gradient(90deg, ${pctColor(s.promedio)}aa, ${pctColor(s.promedio)})`,
                      borderRadius: 10, transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}></div>
                    <span style={{ position: 'absolute', right: 8, top: 2, fontSize: '0.7rem', fontWeight: 800, color: s.promedio > 30 ? '#fff' : '#475569' }}>
                      {s.promedio}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="chart-title" style={{ borderTop: '1px solid #f1f5f9', marginTop: 10, paddingTop: 10 }}><Award size={16} style={{ marginRight: 6, color: '#3b82f6' }} />Rendimiento Personal - Dosificadores</div>
          <div style={{ padding: '8px 16px', flex: 1, overflowY: 'auto' }}>
            {dosificadorData.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20, fontSize: '0.85rem' }}>Sin reportes en periodo</p>
            ) : (
              dosificadorData.map(d => (
                <div key={d.nombre} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{d.nombre}</span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{d.turnos} turnos</span>
                  </div>
                  <div style={{ width: '100%', height: 18, background: '#f1f5f9', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      width: `${Math.min(d.promedio, 100)}%`, height: '100%',
                      background: `linear-gradient(90deg, ${pctColor(d.promedio)}aa, ${pctColor(d.promedio)})`,
                      borderRadius: 10, transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}></div>
                    <span style={{ position: 'absolute', right: 8, top: 2, fontSize: '0.7rem', fontWeight: 800, color: d.promedio > 30 ? '#fff' : '#475569' }}>
                      {d.promedio}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingLeft: 6 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={20} color="#ef4444" /> Panel de Alertas: Retrasos y Lotes Pendientes
          </h3>
          <Link to="/trazabilidad" className="btn btn-secondary btn-sm" style={{ fontWeight: 600, background: '#fff' }}>Analizar Todos los Lotes →</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
            <div style={{ background: '#fef3c7', padding: '12px 16px', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8, color: '#b45309', fontWeight: 700, fontSize: '0.9rem' }}>
              <Clock size={16} /> Demoras en Producción
            </div>
            <div style={{ padding: 16, minHeight: 100 }}>
              {loading ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Buscando alertas...</div> :
                bottlenecks.prod.length === 0 ? <div style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 600 }}>Al día</div> :
                bottlenecks.prod.map((b: any, i: number) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: i < bottlenecks.prod.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: '0.82rem' }}>
                    <strong style={{ color: '#334155' }}>OP {b.lote}</strong> | <span style={{ color: '#ef4444', fontWeight: 600 }}>{b.st}</span>
                    <div style={{ color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.alimento}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{b.cliente}</div>
                  </div>
                ))
              }
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
            <div style={{ background: '#e0e7ff', padding: '12px 16px', borderBottom: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#4338ca', fontWeight: 700, fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Truck size={16} /> Listo sin Despachar</div>
              {bottlenecks.totals?.retenidos > 0 && <span style={{ fontSize: '0.75rem', background: '#4338ca', color: '#fff', padding: '2px 8px', borderRadius: 12 }}>{bottlenecks.totals.retenidos.toLocaleString()} blts</span>}
            </div>
            <div style={{ padding: 16, minHeight: 100 }}>
              {loading ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Buscando alertas...</div> :
                bottlenecks.desp.length === 0 ? <div style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 600 }}>Al día</div> :
                bottlenecks.desp.map((b: any, i: number) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: i < bottlenecks.desp.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: '0.82rem' }}>
                    <strong style={{ color: '#334155' }}>OP {b.lote}</strong> | <span style={{ color: '#ef4444', fontWeight: 600 }}>{b.st}</span>
                    <div style={{ color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.alimento}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{b.cliente}</div>
                  </div>
                ))
              }
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
            <div style={{ background: '#fce7f3', padding: '12px 16px', borderBottom: '1px solid #fbcfe8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#be185d', fontWeight: 700, fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Receipt size={16} /> Despachado sin Facturar</div>
              {bottlenecks.totals?.sinFacturar > 0 && <span style={{ fontSize: '0.75rem', background: '#be185d', color: '#fff', padding: '2px 8px', borderRadius: 12 }}>{bottlenecks.totals.sinFacturar.toLocaleString()} blts</span>}
            </div>
            <div style={{ padding: 16, minHeight: 100 }}>
              {loading ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Buscando alertas...</div> :
                bottlenecks.fact.length === 0 ? <div style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 600 }}>Al día</div> :
                bottlenecks.fact.map((b: any, i: number) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: i < bottlenecks.fact.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: '0.82rem' }}>
                    <strong style={{ color: '#334155' }}>OP {b.lote}</strong> | <span style={{ color: '#ef4444', fontWeight: 600 }}>{b.st}</span>
                    <div style={{ color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.alimento}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{b.cliente}</div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, background: '#fff', borderRadius: 12, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} style={{ color: '#4b5563' }} /> Análisis de Mermas de Producción
          </h3>
          <div style={{ display: 'flex', gap: 16, background: '#f8fafc', padding: '6px 16px', borderRadius: 20, border: '1px solid #e2e8f0' }}>
            {mermasTotals.prog > 0 ? (
              <>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Prog. Periodo: <strong>{mermasTotals.prog}</strong></div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', borderLeft: '1px solid #cbd5e1', paddingLeft: 12 }}>Real Producido: <strong>{mermasTotals.ent}</strong></div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, borderLeft: '1px solid #cbd5e1', paddingLeft: 12, color: mermasTotals.variacion > 0 ? '#15803d' : (mermasTotals.variacion < 0 ? '#b91c1c' : '#475569') }}>
                  Merma Global: {mermasTotals.variacion > 0 ? '+' : ''}{mermasTotals.variacion} <span style={{ opacity: 0.8 }}>({(mermasTotals.variacion / mermasTotals.prog * 100).toFixed(2)}%)</span>
                </div>
              </>
            ) : (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Muestra diferencias (OPs con prod. completa)</span>
            )}
          </div>
        </div>
        <div style={{ padding: '0px 0px' }}>
          {loading ? (
             <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando mermas...</div>
          ) : mermasData.length === 0 ? (
             <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
               <CheckCircle2 size={32} style={{ color: '#22c55e', margin: '0 auto 8px', opacity: 0.5 }} />
               <div>No se han registrado mermas. Todas las OPs cerraron exactamente igual a lo programado.</div>
             </div>
          ) : (
            <div style={{ maxHeight: 350, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10 }}>
                  <tr>
                    <th style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>Identificación</th>
                    <th style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>Cálculo Programado</th>
                    <th style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>Bultos Producidos</th>
                    <th style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, textAlign: 'right' }}>Variación (Merma)</th>
                  </tr>
                </thead>
                <tbody>
                  {mermasData.map((m, idx) => {
                    const isExtra = m.variacion > 0;
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>OP {m.lote}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{m.alimento}</div>
                        </td>
                        <td style={{ padding: '12px 20px', fontWeight: 500 }}>{m.prog} blts</td>
                        <td style={{ padding: '12px 20px', fontWeight: 500 }}>{m.ent} blts</td>
                        <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700 }}>
                          <span style={{ 
                            display: 'inline-flex', alignItems: 'center', gap: 4, 
                            padding: '4px 8px', borderRadius: 6, 
                            background: isExtra ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: isExtra ? '#15803d' : '#b91c1c'
                          }}>
                            {isExtra ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {isExtra ? '+' : ''}{m.variacion} <span style={{fontSize: '0.75rem', opacity: 0.8}}>({m.porcentaje.toFixed(2)}%)</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
