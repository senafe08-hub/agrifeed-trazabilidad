// src/lib/permissions.ts

export type ModuleName = 'dashboard' | 'trazabilidad' | 'maestro' | 'programacion' | 'produccion' | 'despachos' | 'facturacion' | 'admin';
export type FacturacionTab = 'pedido' | 'cartera' | 'factura' | 'historico' | 'dashboard_cartera';

interface RolePermissions {
  canView: ModuleName[];
  canEdit: ModuleName[];
  facturacion?: {
    canViewTabs: FacturacionTab[];
    canEditTabs: FacturacionTab[];
  };
}

// User-provided mapping rules:
export const ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  'Administrador': {
    canView: ['dashboard', 'trazabilidad', 'maestro', 'programacion', 'produccion', 'despachos', 'facturacion', 'admin'],
    canEdit: ['dashboard', 'trazabilidad', 'maestro', 'programacion', 'produccion', 'despachos', 'facturacion', 'admin'],
    facturacion: {
      canViewTabs: ['pedido', 'cartera', 'factura', 'historico', 'dashboard_cartera'],
      canEditTabs: ['pedido', 'cartera', 'factura', 'historico', 'dashboard_cartera']
    }
  },
  'Gerencia': {
    canView: ['dashboard', 'trazabilidad', 'maestro', 'programacion', 'produccion', 'despachos', 'facturacion', 'admin'],
    canEdit: [], // No edita nada
    facturacion: {
      canViewTabs: ['pedido', 'cartera', 'factura', 'historico', 'dashboard_cartera'],
      canEditTabs: []
    }
  },
  'Analista de Costos': {
    canView: ['dashboard', 'trazabilidad', 'maestro', 'programacion', 'produccion', 'despachos', 'facturacion'],
    canEdit: ['maestro'],
    facturacion: {
      canViewTabs: ['pedido', 'cartera', 'factura', 'historico', 'dashboard_cartera'],
      canEditTabs: []
    }
  },
  'Auxiliar de Producción': {
    canView: ['trazabilidad', 'produccion', 'despachos', 'facturacion', 'programacion', 'maestro'],
    canEdit: ['programacion', 'maestro'],
    facturacion: {
      canViewTabs: ['historico'],
      canEditTabs: []
    }
  },
  'Supervisor Producción': {
    canView: ['produccion', 'programacion', 'trazabilidad'],
    canEdit: ['produccion'],
    facturacion: { canViewTabs: [], canEditTabs: [] }
  },
  'Auxiliar Logística': {
    canView: ['trazabilidad', 'produccion', 'programacion', 'despachos', 'maestro'],
    canEdit: ['despachos', 'maestro'],
    facturacion: { canViewTabs: [], canEditTabs: [] }
  },
  'Auxiliar Administrativa': {
    canView: ['programacion', 'trazabilidad', 'despachos', 'facturacion', 'maestro'],
    canEdit: ['maestro', 'facturacion'],
    facturacion: {
      canViewTabs: ['pedido', 'cartera', 'factura', 'historico', 'dashboard_cartera'], // "creacion, historial, cartera" + "asignacion (edit)" implies they can see all.
      canEditTabs: ['factura'] // "solo podra editar asignacion de factura"
    }
  },
  'Coordinador Administrativo': {
    canView: ['programacion', 'trazabilidad', 'despachos', 'facturacion', 'maestro'],
    canEdit: ['maestro', 'facturacion'],
    facturacion: {
      canViewTabs: ['cartera', 'factura', 'pedido', 'historico', 'dashboard_cartera'],  // Added historically needed things
      canEditTabs: ['pedido', 'historico'] // "editar asignacion de pedidos (creacion) y anular factura en historico"
    }
  },
  'Analista de Cartera': {
    canView: ['facturacion'],
    canEdit: ['facturacion'],
    facturacion: {
      canViewTabs: ['cartera', 'dashboard_cartera'],
      canEditTabs: ['cartera', 'dashboard_cartera']
    }
  }
};

// Hook for easier access
import { useOutletContext } from 'react-router-dom';

export function usePermissions(moduleName: ModuleName) {
  const context = useOutletContext<{ userRole: string }>() || { userRole: '' };
  const role = ROLE_PERMISSIONS[context.userRole] || ROLE_PERMISSIONS['Invitado'] || { canView: [], canEdit: [] };

  const isRoleAdmin = context.userRole === 'Administrador';

  return {
    canView: isRoleAdmin || role.canView.includes(moduleName),
    canEdit: isRoleAdmin || role.canEdit.includes(moduleName),
    roleData: role,
    userRole: context.userRole
  };
}
