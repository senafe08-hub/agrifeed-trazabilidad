import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Upload, FileSpreadsheet, DollarSign, Users, AlertTriangle, TrendingUp,
  BarChart3, Clock, CheckCircle2, RefreshCw, Table2, Search, Filter, X, Download,
  Database, ArrowUpCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell,
} from 'recharts';
import * as XLSX from 'xlsx';
import supabase from '../../lib/supabase';
import { registrarAuditoria } from '../../lib/supabase';
import { toast } from '../../components/Toast';

/* ══════════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════════ */
interface CarteraRow {
  cliente: number;
  factura: number;
  importe: number;
  demora: number;
  vencimiento: string;
  texto: string;
  fechaDoc: string;
  claseDoc: string;
  sociedad?: number;
  ejercicio?: number;
  periodoContable?: number;
  numDocumento?: number;
  cifraInteres?: number;
  fechaPago?: string;
  condicionesPago?: string;
  cuentaMayor?: number;
}

interface CupoRow {
  deudor: number;
  nombre: string;
  limiteCredito: number;
  limiteTotal: number;
  tipoPago: string;
  poblacion: string;
}

interface ClienteSummary {
  deudor: number;
  nombre: string;
  poblacion: string;
  tipoPago: string;
  limiteCredito: number;
  limiteTotal: number;
  totalDeuda: number;
  facturas: number;
  usoCupo: number;
  maxDemora: number;
  sinVencer: number;
  rango1_30: number;
  rango31_60: number;
  rangoMas60: number;
}

type AgeFilter = 'all' | 'sinVencer' | '1_30' | '31_60' | 'mas60';

/* ══════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════ */
const COLORS_TIPOPAGO = [
  '#2E7D32', '#1565C0', '#6A1B9A', '#E65100', '#00838F',
  '#AD1457', '#f59e0b', '#3b82f6', '#ef4444', '#22c55e', '#8b5cf6', '#14b8a6',
];

// Clientes a excluir del análisis de cartera (facturación anticipada)
const CLIENTES_EXCLUIDOS = [
  'INDUSTRIAS PUROPOLLO',
  'COLOMBIANA DE INCUBACION',
];

const COLORS_AGE: Record<string, string> = {
  sinVencer: '#22c55e',
  rango1_30: '#f59e0b',
  rango31_60: '#ef4444',
  rangoMas60: '#991b1b',
};

const tooltipStyle = {
  background: 'var(--bg-surface)', border: '1px solid #e2e8f0', borderRadius: 10,
  fontSize: '0.82rem', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

const fmtMoney = (v: number) => '$ ' + v.toLocaleString('es-CO');
const fmtMoneyShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000_000) return '$ ' + (v / 1_000_000_000).toFixed(1) + 'B';
  if (Math.abs(v) >= 1_000_000) return '$ ' + (v / 1_000_000).toFixed(0) + 'M';
  return '$ ' + (v / 1000).toFixed(0) + 'K';
};

const BATCH_SIZE = 500; // Supabase insert batch size

/* ══════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════ */
export default function DashboardCartera() {
  /* ── Core data ── */
  const [, setCarteraData] = useState<CarteraRow[]>([]);
  const [summary, setSummary] = useState<ClienteSummary[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  /* ── Upload UI ── */
  const carteraInputRef = useRef<HTMLInputElement>(null);
  const [carteraFile, setCarteraFile] = useState<{ name: string; rows: any[] } | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  /* ── Filters ── */
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [filterTipoPago, setFilterTipoPago] = useState<string>('all');
  const [filterAge, setFilterAge] = useState<AgeFilter>('all');
  const [filterRisk, setFilterRisk] = useState<string>('all'); // 'all' | 'alto' | 'medio' | 'bajo' | 'ok'

  /* ══════════════════════════════════════════════════
     LOAD FROM DATABASE ON MOUNT
     ══════════════════════════════════════════════════ */
  useEffect(() => {
    loadFromDatabase();
  }, []);

  const loadFromDatabase = useCallback(async () => {
    setLoading(true);
    try {
      // Load cartera from cartera_detalle and cupos from maestro_clientes
      const [{ data: carteraRows, error: cErr }, { data: clienteRows, error: clErr }] = await Promise.all([
        supabase.from('cartera_detalle').select('*').order('importe', { ascending: false }),
        supabase.from('maestro_clientes').select('codigo_sap, nombre, poblacion, tipo_pago, limite_credito'),
      ]);

      if (cErr) throw cErr;
      if (clErr) throw clErr;

      if (carteraRows && carteraRows.length > 0 && clienteRows) {
        const parsedCartera: CarteraRow[] = carteraRows.map((r: any) => ({
          cliente: r.cliente,
          factura: r.factura || 0,
          importe: r.importe || 0,
          demora: r.demora_vencimiento || 0,
          vencimiento: r.vencimiento_neto || '',
          texto: r.texto || '',
          fechaDoc: r.fecha_documento || '',
          claseDoc: r.clase_documento || '',
        }));

        // Build cupo data from maestro_clientes
        const parsedCupo: CupoRow[] = clienteRows.map((r: any) => ({
          deudor: r.codigo_sap,
          nombre: r.nombre || '',
          limiteCredito: Number(r.limite_credito) || 0,
          limiteTotal: Number(r.limite_credito) || 0,
          tipoPago: r.tipo_pago || 'CONTADO',
          poblacion: r.poblacion || '',
        }));

        setCarteraData(parsedCartera);
        processMerge(parsedCartera, parsedCupo);
        setDataLoaded(true);

        // Get the most recent timestamp
        const latest = carteraRows.reduce((max: string, r: any) =>
          r.created_at > max ? r.created_at : max, '');
        if (latest) setLastUpdate(new Date(latest).toLocaleString('es-CO'));
      } else {
        setDataLoaded(false);
      }
    } catch (err: any) {
      console.error('Error loading cartera from DB:', err);
      setDataLoaded(false);
    }
    setLoading(false);
  }, []);

  /* ══════════════════════════════════════════════════
     EXCEL PARSING (files → staging)
     ══════════════════════════════════════════════════ */
  const parseCarteraFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        setCarteraFile({ name: file.name, rows });
        toast.success(`Archivo leído: ${rows.length} registros de cartera`);
      } catch (err: any) {
        toast.error('Error al leer el archivo: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  /* ══════════════════════════════════════════════════
     UPLOAD TO DATABASE (delete old → insert new cartera)
     ══════════════════════════════════════════════════ */
  const handleUploadToDatabase = useCallback(async () => {
    if (!carteraFile) {
      toast.error('Debe cargar el archivo de cartera.');
      return;
    }
    setUploading(true);
    try {
      const carteraRows = carteraFile.rows.map(r => ({
        sociedad: Number(r['Sociedad']) || null,
        fecha_documento: excelDateToStr(r['Fecha de documento']) || null,
        ejercicio: Number(r['Ejercicio']) || null,
        periodo_contable: Number(r['Período contable'] || r['Periodo contable']) || null,
        num_documento: Number(r['N° documento'] || r['Nº documento']) || null,
        clase_documento: String(r['Clase de documento'] || ''),
        factura: Number(r['Factura']) || null,
        cliente: Number(r['Cliente']) || 0,
        importe: Number(r['Importe en moneda local']) || 0,
        cifra_interes: Number(r['Cifra de interés'] || r['Cifra de interes']) || 0,
        demora_vencimiento: Number(r['Demora tras vencimiento neto']) || 0,
        fecha_pago: excelDateToStr(r['Fecha de pago']) || null,
        vencimiento_neto: excelDateToStr(r['Vencimiento neto']) || null,
        condiciones_pago: String(r['Condiciones de pago'] || ''),
        cuenta_mayor: Number(r['Cuenta de mayor']) || null,
        texto: String(r['Texto'] || ''),
      }));

      await supabase.from('cartera_detalle').delete().gte('id', 0);
      for (let i = 0; i < carteraRows.length; i += BATCH_SIZE) {
        const batch = carteraRows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('cartera_detalle').insert(batch);
        if (error) throw new Error(`Error insertando cartera lote ${i}: ${error.message}`);
      }

      await registrarAuditoria('IMPORT', 'Cartera', `Se actualizó la cartera: ${carteraRows.length} documentos`);
      toast.success(`✅ Cartera actualizada: ${carteraRows.length} documentos`);

      setCarteraFile(null);
      setShowUploadPanel(false);
      await loadFromDatabase();
    } catch (err: any) {
      toast.error('Error al actualizar la base de datos: ' + err.message);
    }
    setUploading(false);
  }, [carteraFile, loadFromDatabase]);

  /* ══════════════════════════════════════════════════
     DATA PROCESSING (merge cartera + cupos → summary)
     ══════════════════════════════════════════════════ */
  const processMerge = useCallback((cartera: CarteraRow[], cupos: CupoRow[]) => {
    const cupoMap = new Map<number, CupoRow>();
    for (const c of cupos) cupoMap.set(c.deudor, c);

    const clienteMap = new Map<number, CarteraRow[]>();
    for (const row of cartera) {
      // Filtrar registros con cliente inválido (0 o vacío)
      if (!row.cliente || row.cliente === 0) continue;
      if (!clienteMap.has(row.cliente)) clienteMap.set(row.cliente, []);
      clienteMap.get(row.cliente)!.push(row);
    }

    const result: ClienteSummary[] = [];
    for (const [clienteId, rows] of clienteMap) {
      const cupo = cupoMap.get(clienteId);
      const nombreCliente = cupo?.nombre || `Cliente ${clienteId}`;

      // Excluir clientes de facturación anticipada
      if (CLIENTES_EXCLUIDOS.some(exc => nombreCliente.toUpperCase().includes(exc))) continue;

      const totalDeuda = rows.reduce((s, r) => s + r.importe, 0);
      const maxDemora = Math.max(...rows.map(r => r.demora));

      let sinVencer = 0, rango1_30 = 0, rango31_60 = 0, rangoMas60 = 0;
      for (const r of rows) {
        if (r.demora <= 0) sinVencer += r.importe;
        else if (r.demora <= 30) rango1_30 += r.importe;
        else if (r.demora <= 60) rango31_60 += r.importe;
        else rangoMas60 += r.importe;
      }

      const limite = cupo?.limiteCredito || cupo?.limiteTotal || 0;

      result.push({
        deudor: clienteId,
        nombre: nombreCliente,
        poblacion: cupo?.poblacion || 'Sin Asignar',
        tipoPago: cupo?.tipoPago || '—',
        limiteCredito: cupo?.limiteCredito || 0,
        limiteTotal: cupo?.limiteTotal || 0,
        totalDeuda,
        facturas: rows.length,
        usoCupo: limite > 0 ? Math.round((totalDeuda / limite) * 100) : totalDeuda > 0 ? 999 : 0,
        maxDemora,
        sinVencer,
        rango1_30,
        rango31_60,
        rangoMas60,
      });
    }

    result.sort((a, b) => b.totalDeuda - a.totalDeuda);
    setSummary(result);
  }, []);

  /* ══════════════════════════════════════════════════
     FILTERED DATA (all charts + table driven from this)
     ══════════════════════════════════════════════════ */
  const filteredSummary = useMemo(() => {
    return summary.filter(c => {
      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const match = c.nombre.toLowerCase().includes(term) ||
          String(c.deudor).includes(term) ||
          c.poblacion.toLowerCase().includes(term);
        if (!match) return false;
      }
      // City
      if (filterCity !== 'all' && c.poblacion !== filterCity) return false;
      // Tipo pago
      if (filterTipoPago !== 'all' && c.tipoPago !== filterTipoPago) return false;
      // Age filter
      if (filterAge === 'sinVencer' && c.sinVencer <= 0) return false;
      if (filterAge === '1_30' && c.rango1_30 <= 0) return false;
      if (filterAge === '31_60' && c.rango31_60 <= 0) return false;
      if (filterAge === 'mas60' && c.rangoMas60 <= 0) return false;
      // Risk filter
      if (filterRisk === 'alto' && c.rangoMas60 <= 0) return false;
      if (filterRisk === 'medio' && (c.rango31_60 <= 0 || c.rangoMas60 > 0)) return false;
      if (filterRisk === 'bajo' && (c.rango1_30 <= 0 || c.rango31_60 > 0 || c.rangoMas60 > 0)) return false;
      if (filterRisk === 'ok' && (c.rango1_30 > 0 || c.rango31_60 > 0 || c.rangoMas60 > 0)) return false;
      return true;
    });
  }, [summary, searchTerm, filterCity, filterTipoPago, filterAge, filterRisk]);

  // Unique cities and tipo pagos from full data
  const allCities = useMemo(() => [...new Set(summary.map(c => c.poblacion))].sort(), [summary]);
  const allTipoPagos = useMemo(() => [...new Set(summary.map(c => c.tipoPago))].sort(), [summary]);

  const hasActiveFilters = searchTerm || filterCity !== 'all' || filterTipoPago !== 'all' || filterAge !== 'all' || filterRisk !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setFilterCity('all');
    setFilterTipoPago('all');
    setFilterAge('all');
    setFilterRisk('all');
  };

  /* ══════════════════════════════════════════════════
     COMPUTED KPIs (from filtered data)
     ══════════════════════════════════════════════════ */
  const totalCartera = filteredSummary.reduce((s, c) => s + c.totalDeuda, 0);
  const totalClientes = filteredSummary.length;
  const totalFacturas = filteredSummary.reduce((s, c) => s + c.facturas, 0);
  const totalVencido = filteredSummary.reduce((s, c) => s + c.rango1_30 + c.rango31_60 + c.rangoMas60, 0);
  const totalSinVencer = filteredSummary.reduce((s, c) => s + c.sinVencer, 0);
  const totalRango1_30 = filteredSummary.reduce((s, c) => s + c.rango1_30, 0);
  const totalRango31_60 = filteredSummary.reduce((s, c) => s + c.rango31_60, 0);
  const totalRangoMas60 = filteredSummary.reduce((s, c) => s + c.rangoMas60, 0);
  const pctVencido = totalCartera > 0 ? ((totalVencido / totalCartera) * 100).toFixed(1) : '0';
  const clientesAltoRiesgo = filteredSummary.filter(c => c.rangoMas60 > 0).length;

  /* ══════════════════════════════════════════════════
     CHART DATA (from filtered data)
     ══════════════════════════════════════════════════ */
  const top10Clientes = filteredSummary.slice(0, 10).map(c => ({
    name: c.nombre.length > 25 ? c.nombre.substring(0, 23) + '…' : c.nombre,
    fullName: c.nombre,
    deuda: c.totalDeuda,
    sinVencer: c.sinVencer,
    vencido: c.rango1_30 + c.rango31_60 + c.rangoMas60,
  }));

  const ageData = [
    { name: 'Sin Vencer', key: 'sinVencer' as AgeFilter, value: totalSinVencer, color: COLORS_AGE.sinVencer },
    { name: '1 - 30 días', key: '1_30' as AgeFilter, value: totalRango1_30, color: COLORS_AGE.rango1_30 },
    { name: '31 - 60 días', key: '31_60' as AgeFilter, value: totalRango31_60, color: COLORS_AGE.rango31_60 },
    { name: '> 60 días', key: 'mas60' as AgeFilter, value: totalRangoMas60, color: COLORS_AGE.rangoMas60 },
  ];

  // Uso de cupo distribution (for new chart)
  const usoCupoData = useMemo(() => {
    const bands = [
      { name: '< 50%', min: 0, max: 50, count: 0, color: '#22c55e' },
      { name: '50-80%', min: 50, max: 80, count: 0, color: '#f59e0b' },
      { name: '80-100%', min: 80, max: 100, count: 0, color: '#ef4444' },
      { name: '> 100%', min: 100, max: 998, count: 0, color: '#991b1b' },
      { name: 'SIN CUPO', min: 999, max: 9999, count: 0, color: '#64748b' },
    ];
    for (const c of filteredSummary) {
      const band = bands.find(b => c.usoCupo >= b.min && c.usoCupo < b.max) || bands[bands.length - 1];
      band.count++;
    }
    return bands.filter(b => b.count > 0);
  }, [filteredSummary]);

  // Tipo pago distribution
  const tipoPagoMap = new Map<string, { count: number; deuda: number }>();
  for (const c of filteredSummary) {
    const tp = c.tipoPago || '—';
    const existing = tipoPagoMap.get(tp) || { count: 0, deuda: 0 };
    tipoPagoMap.set(tp, { count: existing.count + 1, deuda: existing.deuda + c.totalDeuda });
  }

  /* ── Chart click handlers (interactive filters) ── */
  const handleAgeBarClick = (data: any) => {
    if (data && data.activePayload?.[0]) {
      const clicked = data.activePayload[0].payload;
      setFilterAge(prev => prev === clicked.key ? 'all' : clicked.key);
    }
  };

  const handleClienteBarClick = (data: any) => {
    if (data && data.activePayload?.[0]) {
      const clicked = data.activePayload[0].payload;
      setSearchTerm(prev => prev === clicked.fullName ? '' : clicked.fullName);
    }
  };

  /* ── Export filtered data to Excel ── */
  const handleExportExcel = () => {
    const exportData = filteredSummary.map(c => ({
      'Código': c.deudor,
      'Cliente': c.nombre,
      'Ciudad': c.poblacion,
      'Tipo Pago': c.tipoPago,
      'Límite Crédito': c.limiteCredito,
      'Total Deuda': c.totalDeuda,
      'Uso Cupo %': c.usoCupo < 999 ? c.usoCupo : 'SIN CUPO',
      'Documentos': c.facturas,
      'Max Demora (días)': c.maxDemora,
      'Sin Vencer': c.sinVencer,
      '1-30 días': c.rango1_30,
      '31-60 días': c.rango31_60,
      '>60 días': c.rangoMas60,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cartera');
    XLSX.writeFile(wb, `Cartera_Analisis_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Archivo Excel exportado');
  };

  /* ── Drop handler ── */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    parseCarteraFile(file);
  }, [parseCarteraFile]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  /* ══════════════════════════════════════════════════
     RENDER — Loading
     ══════════════════════════════════════════════════ */
  if (loading) {
    return (
      <div className="fact-tab-content">
        <div className="dc-upload-container">
          <RefreshCw size={32} className="dc-spin" style={{ color: '#1565C0', marginBottom: 16 }} />
          <p style={{ color: 'var(--text-muted)' }}>Cargando datos de cartera...</p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════
     RENDER — No data / Upload Screen
     ══════════════════════════════════════════════════ */
  if (!dataLoaded && !showUploadPanel) {
    return (
      <div className="fact-tab-content">
        <div className="dc-upload-container">
          <div className="dc-upload-header">
            <div className="dc-upload-icon-wrap">
              <BarChart3 size={32} />
            </div>
            <h2>Dashboard de Gestión de Cartera</h2>
            <p>No hay datos cargados. Suba los archivos de Excel para poblar la base de datos.</p>
          </div>
          <button className="dc-process-btn" onClick={() => setShowUploadPanel(true)}>
            <Upload size={18} /> Cargar Archivos de Cartera
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════
     RENDER — Upload Panel (overlay or inline)
     ══════════════════════════════════════════════════ */
  const UploadPanel = () => (
    <div className="dc-upload-panel">
      <div className="dc-upload-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowUpCircle size={20} style={{ color: '#1565C0' }} />
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Actualizar Datos de Cartera</h3>
        </div>
        <button className="btn-icon-close" onClick={() => { setShowUploadPanel(false); setCarteraFile(null); }}>
          <X size={18} />
        </button>
      </div>
      <p className="dc-upload-warning">
        ⚠️ Al actualizar, se reemplazará toda la información de cartera con los datos nuevos. Los cupos se gestionan desde <strong>Maestro de Datos → Clientes</strong>.
      </p>

      <div className="dc-upload-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div
          className={`dc-drop-zone ${carteraFile ? 'loaded' : ''}`}
          onDrop={e => handleDrop(e)}
          onDragOver={handleDragOver}
          onClick={() => carteraInputRef.current?.click()}
        >
          <input ref={carteraInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) parseCarteraFile(e.target.files[0]); }} />
          <div className="dc-drop-zone-inner">
            {carteraFile ? (
              <>
                <CheckCircle2 size={32} className="dc-icon-success" />
                <span className="dc-file-name">{carteraFile.name}</span>
                <span className="dc-file-count">{carteraFile.rows.length} registros</span>
              </>
            ) : (
              <>
                <FileSpreadsheet size={32} className="dc-icon-upload" />
                <span className="dc-drop-label">Detalle De Cartera</span>
                <span className="dc-drop-hint">Arrastra o haz clic para cargar el archivo Excel</span>
              </>
            )}
          </div>
        </div>
      </div>

      <button
        className="dc-process-btn"
        onClick={handleUploadToDatabase}
        disabled={!carteraFile || uploading}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {uploading ? <RefreshCw size={18} className="dc-spin" /> : <Database size={18} />}
        {uploading ? 'Subiendo a la base de datos...' : 'Actualizar Cartera'}
      </button>
    </div>
  );

  /* ══════════════════════════════════════════════════
     RENDER — DASHBOARD VIEW
     ══════════════════════════════════════════════════ */
  return (
    <div className="fact-tab-content">
      {/* Upload Panel Modal/Inline */}
      {showUploadPanel && <UploadPanel />}

      {/* Header */}
      <div className="dc-dashboard-header">
        <div className="dc-dashboard-title">
          <BarChart3 size={22} />
          <h2>Gestión de Cartera</h2>
          {lastUpdate && (
            <span className="dc-last-update">Actualizado: {lastUpdate}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={handleExportExcel} title="Exportar datos filtrados">
            <Download size={14} /> Exportar
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowUploadPanel(true)} title="Actualizar archivos">
            <Upload size={14} /> Actualizar Datos
          </button>
          <button className="btn btn-outline btn-sm" onClick={loadFromDatabase} title="Recargar desde BD">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="dc-filter-bar">
        <div className="dc-filter-left">
          <Filter size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <div className="dc-search-wrap">
            <Search size={14} />
            <input
              type="text"
              placeholder="Buscar cliente, código, ciudad..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && <button onClick={() => setSearchTerm('')}><X size={12} /></button>}
          </div>
          <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className="dc-filter-select">
            <option value="all">Todas las ciudades</option>
            {allCities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterTipoPago} onChange={e => setFilterTipoPago(e.target.value)} className="dc-filter-select">
            <option value="all">Todos los tipos de pago</option>
            {allTipoPagos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterAge} onChange={e => setFilterAge(e.target.value as AgeFilter)} className="dc-filter-select">
            <option value="all">Todas las edades</option>
            <option value="sinVencer">Sin Vencer</option>
            <option value="1_30">1 - 30 días</option>
            <option value="31_60">31 - 60 días</option>
            <option value="mas60">&gt; 60 días</option>
          </select>
          <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} className="dc-filter-select">
            <option value="all">Todos los niveles</option>
            <option value="alto">🔴 Riesgo Alto (&gt;60d)</option>
            <option value="medio">🟠 Riesgo Medio (31-60d)</option>
            <option value="bajo">🟡 Riesgo Bajo (1-30d)</option>
            <option value="ok">🟢 Sin Riesgo</option>
          </select>
        </div>
        {hasActiveFilters && (
          <button className="dc-clear-filters" onClick={clearFilters}>
            <X size={14} /> Limpiar filtros
          </button>
        )}
      </div>

      {/* Active filter tags */}
      {hasActiveFilters && (
        <div className="dc-active-filters">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: 8 }}>Filtros activos:</span>
          {searchTerm && <span className="dc-filter-tag" onClick={() => setSearchTerm('')}>Búsqueda: "{searchTerm}" <X size={10} /></span>}
          {filterCity !== 'all' && <span className="dc-filter-tag" onClick={() => setFilterCity('all')}>Ciudad: {filterCity} <X size={10} /></span>}
          {filterTipoPago !== 'all' && <span className="dc-filter-tag" onClick={() => setFilterTipoPago('all')}>Tipo: {filterTipoPago} <X size={10} /></span>}
          {filterAge !== 'all' && <span className="dc-filter-tag" onClick={() => setFilterAge('all')}>Edad: {filterAge} <X size={10} /></span>}
          {filterRisk !== 'all' && <span className="dc-filter-tag" onClick={() => setFilterRisk('all')}>Riesgo: {filterRisk} <X size={10} /></span>}
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>
            Mostrando {filteredSummary.length} de {summary.length} clientes
          </span>
        </div>
      )}

      {/* ── KPI Row ── */}
      <div className="dc-kpi-grid">
        <div className="dc-kpi-card" style={{ borderLeft: '4px solid #1565C0', cursor: 'pointer' }} onClick={clearFilters}>
          <div className="dc-kpi-icon" style={{ background: '#E3F2FD', color: '#1565C0' }}><DollarSign size={22} /></div>
          <div className="dc-kpi-info">
            <span className="dc-kpi-label">Cartera Total</span>
            <span className="dc-kpi-value">{fmtMoneyShort(totalCartera)}</span>
            <span className="dc-kpi-sub">{totalFacturas} documentos · {totalClientes} clientes</span>
          </div>
        </div>
        <div className="dc-kpi-card" style={{ borderLeft: '4px solid #22c55e', cursor: 'pointer' }} onClick={() => setFilterAge(filterAge === 'sinVencer' ? 'all' : 'sinVencer')}>
          <div className="dc-kpi-icon" style={{ background: '#E8F5E9', color: '#2E7D32' }}><Clock size={22} /></div>
          <div className="dc-kpi-info">
            <span className="dc-kpi-label">Sin Vencer</span>
            <span className="dc-kpi-value">{fmtMoneyShort(totalSinVencer)}</span>
            <span className="dc-kpi-sub">{totalCartera > 0 ? ((totalSinVencer / totalCartera) * 100).toFixed(1) : 0}% del total</span>
          </div>
        </div>
        <div className="dc-kpi-card" style={{ borderLeft: '4px solid #ef4444', cursor: 'pointer' }} onClick={() => setFilterAge(filterAge === 'mas60' ? 'all' : 'mas60')}>
          <div className="dc-kpi-icon" style={{ background: '#FFEBEE', color: '#C62828' }}><AlertTriangle size={22} /></div>
          <div className="dc-kpi-info">
            <span className="dc-kpi-label">Cartera Vencida</span>
            <span className="dc-kpi-value">{fmtMoneyShort(totalVencido)}</span>
            <span className="dc-kpi-sub">{pctVencido}% del total</span>
          </div>
        </div>
        <div className="dc-kpi-card" style={{ borderLeft: '4px solid #6A1B9A', cursor: 'pointer' }} onClick={() => setFilterRisk(filterRisk === 'alto' ? 'all' : 'alto')}>
          <div className="dc-kpi-icon" style={{ background: '#F3E5F5', color: '#6A1B9A' }}><Users size={22} /></div>
          <div className="dc-kpi-info">
            <span className="dc-kpi-label">Clientes con Deuda</span>
            <span className="dc-kpi-value">{totalClientes}</span>
            <span className="dc-kpi-sub" style={{ color: '#C62828' }}>{clientesAltoRiesgo} en riesgo (&gt;60d)</span>
          </div>
        </div>
      </div>

      {/* ── Alert for high risk ── */}
      {totalRangoMas60 > 0 && (
        <div className="dc-alert-bar">
          <AlertTriangle size={18} />
          <span>
            <strong>{fmtMoney(totalRangoMas60)}</strong> en cartera con más de 60 días de vencimiento
            ({clientesAltoRiesgo} cliente{clientesAltoRiesgo !== 1 ? 's' : ''}).
            <button className="dc-alert-action" onClick={() => setFilterRisk('alto')}>Ver clientes →</button>
          </span>
        </div>
      )}

      {/* ── Charts Row 1: Aging (clickable) + City Pie (clickable) ── */}
      <div className="charts-grid" style={{ marginBottom: 20 }}>
        <div className="chart-card">
          <div className="chart-title">
            <Clock size={16} style={{ marginRight: 6, color: '#f59e0b' }} /> Cartera por Edades
            <span className="chart-hint">Click en una barra para filtrar</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={ageData} layout="vertical" onClick={handleAgeBarClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" fontSize={11} stroke="#94a3b8" tickFormatter={v => fmtMoneyShort(v)} />
              <YAxis type="category" dataKey="name" fontSize={11} stroke="#94a3b8" width={100} />
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => fmtMoney(Number(val))} />
              <Bar dataKey="value" name="Cartera" radius={[0, 6, 6, 0]}>
                {ageData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} opacity={filterAge === 'all' || filterAge === entry.key ? 1 : 0.3}
                    stroke={filterAge === entry.key ? '#000' : 'none'} strokeWidth={filterAge === entry.key ? 2 : 0} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">
            <Users size={16} style={{ marginRight: 6, color: '#6A1B9A' }} /> Distribución de Uso de Cupo
            <span className="chart-hint">Clientes por nivel de utilización</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={usoCupoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
              <YAxis fontSize={11} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => [`${val} clientes`, 'Cantidad']} />
              <Bar dataKey="count" name="Clientes" radius={[6, 6, 0, 0]}>
                {usoCupoData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Charts Row 2: Top 10 Clients (stacked: sin vencer vs vencido) ── */}
      <div className="charts-grid" style={{ marginBottom: 20 }}>
        <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
          <div className="chart-title">
            <TrendingUp size={16} style={{ marginRight: 6, color: '#1565C0' }} /> Top 10 Clientes con Mayor Deuda
            <span className="chart-hint">Click en una barra para buscar el cliente</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={top10Clientes} layout="vertical" onClick={handleClienteBarClick} style={{ cursor: 'pointer' }}>
              <defs>
                <linearGradient id="deudaGradOk" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22c55e" /><stop offset="100%" stopColor="#4ade80" />
                </linearGradient>
                <linearGradient id="deudaGradVenc" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ef4444" /><stop offset="100%" stopColor="#f87171" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" fontSize={11} stroke="#94a3b8" tickFormatter={v => fmtMoneyShort(v)} />
              <YAxis type="category" dataKey="name" fontSize={10} stroke="#94a3b8" width={200} />
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any, name: any) => [fmtMoney(Number(val)), name]} />
              <Bar dataKey="sinVencer" name="Sin Vencer" stackId="a" fill="url(#deudaGradOk)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="vencido" name="Vencido" stackId="a" fill="url(#deudaGradVenc)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Tipo de Pago Summary (clickable) ── */}
      <div className="dc-tipopago-grid" style={{ marginBottom: 20 }}>
        {Array.from(tipoPagoMap.entries()).map(([tp, data], i) => (
          <div key={tp} className={`dc-tipopago-card ${filterTipoPago === tp ? 'active' : ''}`}
            onClick={() => setFilterTipoPago(prev => prev === tp ? 'all' : tp)}
            style={{ cursor: 'pointer' }}
          >
            <div className="dc-tipopago-header" style={{ borderBottom: `2px solid ${COLORS_TIPOPAGO[i % COLORS_TIPOPAGO.length]}` }}>
              <span className="dc-tipopago-name">{tp}</span>
              <span className="dc-tipopago-count">{data.count} clientes</span>
            </div>
            <div className="dc-tipopago-value">{fmtMoneyShort(data.deuda)}</div>
          </div>
        ))}
      </div>

      {/* ── Detail Table ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Table2 size={16} style={{ marginRight: 6 }} />Detalle por Cliente ({filteredSummary.length})</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="data-table-wrapper" style={{ maxHeight: 'calc(100vh - 420px)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Ciudad</th>
                  <th>Tipo Pago</th>
                  <th style={{ textAlign: 'right' }}>Límite Crédito</th>
                  <th style={{ textAlign: 'right' }}>Total Deuda</th>
                  <th style={{ textAlign: 'center' }}>Uso Cupo</th>
                  <th style={{ textAlign: 'right' }}>Docs</th>
                  <th style={{ textAlign: 'right' }}>Max Demora</th>
                  <th style={{ textAlign: 'right' }}>Sin Vencer</th>
                  <th style={{ textAlign: 'right' }}>1-30d</th>
                  <th style={{ textAlign: 'right' }}>31-60d</th>
                  <th style={{ textAlign: 'right' }}>&gt;60d</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummary.length === 0 ? (
                  <tr><td colSpan={13} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    No hay clientes que coincidan con los filtros aplicados
                  </td></tr>
                ) : filteredSummary.map(c => {
                  const riskLevel = c.rangoMas60 > 0 ? 'alto' : c.rango31_60 > 0 ? 'medio' : c.rango1_30 > 0 ? 'bajo' : 'ok';
                  return (
                    <tr key={c.deudor} className={`dc-row-${riskLevel}`}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.deudor}</td>
                      <td style={{ fontSize: '0.82rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</td>
                      <td>
                        <span className="dc-city-link" onClick={() => setFilterCity(prev => prev === c.poblacion ? 'all' : c.poblacion)}>
                          {c.poblacion}
                        </span>
                      </td>
                      <td>
                        <span className={`dc-tipo-badge ${c.tipoPago.includes('Contado') || c.tipoPago.includes('contado') ? 'contado' : 'credito'}`}
                          onClick={() => setFilterTipoPago(prev => prev === c.tipoPago ? 'all' : c.tipoPago)} style={{ cursor: 'pointer' }}>
                          {c.tipoPago.length > 18 ? c.tipoPago.substring(0, 16) + '…' : c.tipoPago}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.82rem' }}>{c.limiteCredito > 0 ? fmtMoney(c.limiteCredito) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.88rem' }}>{fmtMoney(c.totalDeuda)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {c.usoCupo < 999 ? (
                          <div className="dc-uso-bar-wrap">
                            <div className="dc-uso-bar" style={{
                              width: `${Math.min(c.usoCupo, 100)}%`,
                              background: c.usoCupo > 100 ? '#ef4444' : c.usoCupo > 80 ? '#f59e0b' : '#22c55e',
                            }} />
                            <span className="dc-uso-label">{c.usoCupo}%</span>
                          </div>
                        ) : (
                          <span style={{ color: '#ef4444', fontSize: '0.72rem', fontWeight: 700 }}>SIN CUPO</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{c.facturas}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: c.maxDemora > 60 ? '#C62828' : c.maxDemora > 30 ? '#E65100' : c.maxDemora > 0 ? '#F57F17' : 'var(--text-muted)' }}>
                        {c.maxDemora > 0 ? `${c.maxDemora}d` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.82rem', color: '#2E7D32' }}>{c.sinVencer > 0 ? fmtMoney(c.sinVencer) : '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: '0.82rem', color: '#F57F17' }}>{c.rango1_30 > 0 ? fmtMoney(c.rango1_30) : '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: '0.82rem', color: '#E65100' }}>{c.rango31_60 > 0 ? fmtMoney(c.rango31_60) : '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 700, color: '#C62828' }}>{c.rangoMas60 > 0 ? fmtMoney(c.rangoMas60) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helper: Excel serial dates → string ── */
function excelDateToStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400000);
    return d.toISOString().split('T')[0];
  }
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val);
}
