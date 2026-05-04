import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart2, 
  Calendar, 
  Factory, 
  Truck, 
  Receipt, 
  Search, 
  Database,
  Briefcase
} from 'lucide-react';
import { ROLE_PERMISSIONS } from '../lib/permissions';


interface ModuleSelectionScreenProps {
  onSelect: () => void;
  userRole: string;
}

export function ModuleSelectionScreen({ onSelect, userRole }: ModuleSelectionScreenProps) {
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);

  // We can use the permissions hook here, or just filter based on userRole if needed.
  // We'll show all and let the permissions handle it, or filter here. 
  // For simplicity, we just check permissions.
  // Note: we can't easily iterate all rules, so we'll just check specific ones.
  // Actually, usePermissions is a hook that checks specific modules.
  // It's better to just render the ones that are likely accessible or check them individually.

  const allModules = [
    { id: 'dashboard', path: '/', name: 'Dashboard', icon: BarChart2, color: '#f59e0b', desc: 'KPIs y Analítica' },
    { id: 'ventas', path: '/ventas', name: 'Ventas', icon: Briefcase, color: '#0ea5e9', desc: 'Gestión Comercial' },
    { id: 'programacion', path: '/programacion', name: 'Programación', icon: Calendar, color: '#d97706', desc: 'Planificación de Lotes' },
    { id: 'produccion', path: '/produccion', name: 'Producción', icon: Factory, color: '#22c55e', desc: 'Control de Planta' },
    { id: 'despachos', path: '/despachos', name: 'Despachos', icon: Truck, color: '#3b82f6', desc: 'Logística y Entregas' },
    { id: 'facturacion', path: '/facturacion', name: 'Facturación', icon: Receipt, color: '#8b5cf6', desc: 'Generación y PICIZ' },
    { id: 'trazabilidad', path: '/trazabilidad', name: 'Trazabilidad', icon: Search, color: '#ef4444', desc: 'Seguimiento Total' },
    { id: 'maestro', path: '/maestro', name: 'Maestro', icon: Database, color: '#64748b', desc: 'Bases de Datos' },
  ];

  const roleData = ROLE_PERMISSIONS[userRole] || { canView: [] };
  const isRoleAdmin = userRole === 'Administrador';

  const modules = allModules.filter(mod => isRoleAdmin || roleData.canView.includes(mod.id as never));

  const handleSelect = (path: string) => {
    setIsExiting(true);
    setTimeout(() => {
      navigate(path);
      onSelect();
    }, 400);
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      backgroundColor: 'var(--bg-app)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 20px',
      boxSizing: 'border-box',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 999999,
      overflowY: 'auto',
      animation: isExiting ? 'fadeOut 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'none'
    }}>
      <div style={{
        maxWidth: 1000,
        width: '100%',
        animation: isExiting ? 'none' : 'fadeIn 0.6s ease'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--green-900)', marginBottom: 12 }}>
            ¿A qué módulo deseas ingresar?
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            Selecciona tu área de trabajo para continuar ({userRole})
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 20
        }}>
          {modules.map((mod, i) => (
            <button
              key={mod.id}
              onClick={() => handleSelect(mod.path)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 16,
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: 'var(--shadow-sm)',
                animation: `slideUpFade 0.5s ease ${i * 0.05}s both`,
                textAlign: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-6px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                e.currentTarget.style.borderColor = mod.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
              }}
            >
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: `${mod.color}15`,
                color: mod.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 4
              }}>
                <mod.icon size={28} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {mod.name}
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {mod.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
