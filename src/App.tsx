import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
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
import { WelcomeScreen } from './components/WelcomeFlow';
import { ModuleSelectionScreen } from './components/ModuleSelectionScreen';
import Toast from './components/Toast';

// El mapeo de roles ahora se obtiene desde la base de datos (tabla: usuarios_roles)

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState('Administrador');
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [loginFlowStage, setLoginFlowStage] = useState<'none' | 'welcome' | 'selection'>('none');

  // El modo demo ha sido removido. La app siempre se conectará a Supabase en producción.

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
    const fetchRole = async (email: string) => {
      try {
        const { data, error } = await supabase.from('usuarios_roles').select('rol').eq('email', email).single();
        if (!error && data?.rol) {
          setUserRole(data.rol);
        } else {
          setUserRole('Desconocido');
        }
      } catch (e) {
        setUserRole('Desconocido');
      }
    };

    // Verificar la sesión de Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sbUser = session?.user ?? null;
      setUser(sbUser);
      if (sbUser?.email) {
         fetchRole(sbUser.email.toLowerCase());
         localStorage.setItem('localUserEmail', sbUser.email.toLowerCase());
      } else {
         localStorage.removeItem('localUserEmail');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const sbUser = session?.user ?? null;
      setUser(sbUser);
      if (sbUser?.email) {
         fetchRole(sbUser.email.toLowerCase());
         localStorage.setItem('localUserEmail', sbUser.email.toLowerCase());
      } else {
         localStorage.removeItem('localUserEmail');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (username: string, password: string) => {
    setLoginError(null);
    setLoginLoading(true);

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
      } else {
        setLoginFlowStage('welcome');
      }
    } catch (err) {
      setLoginError('Error de red. Asegúrate de tener conexión a internet.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('localUserEmail');
    setUser(null);
  };

  // Auto-logout por inactividad (15 minutos)
  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout;
    
    const resetTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (user) {
        inactivityTimer = setTimeout(() => {
          handleLogout();
          setLoginError('Tu sesión expiró por inactividad. Por seguridad, te hemos desconectado.');
        }, 15 * 60 * 1000);
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    if (user) {
      events.forEach(e => document.addEventListener(e, resetTimer));
      resetTimer();
    }

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      events.forEach(e => document.removeEventListener(e, resetTimer));
    };
  }, [user]);

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
      <Toast />
      
      {loginFlowStage === 'welcome' ? (
        <WelcomeScreen onFinish={() => setLoginFlowStage('selection')} />
      ) : loginFlowStage === 'selection' ? (
        <ModuleSelectionScreen onSelect={() => setLoginFlowStage('none')} userRole={userRole} />
      ) : (
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
      )}
    </BrowserRouter>
  );
}

export default App;
