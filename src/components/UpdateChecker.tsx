import { useState, useEffect, useCallback, useRef } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Download, RefreshCw, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error' | 'up-to-date';

export default function UpdateChecker() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const downloadRef = useRef({ total: 0, downloaded: 0 });

  const checkForUpdates = useCallback(async () => {
    try {
      setStatus('checking');
      setErrorMsg('');
      const result = await check();
      if (result) {
        setUpdate(result);
        setStatus('available');
      } else {
        setStatus('up-to-date');
        // Auto-hide after 3 seconds
        setTimeout(() => setDismissed(true), 3000);
      }
    } catch (err: unknown) {
      console.warn('Update check failed:', err);
      // Silently fail – don't bother the user if they're offline
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    // Check for updates 3 seconds after app start
    const timer = setTimeout(checkForUpdates, 3000);
    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  const handleDownloadAndInstall = async () => {
    if (!update) return;

    try {
      setStatus('downloading');
      setProgress(0);
      downloadRef.current = { total: 0, downloaded: 0 };

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            downloadRef.current.total = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloadRef.current.downloaded += (event.data.chunkLength ?? 0);
            if (downloadRef.current.total > 0) {
              setProgress(Math.round((downloadRef.current.downloaded / downloadRef.current.total) * 100));
            }
            break;
          case 'Finished':
            setProgress(100);
            setStatus('installing');
            break;
        }
      });

      // Relaunch after install
      await relaunch();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || 'Error al descargar la actualización');
      setStatus('error');
    }
  };

  // Don't render anything if dismissed or idle
  if (dismissed || status === 'idle') return null;

  return (
    <>
      <style>{`
        .update-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(4px);
          z-index: 9998;
          animation: updateFadeIn 0.3s ease;
        }

        .update-banner {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 9999;
          background: linear-gradient(135deg, #1a2332 0%, #0f1923 100%);
          border: 1px solid rgba(102, 187, 106, 0.3);
          border-radius: 16px;
          padding: 32px;
          min-width: 420px;
          max-width: 500px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(102,187,106,0.1);
          animation: updateSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .update-banner-minimal {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          background: linear-gradient(135deg, #1a2332 0%, #0f1923 100%);
          border: 1px solid rgba(102, 187, 106, 0.25);
          border-radius: 12px;
          padding: 16px 20px;
          min-width: 300px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          animation: updateSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes updateFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes updateSlideIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        @keyframes updateSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .update-icon-container {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: linear-gradient(135deg, #66BB6A, #2E7D32);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          box-shadow: 0 4px 20px rgba(102,187,106,0.3);
        }

        .update-title {
          color: #fff;
          font-size: 1.25rem;
          font-weight: 700;
          text-align: center;
          margin-bottom: 8px;
        }

        .update-version {
          color: #66BB6A;
          font-size: 0.9rem;
          font-weight: 600;
          text-align: center;
          margin-bottom: 4px;
        }

        .update-notes {
          color: rgba(255,255,255,0.6);
          font-size: 0.82rem;
          text-align: center;
          margin-bottom: 24px;
          line-height: 1.5;
          max-height: 80px;
          overflow-y: auto;
        }

        .update-btn {
          width: 100%;
          padding: 12px 24px;
          border: none;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s ease;
        }

        .update-btn-primary {
          background: linear-gradient(135deg, #66BB6A, #43A047);
          color: white;
        }

        .update-btn-primary:hover {
          background: linear-gradient(135deg, #81C784, #66BB6A);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(102,187,106,0.4);
        }

        .update-btn-secondary {
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.7);
          margin-top: 10px;
        }

        .update-btn-secondary:hover {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.9);
        }

        .update-progress-container {
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.08);
          border-radius: 3px;
          overflow: hidden;
          margin: 16px 0 8px;
        }

        .update-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #66BB6A, #43A047);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .update-progress-text {
          color: rgba(255,255,255,0.5);
          font-size: 0.78rem;
          text-align: center;
        }

        .update-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: none;
          border: none;
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          transition: all 0.2s ease;
        }

        .update-close:hover {
          color: rgba(255,255,255,0.8);
          background: rgba(255,255,255,0.1);
        }

        .update-status-row {
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(255,255,255,0.7);
          font-size: 0.85rem;
        }

        .update-spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* CHECKING / UP-TO-DATE — small toast at bottom right */}
      {(status === 'checking' || status === 'up-to-date') && (
        <div className="update-banner-minimal">
          <div className="update-status-row">
            {status === 'checking' && (
              <>
                <Loader2 size={18} className="update-spinner" color="#66BB6A" />
                <span>Buscando actualizaciones...</span>
              </>
            )}
            {status === 'up-to-date' && (
              <>
                <CheckCircle size={18} color="#66BB6A" />
                <span>Estás al día — última versión instalada</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* AVAILABLE — centered modal */}
      {status === 'available' && update && (
        <>
          <div className="update-overlay" onClick={() => setDismissed(true)} />
          <div className="update-banner">
            <button className="update-close" onClick={() => setDismissed(true)}>
              <X size={18} />
            </button>

            <div className="update-icon-container">
              <Download size={28} color="white" />
            </div>

            <div className="update-title">¡Nueva Versión Disponible!</div>
            <div className="update-version">
              Versión {update.version}
            </div>
            {update.body && (
              <div className="update-notes">{update.body}</div>
            )}

            <button className="update-btn update-btn-primary" onClick={handleDownloadAndInstall}>
              <Download size={18} />
              Actualizar Ahora
            </button>
            <button className="update-btn update-btn-secondary" onClick={() => setDismissed(true)}>
              Más tarde
            </button>
          </div>
        </>
      )}

      {/* DOWNLOADING / INSTALLING — centered modal, no dismiss */}
      {(status === 'downloading' || status === 'installing') && (
        <>
          <div className="update-overlay" />
          <div className="update-banner">
            <div className="update-icon-container">
              <RefreshCw size={28} color="white" className="update-spinner" />
            </div>

            <div className="update-title">
              {status === 'downloading' ? 'Descargando Actualización...' : 'Instalando...'}
            </div>

            <div className="update-progress-container">
              <div className="update-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="update-progress-text">
              {status === 'downloading'
                ? `${progress}% completado`
                : 'Instalando, la app se reiniciará automáticamente...'}
            </div>
          </div>
        </>
      )}

      {/* ERROR — centered modal */}
      {status === 'error' && (
        <>
          <div className="update-overlay" onClick={() => setDismissed(true)} />
          <div className="update-banner">
            <button className="update-close" onClick={() => setDismissed(true)}>
              <X size={18} />
            </button>

            <div className="update-icon-container" style={{ background: 'linear-gradient(135deg, #ef5350, #c62828)' }}>
              <AlertCircle size={28} color="white" />
            </div>

            <div className="update-title">Error al Actualizar</div>
            <div className="update-notes">{errorMsg}</div>

            <button className="update-btn update-btn-primary" onClick={checkForUpdates}>
              <RefreshCw size={18} />
              Reintentar
            </button>
            <button className="update-btn update-btn-secondary" onClick={() => setDismissed(true)}>
              Cerrar
            </button>
          </div>
        </>
      )}
    </>
  );
}
