import { Outlet, useLocation } from 'react-router-dom';
import { version as appVersion } from '../../../package.json';
import Sidebar from './Sidebar';

interface AppLayoutProps {
  userEmail: string;
  userRole: string;
  onLogout: () => void;
}

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/maestro': 'Maestro de Datos',
  '/programacion': 'Programación Producción',
  '/produccion': 'Producción & Entrega',
  '/despachos': 'Módulo de Logística',
  '/facturacion': 'Facturación',
  '/trazabilidad': 'Trazabilidad',
  '/admin': 'Administración',
  '/ventas': 'Ventas',
};

export default function AppLayout({ userEmail, userRole, onLogout }: AppLayoutProps) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Agrifeed';

  return (
    <div className="app-layout">
      <Sidebar userEmail={userEmail} userRole={userRole} onLogout={onLogout} />
      <div className="main-content">
        <header className="header">
          <h1 className="header-title">{title}</h1>
          <div className="header-actions">
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              v{appVersion}
            </span>
          </div>
        </header>
        <main className="page-content">
          <Outlet context={{ userRole, userEmail }} />
        </main>
      </div>
    </div>
  );
}
