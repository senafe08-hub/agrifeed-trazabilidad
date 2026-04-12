import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import supabase from './lib/supabase';

const HARDCODED_USERS: Record<string, { role: string, password?: string }> = {
  'produccion@agrifeed.com': { role: 'Auxiliar de Producción', password: 'agrifeed_produccion' },
  'costos@agrifeed.com': { role: 'Analista de Costos', password: 'agrifeed_costos' },
  'supervisor@agrifeed.com': { role: 'Supervisor Producción', password: 'agrifeed_supervisor' },
  'logistica@agrifeed.com': { role: 'Auxiliar Logística', password: 'agrifeed_logistica' },
  'admin_aux@agrifeed.com': { role: 'Auxiliar Administrativa', password: 'agrifeed_admin_aux' },
  'coordinador@agrifeed.com': { role: 'Coordinador Administrativo', password: 'agrifeed_coord' },
  'piciz@agrifeed.com': { role: 'Coordinador PICIZ', password: 'agrifeed_piciz' },
  'gerencia@agrifeed.com': { role: 'Gerencia', password: 'agrifeed_gerencia' },
  'cartera@agrifeed.com': { role: 'Analista de Cartera', password: 'agrifeed_cartera' },
  'admin@agrifeed.com': { role: 'Administrador', password: 'Agrifeed.08' },
};

function App() {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState('Administrador');
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // For demo mode: skip auth if Supabase isn't configured
  const isDemoMode = !import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL === 'https://YOUR_PROJECT.supabase.co';

  useEffect(() => {
    // 1. Revisa si hay un usuario local primero (HARDCODED)
    const localUserEmail = localStorage.getItem('localUserEmail');
    if (localUserEmail && HARDCODED_USERS[localUserEmail]) {
      setUser({ email: localUserEmail });
      setUserRole(HARDCODED_USERS[localUserEmail].role);
      setLoading(false);
      return;
    }

    if (isDemoMode) {
      setLoading(false);
      return;
    }

    // 2. Si no hay localUser, verifica la sesión de Supabase (para administradores)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sbUser = session?.user ?? null;
      setUser(sbUser);
      if (sbUser?.email && !localStorage.getItem('localUserEmail')) {
         setUserRole(HARDCODED_USERS[sbUser.email.toLowerCase()]?.role || 'Administrador');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!localStorage.getItem('localUserEmail')) {
        const sbUser = session?.user ?? null;
        setUser(sbUser);
        if (sbUser?.email) {
           setUserRole(HARDCODED_USERS[sbUser.email.toLowerCase()]?.role || 'Administrador');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [isDemoMode]);

  const handleLogin = async (email: string, password: string) => {
    setLoginError(null);
    setLoginLoading(true);

    const emailKey = email.toLowerCase();
    
    // 1. Verificamos si es uno de los usuarios del sistema sin supabase
    if (HARDCODED_USERS[emailKey]) {
      if (HARDCODED_USERS[emailKey].password === password) {
        localStorage.setItem('localUserEmail', emailKey);
        setUser({ email: emailKey });
        setUserRole(HARDCODED_USERS[emailKey].role);
        setLoginLoading(false);
        return;
      } else {
        setLoginError('Contraseña incorrecta para el usuario del sistema.');
        setLoginLoading(false);
        return;
      }
    }

    // 2. Si no esta en HARDCODED_USERS, intenta loguear con Supabase (admin o usuarios reales)
    if (isDemoMode) {
      setLoginError('El usuario ingresado no existe en el sistema local y Supabase no está configurado.');
      setLoginLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoginError(error.message === 'Invalid login credentials'
          ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
          : error.message);
      } else if (data.session) {
        localStorage.removeItem('localUserEmail');
      }
    } catch (err) {
      setLoginError('Error de conexión. Intentalo de nuevo.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    const localUser = localStorage.getItem('localUserEmail');
    if (localUser) {
      localStorage.removeItem('localUserEmail');
      setUser(null);
      return;
    }
    
    if (isDemoMode) {
      setUser(null);
      return;
    }

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

  if (!user) {
    return <LoginPage onLogin={handleLogin} error={loginError} loading={loginLoading} />;
  }

  return (
    <BrowserRouter>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
