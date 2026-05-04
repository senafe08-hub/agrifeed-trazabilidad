import React, { useState, useEffect } from 'react';
import { fetchProgramacion, fetchDespachosAcumulados, fetchProduccionAcumulada, fetchPrestamosAcumuladosPorOP } from '../lib/supabase';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { DespachoFormValues } from '../schemas/despachos';

interface DetalleOPListProps {
  clienteId?: number | string; // Para validación cruzada de grupo
}

const DetalleOPList: React.FC<DetalleOPListProps> = ({ clienteId }) => {
  const { control, register, setValue, watch } = useFormContext<DespachoFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'details'
  });

  const [programacion, setProgramacion] = useState<Record<string, unknown>[]>([]);
  const [acumulados, setAcumulados] = useState<Record<number, number>>({});
  const [produccionAcumulados, setProduccionAcumulados] = useState<Record<number, number>>({});
  const [prestamosAcumulados, setPrestamosAcumulados] = useState<Record<number, { total: number; destinos: Record<string, number> }>>({});
  const [opWarnings, setOpWarnings] = useState<Record<string, string>>({});
  const [prestamosPermitidos, setPrestamosPermitidos] = useState<Record<string, number>>({});
  const [grupoDestino, setGrupoDestino] = useState<string>('');

  useEffect(() => {
    if (clienteId) {
      import('../lib/api/ventas').then(api => {
        api.ensureCaches().then(() => {
          api.getClienteGrupoMap().then(map => {
            const gd = (api.resolveGrupo(Number(clienteId), map) || '').split('|')[0].trim().toUpperCase();
            setGrupoDestino(gd);
          });
        });
      });
    } else {
      setGrupoDestino('');
    }
  }, [clienteId]);

  // Load OP data and accumulated dispatch data once
  useEffect(() => {
    const load = async () => {
      try {
        const [progData, acumData, prodAcumData, prestAcumData] = await Promise.all([
          fetchProgramacion(),
          fetchDespachosAcumulados(),
          fetchProduccionAcumulada(),
          fetchPrestamosAcumuladosPorOP(),
        ]);
        setProgramacion(progData);
        setAcumulados(acumData);
        setProduccionAcumulados(prodAcumData);
        setPrestamosAcumulados(prestAcumData);
      } catch (e) {
        console.error('Error loading programacion', e);
        alert(`No se pudo cargar la información de OPs: ${(e as Error).message || JSON.stringify(e)}`);
      }
    };
    load();
  }, []);

  const addRow = () => {
    append({ op: 0, cantidad_a_despachar: 0, observaciones: '' });
  };

  const handleOPChange = async (index: number, value: string) => {
    setValue(`details.${index}.op`, Number(value));
    
    const prog = programacion.find(p => String(p.op) === String(value));
    if (prog) {
      const yaDespachadoTotal = acumulados[Number(value)] || 0;
      const producidoTotal = produccionAcumulados[Number(value)] || 0;
      setValue(`details.${index}.alimento` as any, (prog.maestro_alimentos as Record<string, string>)?.descripcion || '');
      setValue(`details.${index}.cliente_programado` as any, (prog.maestro_clientes as Record<string, string>)?.nombre || '');
      setValue(`details.${index}.cantidad_entregada` as any, producidoTotal);
      setValue(`details.${index}.cantidad_despachada_acumulada` as any, yaDespachadoTotal);
      setValue(`details.${index}.cantidad_a_despachar`, 0);
    } else {
      setValue(`details.${index}.alimento` as any, '');
      setValue(`details.${index}.cliente_programado` as any, '');
      setValue(`details.${index}.cantidad_entregada` as any, 0);
      setValue(`details.${index}.cantidad_despachada_acumulada` as any, 0);
      setValue(`details.${index}.cantidad_a_despachar`, 0);
    }

    // Duplicate OP validation
    const currentDetails = watch('details');
    const dup = currentDetails.filter(r => String(r.op) === String(value)).length > 1;
    if (dup) {
      alert('No se pueden repetir OPs dentro del mismo despacho');
      setValue(`details.${index}.op`, 0);
    }

    // Cross-group validation (early warning)
    if (value && clienteId) {
      try {
        const prog = programacion.find(p => String(p.op) === String(value));
        if (!prog) return;
        const ventasApi = await import('../lib/api/ventas');
        await ventasApi.ensureCaches();
        const clienteGrupoMap = await ventasApi.getClienteGrupoMap();
        const grupoDestino = (ventasApi.resolveGrupo(Number(clienteId), clienteGrupoMap) || '').split('|')[0].trim();
        const grupoOrigen = (ventasApi.resolveGrupo(Number(prog.cliente_id), clienteGrupoMap, String(prog.observaciones)) || '').split('|')[0].trim();
        
        if (grupoOrigen && grupoDestino && grupoOrigen !== grupoDestino) {
          const ambosCerdos = grupoOrigen.startsWith('CERDOS VARIOS') && grupoDestino.startsWith('CERDOS VARIOS');
          if (!ambosCerdos) {
            // Check for loans to calculate max permitted
            const { supabase } = await import('../lib/supabase');
            
            const [{ data: prestamos }, { data: compensaciones }] = await Promise.all([
              supabase.from('prestamos_inventario')
                .select('cantidad, cantidad_compensada')
                .ilike('grupo_origen', grupoOrigen.startsWith('CERDOS VARIOS') ? 'CERDOS VARIOS%' : grupoOrigen)
                .ilike('grupo_destino', grupoDestino.startsWith('CERDOS VARIOS') ? 'CERDOS VARIOS%' : grupoDestino)
                .eq('codigo_sap', prog.codigo_sap),
              supabase.from('prestamos_inventario')
                .select('cantidad_compensada')
                .ilike('grupo_origen', grupoDestino.startsWith('CERDOS VARIOS') ? 'CERDOS VARIOS%' : grupoDestino)
                .ilike('grupo_destino', grupoOrigen.startsWith('CERDOS VARIOS') ? 'CERDOS VARIOS%' : grupoOrigen)
                .eq('codigo_sap', prog.codigo_sap)
                .ilike('motivo', `%Repuesto con OP ${prog.lote}%`)
            ]);
            
            const prestadoDisponible = (prestamos || []).reduce((sum, p) => sum + p.cantidad, 0);
            const compensadoDisponible = (compensaciones || []).reduce((sum, p) => sum + (p.cantidad_compensada || 0), 0);
            const totalPermitido = prestadoDisponible + compensadoDisponible;
            
            if (totalPermitido > 0) {
              setPrestamosPermitidos(prev => ({ ...prev, [value]: totalPermitido }));
              setOpWarnings(prev => { const n = {...prev}; delete n[value]; return n; });
            } else {
              setPrestamosPermitidos(prev => { const n = {...prev}; delete n[value]; return n; });
              setOpWarnings(prev => ({ ...prev, [value]: `⚠️ Esta OP es de "${grupoOrigen}" pero el despacho va a "${grupoDestino}". Necesitas un Préstamo registrado.` }));
            }
          } else {
            setPrestamosPermitidos(prev => { const n = {...prev}; delete n[value]; return n; });
            setOpWarnings(prev => { const n = {...prev}; delete n[value]; return n; });
          }
        } else {
          setPrestamosPermitidos(prev => { const n = {...prev}; delete n[value]; return n; });
          setOpWarnings(prev => { const n = {...prev}; delete n[value]; return n; });
        }
      } catch(e) { console.warn('Validation error:', e); }
    }
  };

  const detailsWatch = watch('details');

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header flex justify-between items-center">
        <h3 className="card-title">Detalle de OPs</h3>
        <button type="button" className="btn btn-outline btn-sm" onClick={addRow} title="Agregar línea">
          <Plus size={16} /> Agregar OP
        </button>
      </div>
      <div className="card-body" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '12px' }}>
        {fields.map((field, idx) => {
          const rowValues = detailsWatch?.[idx] || {};
          const currentOp = String(rowValues.op || '');
          const prestamoInfo = prestamosAcumulados[Number(currentOp)] || { total: 0, destinos: {} };
          const lostToLoans = prestamoInfo.total;
          const totalPhysical = Math.max(0, ((rowValues as any).cantidad_entregada || 0) - ((rowValues as any).cantidad_despachada_acumulada || 0));
          const fisicoMax = Math.max(0, totalPhysical - lostToLoans);
          
          let max = fisicoMax;
          let labelText = lostToLoans > 0 ? `A Despachar (Max ${max} - ${lostToLoans} de Préstamo)` : `A Despachar (Max ${max})`;
          
          if (prestamosPermitidos[currentOp] !== undefined) {
            max = Math.min(totalPhysical, prestamosPermitidos[currentOp]);
            labelText = `A Despachar (Prestados: ${max})`;
          }

          const currentOpNum = Number(currentOp);
          const opcionesParaEstaFila = programacion.filter(p => {
            const opNum = Number(p.op);
            if (opNum === currentOpNum) return true; // Siempre mostrar la que ya está seleccionada en esta fila
            const entregada = produccionAcumulados[opNum] || 0;
            const despachada = acumulados[opNum] || 0;
            
            const pInfo = prestamosAcumulados[opNum] || { total: 0, destinos: {} };
            const prestamoTotal = pInfo.total;
            
            let prestamoAlClienteActual = 0;
            if (grupoDestino) {
              if (grupoDestino.startsWith('CERDOS VARIOS')) {
                Object.keys(pInfo.destinos).forEach(k => {
                   if (k.startsWith('CERDOS VARIOS')) prestamoAlClienteActual += pInfo.destinos[k];
                });
              } else {
                prestamoAlClienteActual = pInfo.destinos[grupoDestino] || 0;
              }
            }

            const fMax = Math.max(0, entregada - despachada - prestamoTotal + prestamoAlClienteActual);
            return fMax > 0;
          }).sort((a, b) => Number(b.op) - Number(a.op));

          return (
            <div key={field.id} className="grid-4" style={{ marginBottom: 12, gap: 8, alignItems: 'end' }}>
              {/* OP selector */}
              <div className="form-group">
                <label className="form-label">OP</label>
                <select
                  className="form-select"
                  {...register(`details.${idx}.op`)}
                  onChange={e => handleOPChange(idx, e.target.value)}
                  style={opWarnings[currentOp] ? { borderColor: '#e65100', boxShadow: '0 0 0 2px rgba(230,81,0,0.2)' } : {}}
                >
                  <option value="">Seleccionar OP...</option>
                  {opcionesParaEstaFila.map(p => (
                    <option key={String(p.op)} value={String(p.op)}>
                      {String(p.op)} - {(p.maestro_alimentos as Record<string, string>)?.descripcion || 'Sin Alimento'}
                    </option>
                  ))}
                </select>
                {opWarnings[currentOp] && (
                  <div style={{ 
                    background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 6, 
                    padding: '6px 10px', marginTop: 6, fontSize: '0.78rem', color: '#e65100',
                    display: 'flex', alignItems: 'center', gap: 6, gridColumn: 'span 4'
                  }}>
                    <AlertTriangle size={14} /> {opWarnings[currentOp]}
                  </div>
                )}
              </div>
              {/* Alimento (read‑only) */}
              <div className="form-group">
                <label className="form-label">Alimento</label>
                <input type="text" className="form-input" readOnly {...register(`details.${idx}.alimento` as any)} />
              </div>
              {/* Cliente programado (read‑only) */}
              <div className="form-group">
                <label className="form-label">Cliente Programado</label>
                <input type="text" className="form-input" readOnly {...register(`details.${idx}.cliente_programado` as any)} />
              </div>
              {/* Cantidad entregada (read‑only) */}
              <div className="form-group">
                <label className="form-label">Entregada</label>
                <input type="number" className="form-input" readOnly {...register(`details.${idx}.cantidad_entregada` as any)} />
              </div>
              {/* Cantidad ya despachada (read‑only) */}
              <div className="form-group">
                <label className="form-label">Despachada</label>
                <input type="number" className="form-input" readOnly {...register(`details.${idx}.cantidad_despachada_acumulada` as any)} />
              </div>
              {/* Cantidad a despachar */}
              <div className="form-group">
                <label className="form-label">{labelText}</label>
                <input
                  type="number"
                  className="form-input"
                  {...register(`details.${idx}.cantidad_a_despachar`, { valueAsNumber: true })}
                  min={0}
                  max={max}
                />
              </div>


              {/* Remove button */}
              <div className="form-group" style={{ gridColumn: 'span 1' }}>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => remove(idx)}
                  title="Eliminar línea"
                  style={{ marginTop: '24px' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DetalleOPList;
