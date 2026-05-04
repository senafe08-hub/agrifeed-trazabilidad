import { useEffect } from 'react';

interface WelcomeScreenProps {
  onFinish: () => void;
}

export function WelcomeScreen({ onFinish }: WelcomeScreenProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1b5e20, #2e7d32, #4caf50)',
      color: 'white',
      animation: 'fadeIn 0.5s ease',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 999999,
    }}>
      <div style={{
        width: 110,
        height: 110,
        borderRadius: 24,
        background: 'rgba(255, 255, 255, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        animation: 'slideUpFade 0.8s ease',
        padding: 12
      }}>
        <img src="/logo-agrifeed.png" alt="Agrifeed Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <h1 style={{ 
        fontSize: '2.5rem', 
        fontWeight: 800, 
        margin: 0,
        textShadow: '0 2px 10px rgba(0,0,0,0.2)',
        animation: 'slideUpFade 0.8s ease 0.1s both'
      }}>
        Agrifeed Trazabilidad
      </h1>
      <p style={{ 
        fontSize: '1.1rem', 
        opacity: 0.9, 
        marginTop: 12,
        animation: 'slideUpFade 0.8s ease 0.2s both'
      }}>
        Bienvenido al sistema
      </p>
    </div>
  );
}
