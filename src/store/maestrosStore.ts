import { create } from 'zustand';
import { fetchMaestros } from '../lib/api/maestros';
import supabase from '../lib/supabase';
import { fetchGruposInventario } from '../lib/api/ventas';

export interface Granja {
  id: number;
  nombre: string;
}

export interface Vehiculo {
  id: number;
  placa: string;
  conductor?: string;
}

export interface Cliente {
  id?: number;
  codigo_sap: number | string;
  nombre: string;
}

export interface Alimento {
  codigo_sap: number;
  descripcion: string;
}

export interface CasaFormuladora {
  id: number | string;
  nombre: string;
}

interface MaestrosState {
  granjas: Granja[];
  vehiculos: Vehiculo[];
  clientes: Cliente[];
  alimentos: Alimento[];
  casasFormuladoras: CasaFormuladora[];
  gruposInventario: string[];
  
  loading: boolean;
  fetched: boolean;
  error: string | null;

  fetchData: () => Promise<void>;
  refetchData: () => Promise<void>;
}

export const useMaestrosStore = create<MaestrosState>((set, get) => ({
  granjas: [],
  vehiculos: [],
  clientes: [],
  alimentos: [],
  casasFormuladoras: [],
  gruposInventario: [],
  
  loading: false,
  fetched: false,
  error: null,

  fetchData: async () => {
    // Evitar peticiones redundantes si ya tenemos los datos
    if (get().fetched) return;
    
    set({ loading: true, error: null });
    try {
      // 1. Llamar a la función existente (Granjas, Vehículos, Clientes)
      const { granjas, vehiculos, clientes } = await fetchMaestros();

      // 2. Traer catálogos adicionales en paralelo
      const [alimentosRes, casasRes, grupos] = await Promise.all([
        supabase.from('maestro_alimentos').select('codigo_sap, descripcion').order('descripcion'),
        supabase.from('casas_formuladoras').select('id, nombre').order('nombre'),
        fetchGruposInventario()
      ]);

      set({
        granjas: granjas || [],
        vehiculos: vehiculos || [],
        clientes: clientes || [],
        alimentos: alimentosRes.data || [],
        casasFormuladoras: casasRes.data || [],
        gruposInventario: grupos || [],
        fetched: true,
        loading: false
      });
    } catch (err: unknown) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  refetchData: async () => {
    set({ fetched: false });
    await get().fetchData();
  }
}));
