import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import AppLayout from './components/layout/AppLayout';
import UpdateChecker from './components/UpdateChecker';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MaestroPage from './pages/MaestroPage';
import ProgramacionPage from './pages/ProgramacionPage';
import ProduccionPage from './pages/ProduccionPage';
import DespachosPage from './pages/DespachosPage';
import FacturacionPage from './pages/FacturacionPage';
import TrazabilidadPage from './pages/TrazabilidadPage';
import AdminPage from './pages/AdminPage';
import VentasPage from './pages/VentasPage';
import supabase from './lib/supabase';

// Mapeo de pseudo-correos a roles (temporal, lo ideal es guardarlo en una tabla 'roles_usuario' en Supabase)
const ROLE_MAPPING: Record<string, string> = {
  'produccion@agrifeed.local': 'Auxiliar de Producción',
  'costos@agrifeed.local': 'Analista de Costos',
  'supervisor@agrifeed.local': 'Supervisor Producción',
  'logistica@agrifeed.local': 'Auxiliar Logística',
  'admin_aux@agrifeed.local': 'Auxiliar Administrativa',
  'coordinador@agrifeed.local': 'Coordinador Administrativo',
  'piciz@agrifeed.local': 'Coordinador PICIZ',
  'gerencia@agrifeed.local': 'Gerencia',
  'cartera@agrifeed.local': 'Analista de Cartera',
  'admin@agrifeed.local': 'Administrador',
  'ventas@agrifeed.local': 'Representante Ventas',
};

function App() {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState('Administrador');
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // For demo mode: skip auth if Supabase isn't configured
  const isDemoMode = !import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL === 'https://YOUR_PROJECT.supabase.co';

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // Verificar la sesión de Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sbUser = session?.user ?? null;
      setUser(sbUser);
      if (sbUser?.email) {
         setUserRole(ROLE_MAPPING[sbUser.email.toLowerCase()] || 'Administrador');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const sbUser = session?.user ?? null;
      setUser(sbUser);
      if (sbUser?.email) {
         setUserRole(ROLE_MAPPING[sbUser.email.toLowerCase()] || 'Administrador');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (username: string, password: string) => {
    setLoginError(null);
    setLoginLoading(true);

    if (isDemoMode) {
      setLoginError('El sistema requiere conexión a Supabase.');
      setLoginLoading(false);
      return;
    }

    if (!navigator.onLine) {
      setLoginError('No hay conexión a internet. Revisa tu red e intenta nuevamente.');
      setLoginLoading(false);
      return;
    }

    // Convertir el nombre de usuario a pseudo-correo para Supabase
    const emailKey = username.includes('@') ? username.toLowerCase() : `${username.toLowerCase()}@agrifeed.local`;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: emailKey, password });
      if (error) {
        setLoginError(error.message === 'Invalid login credentials'
          ? 'Credenciales incorrectas. Verifica tu usuario y contraseña.'
          : error.message);
      }
    } catch (err) {
      setLoginError('Error de red. Asegúrate de tener conexión a internet.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{
          width: 60,
          height: 60,
          borderRadius: 16,
          background: 'linear-gradient(135deg, #66BB6A, #2E7D32)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '1.8rem',
          color: 'white',
          animation: 'fadeIn 0.5s ease',
        }}>
          A
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Cargando...</span>
      </div>
    );
  }

  const offlineBanner = isOffline && (
    <div style={{
      backgroundColor: '#F44336',
      color: 'white',
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      fontWeight: 600,
      fontSize: '0.9rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
    }}>
      <WifiOff size={18} />
      Estás navegando sin conexión a internet. El inicio de sesión y sincronización están desactivados.
    </div>
  );

  if (!user) {
    return (
      <>
        {offlineBanner}
        <LoginPage onLogin={handleLogin} error={loginError} loading={loginLoading} />
      </>
    );
  }

  return (
    <BrowserRouter>
      {offlineBanner}
      <UpdateChecker />
      <Routes>
        <Route element={<AppLayout userEmail={user.email || ''} userRole={userRole} onLogout={handleLogout} />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/maestro" element={<MaestroPage />} />
          <Route path="/programacion" element={<ProgramacionPage />} />
          <Route path="/produccion" element={<ProduccionPage isAdmin={userRole === 'admin' || userRole === 'Administrador'} />} />
          <Route path="/despachos" element={<DespachosPage />} />
          <Route path="/facturacion" element={<FacturacionPage />} />
          <Route path="/trazabilidad" element={<TrazabilidadPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/ventas" element={<VentasPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
