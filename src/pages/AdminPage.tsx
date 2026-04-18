import { useState, useEffect } from 'react';
import { UserPlus, Shield, Search, Edit2, Trash2, Key, Users, Activity } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../lib/permissions';
import supabase from '../lib/supabase';

const demoUsers = [
  { id: 1, email: 'admin', nombre: 'Sebastian Navarro', rol: 'Administrador', activo: true, ultimo_acceso: 'Sesión Activa' },
  { id: 2, email: 'produccion', nombre: 'Auxiliar de Producción', rol: 'Auxiliar de Producción', activo: true, ultimo_acceso: 'Sesión Local' },
  { id: 3, email: 'costos', nombre: 'Analista de Costos', rol: 'Analista de Costos', activo: true, ultimo_acceso: 'Sesión Local' },
  { id: 4, email: 'supervisor', nombre: 'Supervisor Producción', rol: 'Supervisor Producción', activo: true, ultimo_acceso: 'Sesión Local' },
  { id: 5, email: 'logistica', nombre: 'Auxiliar Logística', rol: 'Auxiliar Logística', activo: true, ultimo_acceso: 'Sesión Local' },
  { id: 6, email: 'admin_aux', nombre: 'Auxiliar Administrativa', rol: 'Auxiliar Administrativa', activo: true, ultimo_acceso: 'Sesión Local' },
  { id: 7, email: 'coordinador', nombre: 'Coordinador Administrativo', rol: 'Coordinador Administrativo', activo: true, ultimo_acceso: 'Sesión Local' },
  { id: 8, email: 'gerencia', nombre: 'Director General (Gerencia)', rol: 'Gerencia', activo: true, ultimo_acceso: 'Sesión Local' },
  { id: 9, email: 'cartera', nombre: 'Analista de Cartera', rol: 'Analista de Cartera', activo: true, ultimo_acceso: 'Sesión Local' },
  { id: 10, email: 'piciz', nombre: 'Coordinador PICIZ', rol: 'Coordinador PICIZ', activo: true, ultimo_acceso: 'Sesión Local' },
];

const PasswordDisplay = () => {
  return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Privada (Supabase Auth)</span>;
};

const roles = [
  { nombre: 'Administrador', permisos: 'Acceso total a todos los módulos (Lectura y Escritura).' },
  { nombre: 'Gerencia', permisos: 'Acceso de solo lectura a métricas (Dashboard), Trazabilidad y todos los demás módulos.' },
  { nombre: 'Analista de Costos', permisos: 'Acceso total de lectura y escritura a todos los módulos operativos y de facturación. Sin acceso a Administración.' },
  { nombre: 'Auxiliar de Producción', permisos: 'Edita Programación y Maestro. Ve Producción, Despachos, Trazabilidad y el Histórico de Facturación.' },
  { nombre: 'Supervisor Producción', permisos: 'Edita Producción. Visibilidad sobre Programación y el Cuadro de Trazabilidad.' },
  { nombre: 'Auxiliar Logística', permisos: 'Edita Despachos (Logística) y Maestro. Visibilidad sobre Trazabilidad, Producción y Programación.' },
  { nombre: 'Auxiliar Administrativa', permisos: 'Edita Asignación de Facturas. Visibilidad en Prog., Trazabilidad, Despachos, y resto de facturación.' },
  { nombre: 'Coordinador Administrativo', permisos: 'Edita Creación de Pedidos y Anula en Histórico. Visibilidad general en módulos administrativos.' },
  { nombre: 'Coordinador PICIZ', permisos: 'Visibilidad completa en todo el sistema y acceso a reportes. Único privilegio de edición: Marcar facturas como Matrizadas en Histórico.' },
  { nombre: 'Analista de Cartera', permisos: 'Acceso exclusivo y edición a la pestaña de Cartera (Liberación de pedidos) dentro de Facturación.' }
];

// demoAuditLog removed

export default function AdminPage() {
  const { canView, userRole } = usePermissions('admin');
  const [activeTab, setActiveTab] = useState(userRole === 'Administrador' ? 'usuarios' : 'roles');

  if (!canView) return <Navigate to="/" replace />;

  // Users State
  const [users, setUsers] = useState(demoUsers);
  const [auditLog, setAuditLog] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'auditoria') {
      supabase.from('auditoria')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150)
        .then(({ data }) => {
          if (data) setAuditLog(data);
        });
    }
  }, [activeTab]);
  
  // Modal State for Create/Edit User
  const [showUserForm, setShowUserForm] = useState(false);
  const [formMode, setFormMode] = useState<'crear' | 'editar'>('crear');
  const [userFormData, setUserFormData] = useState<any>({});

  // Modal State for Password Reset
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [passwordFormData, setPasswordFormData] = useState({ userId: 0, newPassword: '', confirmPassword: '' });

  // Handlers
  const handleOpenCreateUser = () => {
    setFormMode('crear');
    setUserFormData({ nombre: '', email: '', rol: 'Auxiliar Administrativa', password: '', confirmPassword: '' });
    setShowUserForm(true);
  };

  const handleOpenEditUser = (user: any) => {
    setFormMode('editar');
    setUserFormData({ ...user });
    setShowUserForm(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (formMode === 'crear') {
      if (userFormData.password !== userFormData.confirmPassword) {
        alert("Las contraseñas no coinciden");
        return;
      }
      const newUser = {
        id: Date.now(),
        nombre: userFormData.nombre,
        email: userFormData.email,
        rol: userFormData.rol,
        activo: true,
        ultimo_acceso: '-',
        password: userFormData.password || 'Secreta'
      };
      setUsers([newUser, ...users]);
      alert("Usuario creado de manera local (simulado). En el futuro se guardará en Supabase Auth.");
    } else {
      setUsers(users.map(u => u.id === userFormData.id ? { ...u, nombre: userFormData.nombre, email: userFormData.email, rol: userFormData.rol } : u));
    }
    setShowUserForm(false);
  };

  const handleToggleActive = (id: number) => {
    setUsers(users.map(u => u.id === id ? { ...u, activo: !u.activo } : u));
  };

  const handleOpenPasswordReset = (id: number) => {
    setPasswordFormData({ userId: id, newPassword: '', confirmPassword: '' });
    setShowPasswordReset(true);
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      alert("Las contraseñas no coinciden");
      return;
    }
    
    // Obtenemos el usuario objetivo
    const targetUser = users.find(u => u.id === passwordFormData.userId);
    if (!targetUser) return;
    
    // Nos aseguramos del email real (agregando @agrifeed.local si es necesario)
    const targetEmail = targetUser.email.includes('@') ? targetUser.email : `${targetUser.email}@agrifeed.local`;
    
    const { error } = await supabase.rpc('admin_reset_password', { 
      target_email: targetEmail, 
      new_password: passwordFormData.newPassword 
    });

    if (error) {
      alert("Error al cambiar la contraseña: " + error.message);
    } else {
      alert("¡Contraseña actualizada exitosamente en Supabase Auth!");
      setShowPasswordReset(false);
    }
  };

  return (
    <div>
      <div className="tabs">
        {userRole === 'Administrador' && (
          <button className={`tab ${activeTab === 'usuarios' ? 'active' : ''}`} onClick={() => setActiveTab('usuarios')}>
            <Users size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Usuarios
          </button>
        )}
        <button className={`tab ${activeTab === 'roles' ? 'active' : ''}`} onClick={() => setActiveTab('roles')}>
          <Shield size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Roles y Permisos
        </button>
        <button className={`tab ${activeTab === 'auditoria' ? 'active' : ''}`} onClick={() => setActiveTab('auditoria')}>
          <Activity size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Auditoría
        </button>
      </div>

      {activeTab === 'usuarios' && userRole === 'Administrador' && (
        <>
          <div className="toolbar">
            <div className="toolbar-left">
              <div className="search-box">
                <Search size={18} />
                <input type="text" className="form-input" placeholder="Buscar usuario..." style={{ paddingLeft: 40, width: 300 }} />
              </div>
            </div>
            <div className="toolbar-right">
              <button className="btn btn-primary btn-sm" onClick={handleOpenCreateUser}><UserPlus size={16} /> Crear Usuario</button>
            </div>
          </div>
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Email</th>
                    <th>Contraseña</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Último Acceso</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} style={{ opacity: user.activo ? 1 : 0.6 }}>
                      <td style={{ fontWeight: 600 }}>{user.nombre}</td>
                      <td>{user.email}</td>
                      <td><PasswordDisplay /></td>
                      <td><span className="badge badge-info">{user.rol}</span></td>
                      <td>
                        <span className={`badge ${user.activo ? 'badge-success' : 'badge-neutral'}`}>
                          {user.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{user.ultimo_acceso}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline btn-sm btn-icon" title="Editar Info Central" onClick={() => handleOpenEditUser(user)}><Edit2 size={14} /></button>
                          <button className="btn btn-outline btn-sm btn-icon" title="Reset Contraseña" onClick={() => handleOpenPasswordReset(user.id)}><Key size={14} /></button>
                          <button className={`btn btn-sm btn-icon ${user.activo ? 'btn-danger' : 'btn-primary'}`} title={user.activo ? 'Desactivar' : 'Activar'} onClick={() => handleToggleActive(user.id)}>
                            {user.activo ? <Trash2 size={14} /> : <Activity size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20 }}>No hay usuarios</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL USER FORM */}
      {showUserForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2 className="modal-title">{formMode === 'crear' ? 'Crear Nuevo Usuario' : 'Editar Usuario'}</h2>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSaveUser}>
                <div className="grid-1" style={{ gap: '15px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Nombre Completo <span style={{ color: 'red' }}>*</span></label>
                    <input type="text" className="form-input" required value={userFormData.nombre || ''} onChange={e => setUserFormData({...userFormData, nombre: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Correo Electrónico <span style={{ color: 'red' }}>*</span></label>
                    <input type="email" className="form-input" required value={userFormData.email || ''} onChange={e => setUserFormData({...userFormData, email: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Rol del Sistema <span style={{ color: 'red' }}>*</span></label>
                    <select className="form-input" required value={userFormData.rol || ''} onChange={e => setUserFormData({...userFormData, rol: e.target.value})}>
                      {roles.map(r => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
                    </select>
                  </div>
                  {formMode === 'crear' && (
                    <>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Contraseña de Acceso <span style={{ color: 'red' }}>*</span></label>
                        <input type="password" className="form-input" required minLength={6} value={userFormData.password || ''} onChange={e => setUserFormData({...userFormData, password: e.target.value})} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Confirmar Contraseña <span style={{ color: 'red' }}>*</span></label>
                        <input type="password" className="form-input" required minLength={6} value={userFormData.confirmPassword || ''} onChange={e => setUserFormData({...userFormData, confirmPassword: e.target.value})} />
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowUserForm(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary">{formMode === 'crear' ? 'Crear Usuario' : 'Guardar Cambios'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PASSWORD RESET */}
      {showPasswordReset && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2 className="modal-title">Actualizar Contraseña</h2>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Ingresa la nueva contraseña para el usuario seleccionado. Será una actualización inmediata diseñada por el administrador local.</p>
              <form onSubmit={handleSavePassword}>
                <div className="form-group">
                  <label className="form-label">Nueva Contraseña</label>
                  <input type="password" className="form-input" required minLength={6} value={passwordFormData.newPassword} onChange={e => setPasswordFormData({...passwordFormData, newPassword: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirmar Nueva Contraseña</label>
                  <input type="password" className="form-input" required minLength={6} value={passwordFormData.confirmPassword} onChange={e => setPasswordFormData({...passwordFormData, confirmPassword: e.target.value})} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowPasswordReset(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-danger">Confirmar y Cambiar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Roles del Sistema</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Permisos</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.nombre}>
                    <td style={{ fontWeight: 600 }}><span className="badge badge-info">{role.nombre}</span></td>
                    <td>{role.permisos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'auditoria' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Log de Auditoría</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha/Hora</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Módulo</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>No hay eventos de auditoría registrados.</td></tr>
                )}
                {auditLog.map((log, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td>{log.usuario}</td>
                    <td>
                      <span className={`badge ${
                        log.accion === 'CREATE' ? 'badge-success' :
                        log.accion === 'UPDATE' ? 'badge-info' :
                        log.accion === 'IMPORT' ? 'badge-warning' : 'badge-error'
                      }`}>
                        {log.accion}
                      </span>
                    </td>
                    <td>{log.modulo}</td>
                    <td>{log.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
