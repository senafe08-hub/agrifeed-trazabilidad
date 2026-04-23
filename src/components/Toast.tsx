import React, { useState, useEffect } from 'react';

type ToastMessage = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  createdAt: number;
};

let nextId = 0;
const listeners: ((toasts: ToastMessage[]) => void)[] = [];

function addToast(message: string, type: ToastMessage['type']) {
  const toast: ToastMessage = { id: ++nextId, message, type, createdAt: Date.now() };
  listeners.forEach(l => l([toast]));
}

export const toast = {
  success(msg: string) { addToast(msg, 'success'); },
  error(msg: string) { addToast(msg, 'error'); },
  info(msg: string) { addToast(msg, 'info'); },
};

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  right: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  zIndex: 999999,
  maxWidth: 480,
  pointerEvents: 'none',
};

const baseToastStyle: React.CSSProperties = {
  padding: '14px 22px',
  borderRadius: 10,
  color: '#fff',
  fontSize: '0.92rem',
  fontWeight: 500,
  boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
  pointerEvents: 'auto',
  animation: 'toast-slide-in 0.35s ease-out',
  lineHeight: 1.45,
};

const typeColors: Record<string, string> = {
  success: '#2e7d32',
  error: '#c62828',
  info: '#1565c0',
};

const Toast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (newToasts: ToastMessage[]) => {
      setToasts(prev => [...prev, ...newToasts]);
    };
    listeners.push(handler);
    return () => {
      const idx = listeners.indexOf(handler);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);

  // Remove toast after 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setToasts(prev => prev.filter(t => now - t.createdAt < 5000));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Inject keyframes once
  useEffect(() => {
    if (document.getElementById('toast-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'toast-keyframes';
    style.textContent = `
      @keyframes toast-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={containerStyle}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            ...baseToastStyle,
            background: typeColors[t.type] || typeColors.info,
          }}
        >
          {t.type === 'error' && '⛔ '}
          {t.type === 'success' && '✅ '}
          {t.type === 'info' && 'ℹ️ '}
          {t.message}
        </div>
      ))}
    </div>
  );
};

export default Toast;
