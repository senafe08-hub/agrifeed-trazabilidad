import { useState } from 'react';
import { Plus, Trash2, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { createSolicitud } from '../lib/api/ventas';
import { getISOWeek, getISOWeeksInYear, setISOWeek, startOfISOWeek, addDays, format, setWeekYear } from 'date-fns';
import type { CasaFormuladora } from '../lib/api/ventas';

const DIAS_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface GridRow {
  codigo_sap: number | '';
  refText: string;
  casa_formuladora_id: number | '';
  cantidades: number[];
}

function getFechasSemana(semana: number, anio: number): string[] {
  let d = setWeekYear(new Date(), anio);
  d = setISOWeek(d, semana);
  const start = startOfISOWeek(d);
  
  const fechas: string[] = [];
  for (let i = 0; i < 7; i++) {
    fechas.push(format(addDays(start, i), 'yyyy-MM-dd'));
  }
  return fechas;
}

function getSemanaActual() {
  const d = new Date();
  return { semana: getISOWeek(d), anio: d.getFullYear() };
}

interface Props {
  semana: number;
  anio: number;
  clientes: { codigo_sap: number | string; nombre: string }[];
  alimentos: { codigo_sap: number | string; descripcion: string }[];
  casas: CasaFormuladora[];
  onSaved: () => void;
  onCancel: () => void;
  onChangeSemana: (semana: number, anio: number) => void;
}

export default function SolicitudGridForm({ semana, anio, clientes, alimentos, casas, onSaved, onCancel, onChangeSemana }: Props) {
  const [clienteId, setClienteId] = useState<number | ''>('');
  const [rows, setRows] = useState<GridRow[]>([{ codigo_sap: '', refText: '', casa_formuladora_id: '', cantidades: [0,0,0,0,0,0,0] }]);
  const [saving, setSaving] = useState(false);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const fechas = getFechasSemana(semana, anio);

  function cambiarSemana(delta: number) {
    let s = semana + delta, a = anio;
    const maxWeeks = getISOWeeksInYear(new Date(a, 0, 4));
    if (s < 1) { s = getISOWeeksInYear(new Date(a - 1, 0, 4)); a--; }
    if (s > maxWeeks) { s = 1; a++; }
    onChangeSemana(s, a);
  }

  function addRow() {
    setRows([...rows, { codigo_sap: '', refText: '', casa_formuladora_id: '', cantidades: [0,0,0,0,0,0,0] }]);
  }

  function removeRow(idx: number) {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== idx));
  }

  function updateRef(idx: number, text: string) {
    const nr = [...rows];
    // Try to match typed text to an alimento
    const match = alimentos.find((a: { codigo_sap: number | string; descripcion: string }) => a.descripcion === text);
    nr[idx] = { ...nr[idx], refText: text, codigo_sap: match ? Number(match.codigo_sap) : '' };
    setRows(nr);
  }

  function updateCasa(idx: number, val: string) {
    const nr = [...rows];
    nr[idx] = { ...nr[idx], casa_formuladora_id: val ? Number(val) : '' };
    setRows(nr);
  }

  function updateCant(rowIdx: number, diaIdx: number, val: string) {
    const nr = [...rows];
    const c = [...nr[rowIdx].cantidades];
    c[diaIdx] = Number(val) || 0;
    nr[rowIdx] = { ...nr[rowIdx], cantidades: c };
    setRows(nr);
  }

  function rowTotal(row: GridRow) { return row.cantidades.reduce((s, v) => s + v, 0); }
  function colTotal(diaIdx: number) { return rows.reduce((s, r) => s + r.cantidades[diaIdx], 0); }
  function grandTotal() { return rows.reduce((s, r) => s + rowTotal(r), 0); }

  async function handleSave() {
    if (!clienteId) { alert('Selecciona un cliente.'); return; }
    // Validate each row has casa
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].codigo_sap && !rows[i].casa_formuladora_id) {
        alert(`Fila ${i + 1}: Selecciona la casa formuladora.`);
        return;
      }
    }
    const items: { fecha: string; cliente_id: number; codigo_sap: number; casa_formuladora_id: number; cantidad: number }[] = [];
    for (const row of rows) {
      if (!row.codigo_sap || !row.casa_formuladora_id) continue;
      for (let d = 0; d < 7; d++) {
        if (row.cantidades[d] > 0) {
          items.push({ fecha: fechas[d], cliente_id: Number(clienteId), codigo_sap: Number(row.codigo_sap), casa_formuladora_id: Number(row.casa_formuladora_id), cantidad: row.cantidades[d] });
        }
      }
    }
    if (items.length === 0) { alert('No hay cantidades para guardar.'); return; }
    setSaving(true);
    try {
      for (const item of items) await createSolicitud(item);
      alert(`${items.length} registros guardados correctamente.`);
      onSaved();
    } catch (err: unknown) { alert('Error: ' + (err as Error).message); }
    setSaving(false);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <span className="card-title">Programar Cargues</span>
        <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancelar</button>
      </div>
      <div className="card-body">
        {/* PASO 1: Cliente + Semana */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 300px', marginBottom: 0 }}>
            <label className="form-label">Cliente</label>
            <select className="form-input" value={clienteId} onChange={e => setClienteId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Seleccionar Cliente —</option>
              {clientes.map(c => <option key={c.codigo_sap} value={c.codigo_sap}>{c.nombre}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
            <button className="btn btn-outline btn-sm" onClick={() => cambiarSemana(-1)}><ChevronLeft size={14} /></button>
            <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: 130, textAlign: 'center' }}>
              Semana {semana} — {anio}
            </span>
            <button className="btn btn-outline btn-sm" onClick={() => cambiarSemana(1)}><ChevronRight size={14} /></button>
            <button className="btn btn-outline btn-sm" onClick={() => { const c = getSemanaActual(); onChangeSemana(c.semana, c.anio); }} style={{ fontSize: '0.8rem' }}>Hoy</button>
          </div>
        </div>

        {/* PASO 2: Grilla */}
        {clienteId ? (
          <>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table className="data-table" style={{ fontSize: '0.82rem', minWidth: 900, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 200 }} />
                  <col style={{ width: 120 }} />
                  {DIAS_LABELS.map((_, i) => <col key={i} style={{ width: 75 }} />)}
                  <col style={{ width: 60 }} />
                  <col style={{ width: 36 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Referencia</th>
                    <th>Casa</th>
                    {DIAS_LABELS.map((d, i) => (
                      <th key={d} style={{ textAlign: 'center' }}>
                        <div>{d}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>{fechas[i]?.slice(5)}</div>
                      </th>
                    ))}
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      <td style={{ padding: 2, position: 'relative' }}>
                        <input type="text" className="form-input"
                          style={{ fontSize: '0.8rem', padding: '5px 6px', width: '100%' }}
                          placeholder="Escribir alimento..."
                          value={row.refText}
                          onChange={e => updateRef(ri, e.target.value)}
                          onFocus={() => setFocusedRow(ri)}
                          onBlur={() => setTimeout(() => setFocusedRow(null), 200)}
                          autoComplete="off" />
                        
                        {focusedRow === ri && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4,
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto'
                          }}>
                            {alimentos
                              .filter((a: { codigo_sap: number | string; descripcion: string }) => a.descripcion.toLowerCase().includes(row.refText.toLowerCase()))
                              .map((a: { codigo_sap: number | string; descripcion: string }) => (
                                <div key={a.codigo_sap} 
                                     style={{ padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                                     onMouseDown={() => {
                                       updateRef(ri, a.descripcion);
                                       setFocusedRow(null);
                                     }}
                                     onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                     onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  {a.descripcion}
                                </div>
                              ))}
                            {alimentos.filter((a: { codigo_sap: number | string; descripcion: string }) => a.descripcion.toLowerCase().includes(row.refText.toLowerCase())).length === 0 && (
                              <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#64748b' }}>Sin resultados</div>
                            )}
                          </div>
                        )}
                        {row.refText && !row.codigo_sap && focusedRow !== ri && <div style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: 2 }}>⚠ No coincide</div>}
                      </td>
                      <td style={{ padding: 2 }}>
                        <select className="form-input" style={{ fontSize: '0.8rem', padding: '5px 6px' }} value={row.casa_formuladora_id} onChange={e => updateCasa(ri, e.target.value)}>
                          <option value="">— Casa —</option>
                          {casas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </td>
                      {row.cantidades.map((v, di) => (
                        <td key={di} style={{ padding: 2 }}>
                          <input type="number" min={0} className="form-input"
                            style={{ width: '100%', textAlign: 'center', fontSize: '0.85rem', padding: '5px 2px', fontWeight: v > 0 ? 700 : 400 }}
                            value={v || ''} onChange={e => updateCant(ri, di, e.target.value)} placeholder="0" />
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{rowTotal(row) || '—'}</td>
                      <td style={{ padding: 2 }}>
                        {rows.length > 1 && <button className="btn btn-sm btn-icon" style={{ color: '#ef4444' }} onClick={() => removeRow(ri)}><Trash2 size={14} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 800, background: '#f8fafc' }}>
                    <td colSpan={2}>TOTAL</td>
                    {DIAS_LABELS.map((_, di) => <td key={di} style={{ textAlign: 'center' }}>{colTotal(di) || '—'}</td>)}
                    <td style={{ textAlign: 'right', fontSize: '1rem', color: 'var(--primary-color)' }}>{grandTotal()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn btn-outline btn-sm" onClick={addRow}><Plus size={14} /> Agregar Referencia</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Save size={16} /> {saving ? 'Guardando...' : `Guardar ${grandTotal()} bultos`}
              </button>
            </div>
          </>
        ) : (
          <p style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Selecciona un cliente para comenzar.</p>
        )}
      </div>
    </div>
  );
}
