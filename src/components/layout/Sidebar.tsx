import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  Calendar,
  Factory,
  Truck,
  Receipt,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Menu
} from 'lucide-react';
import { ROLE_PERMISSIONS } from '../../lib/permissions';

const navItems = [

  {
    section: 'Operaciones',
    items: [
      { path: '/maestro', label: 'Maestro de Datos', icon: Database },
      { path: '/programacion', label: 'Programación', icon: Calendar },
      { path: '/produccion', label: 'Producción', icon: Factory },
      { path: '/despachos', label: 'Logística', icon: Truck },
      { path: '/facturacion', label: 'Facturación', icon: Receipt },
    ],
  },
  {
    section: 'Análisis',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/trazabilidad', label: 'Trazabilidad', icon: BarChart3 },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { path: '/admin', label: 'Administración', icon: Settings },
    ],
  },
];

interface SidebarProps {
  userEmail: string;
  userRole: string;
  onLogout: () => void;
}

export default function Sidebar({ userEmail, userRole, onLogout }: SidebarProps) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const getInitials = (email: string) => {
    const name = email.split('@')[0];
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <button
        className="sidebar-toggle"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
      >
        {isCollapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className="sidebar-brand">
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'linear-gradient(135deg, #66BB6A, #2E7D32)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '1.2rem',
          color: 'white',
        }}>
          A
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">Agrifeed</span>
          <span className="sidebar-brand-subtitle">Trazabilidad</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((section) => {
          const roleData = ROLE_PERMISSIONS[userRole] || { canView: [] };
          const isRoleAdmin = userRole === 'Administrador';

          const filteredItems = section.items.filter(item => {
            const moduleName = item.path === '/' ? 'dashboard' : item.path.substring(1);
            return isRoleAdmin || roleData.canView.includes(moduleName as any);
          });

          if (filteredItems.length === 0) return null;

          return (
            <div key={section.section}>
              <div className="sidebar-section-label">{section.section}</div>
              {filteredItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive && location.pathname === item.path ? 'active' : ''}`
                  }
                  end={item.path === '/'}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                  {location.pathname === item.path && <ChevronRight size={16} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-avatar">
          {getInitials(userEmail)}
        </div>
        <div className="sidebar-user-info" style={{ flex: 1 }}>
          <span className="sidebar-user-name">{userEmail.split('@')[0]}</span>
          <span className="sidebar-user-role">{userRole}</span>
        </div>
        <button
          onClick={onLogout}
          className="btn-icon btn-icon-logout"
          style={{ color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', cursor: 'pointer' }}
          title="Cerrar sesión"
        >
          <LogOut size={18} />
        </button>
      </div>
      <div className="version-text" style={{
        padding: '8px 20px 12px',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: '#10b981',
        letterSpacing: '0.05em',
        fontWeight: 'bold',
        whiteSpace: 'nowrap'
      }}>
        Agrifeed v0.2.5 🚀
      </div>
    </aside>
  );
}
