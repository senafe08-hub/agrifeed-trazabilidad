import React, { useState, useEffect } from 'react';

type ToastMessage = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
};

let nextId = 0;
const listeners: ((toasts: ToastMessage[]) => void)[] = [];

function addToast(message: string, type: ToastMessage['type']) {
  const toast: ToastMessage = { id: ++nextId, message, type };
  listeners.forEach(l => l([toast]));
}

export const toast = {
  success(msg: string) { addToast(msg, 'success'); },
  error(msg: string) { addToast(msg, 'error'); },
  info(msg: string) { addToast(msg, 'info'); },
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

  // Remove toast after 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setToasts(prev => prev.filter(t => Date.now() - t.id * 1000 < 3000));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-2 rounded shadow text-white ${
            t.type === 'success'
              ? 'bg-green-600'
              : t.type === 'error'
              ? 'bg-red-600'
              : 'bg-blue-600'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
};

export default Toast;
