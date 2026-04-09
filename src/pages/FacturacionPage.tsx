import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { ClipboardList, ShieldCheck, FileCheck, History, BarChart3 } from 'lucide-react';
import supabase from '../lib/supabase';
import CreacionPedido from './facturacion/CreacionPedido';
import CarteraLiberacion from './facturacion/CarteraLiberacion';
import AsignacionFactura from './facturacion/AsignacionFactura';
import HistoricoFacturacion from './facturacion/HistoricoFacturacion';
import DashboardCartera from './facturacion/DashboardCartera';
import Toast from '../components/Toast';
import { usePermissions, FacturacionTab } from '../lib/permissions';
import '../styles/facturacion.css';

const TABS = [
  { id: 'pedido', label: 'Creación de Pedido', icon: ClipboardList },
  { id: 'cartera', label: 'Cartera / Liberación', icon: ShieldCheck },
  { id: 'factura', label: 'Asignación de Factura', icon: FileCheck },
  { id: 'historico', label: 'Histórico', icon: History },
  { id: 'dashboard_cartera', label: 'Dashboard Cartera', icon: BarChart3 },
];

export default function FacturacionPage() {
  const { canView, roleData, userRole } = usePermissions('facturacion');
  
  const isAdmin = userRole === 'Administrador';

  // Determine allowed tabs to view
  const allowedViewTabs = isAdmin ? TABS.map(t => t.id) : (roleData?.facturacion?.canViewTabs || []);
  const allowedEditTabs = isAdmin ? TABS.map(t => t.id) : (roleData?.facturacion?.canEditTabs || []);

  const visibleTabs = TABS.filter(tab => allowedViewTabs.includes(tab.id as FacturacionTab));

  const [activeTab, setActiveTab] = useState(visibleTabs.length > 0 ? visibleTabs[0].id : '');
  const [kpis, setKpis] = useState({
    pendientes: 0,
    enCartera: 0,
    liberados: 0,
    facturados: 0,
  });

  const loadKpis = useCallback(async () => {
    try {
      const [
        { count: pendientes },
        { count: enCartera },
        { count: liberados },
        { count: facturados },
      ] = await Promise.all([
        supabase.from('pedidos').select('*', { count: 'exact', head: true })
          .in('estado', ['PENDIENTE PAGO', 'PENDIENTE PV', 'VERIFICAR PEDIDO']),
        supabase.from('pedidos').select('*', { count: 'exact', head: true })
          .eq('estado', 'PENDIENTE LIBERACIÓN'),
        supabase.from('pedidos').select('*', { count: 'exact', head: true })
          .eq('estado', 'LIBERADO'),
        supabase.from('facturas').select('*', { count: 'exact', head: true })
          .eq('estado', 'FACTURADA'),
      ]);
      setKpis({
        pendientes: pendientes || 0,
        enCartera: enCartera || 0,
        liberados: liberados || 0,
        facturados: facturados || 0,
      });
    } catch (e) {
      console.error('KPI load error', e);
    }
  }, []);

  useEffect(() => {
    if (canView) {
      loadKpis();
    }
  }, [loadKpis, canView]);

  if (!canView) return <Navigate to="/" replace />;
  if (visibleTabs.length === 0) return <div style={{ padding: 40, textAlign: 'center' }}>No tienes permiso para ver ninguna pestaña de facturación.</div>;

  // Refresh KPIs when actions happen in sub-modules
  const handleRefreshKpis = useCallback(() => {
    loadKpis();
  }, [loadKpis]);

  return (
    <div>
      {/* KPI Strip */}
      <div className="fact-kpi-strip">
        {allowedViewTabs.includes('pedido') && (
          <div className="fact-kpi" onClick={() => setActiveTab('pedido')} style={{ cursor: 'pointer' }}>
            <div className="fact-kpi-icon pendiente"><ClipboardList size={20} /></div>
            <div className="fact-kpi-info">
              <span className="fact-kpi-label">Pedidos Pendientes</span>
              <span className="fact-kpi-value">{kpis.pendientes}</span>
            </div>
          </div>
        )}
        {allowedViewTabs.includes('cartera') && (
          <div className="fact-kpi" onClick={() => setActiveTab('cartera')} style={{ cursor: 'pointer' }}>
            <div className="fact-kpi-icon cartera"><ShieldCheck size={20} /></div>
            <div className="fact-kpi-info">
              <span className="fact-kpi-label">En Cartera</span>
              <span className="fact-kpi-value">{kpis.enCartera}</span>
            </div>
          </div>
        )}
        {allowedViewTabs.includes('factura') && (
          <div className="fact-kpi" onClick={() => setActiveTab('factura')} style={{ cursor: 'pointer' }}>
            <div className="fact-kpi-icon liberado"><FileCheck size={20} /></div>
            <div className="fact-kpi-info">
              <span className="fact-kpi-label">Liberados</span>
              <span className="fact-kpi-value">{kpis.liberados}</span>
            </div>
          </div>
        )}
        {allowedViewTabs.includes('historico') && (
          <div className="fact-kpi" onClick={() => setActiveTab('historico')} style={{ cursor: 'pointer' }}>
            <div className="fact-kpi-icon facturado"><History size={20} /></div>
            <div className="fact-kpi-info">
              <span className="fact-kpi-label">Facturas Activas</span>
              <span className="fact-kpi-value">{kpis.facturados}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="fact-tabs">
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          const badge = tab.id === 'cartera' ? kpis.enCartera
            : tab.id === 'factura' ? kpis.liberados
            : tab.id === 'historico' ? kpis.facturados
            : tab.id === 'pedido' ? kpis.pendientes
            : 0;
          return (
            <button
              key={tab.id}
              className={`fact-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
              {badge > 0 && <span className="tab-badge">{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {/* We pass isAdmin backward-compatible, and specifically pass canEdit for local permission checking */}
      {activeTab === 'pedido' && <CreacionPedido onRefreshKpis={handleRefreshKpis} isAdmin={isAdmin} canEdit={allowedEditTabs.includes('pedido')} />}
      {activeTab === 'cartera' && <CarteraLiberacion onRefreshKpis={handleRefreshKpis} isAdmin={isAdmin} canEdit={allowedEditTabs.includes('cartera')} />}
      {activeTab === 'factura' && <AsignacionFactura onRefreshKpis={handleRefreshKpis} isAdmin={isAdmin} canEdit={allowedEditTabs.includes('factura')} />}
      {activeTab === 'historico' && <HistoricoFacturacion onRefreshKpis={handleRefreshKpis} isAdmin={isAdmin} canEdit={allowedEditTabs.includes('historico')} />}
      {activeTab === 'dashboard_cartera' && <DashboardCartera />}

      <Toast />
    </div>
  );
}
