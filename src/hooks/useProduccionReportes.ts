import { useState, useEffect, useCallback, useMemo } from 'react';
import supabase, { registrarAuditoria } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { ExtendedProduccionRow } from './useProduccion';

export interface ReporteTurno {
  id: number;
  fecha: string;
  turno: string;
  supervisor: string | null;
  dosificador: string | null;
  baches_dosificados: number | null;
  total_bultos: number | null;
  observaciones?: string;
}

const META_BULTOS = 5500;
const META_BACHES = 108;

export function useProduccionReportes(canView: boolean, data: ExtendedProduccionRow[]) {
  const [activeTab, setActiveTab] = useState<'registros' | 'reporte' | 'estado_ops' | 'reporte_explosion'>('registros');
  
  // Turno Report State
  const [reportMode, setReportMode] = useState<'lista' | 'nuevo' | 'detalle' | 'editar_detalle'>('lista');
  const [historialReportes, setHistorialReportes] = useState<ReporteTurno[]>([]);
  const [reporteFecha, setReporteFecha] = useState(new Date().toISOString().split('T')[0]);
  const [reporteTurno, setReporteTurno] = useState('Diurno');
  const [reporteFormData, setReporteFormData] = useState({ supervisor: '', dosificador: '', baches_dosificados: '' as string | number | null, observaciones: '' });
  const [reporteSavedInfo, setReporteSavedInfo] = useState<ReporteTurno | null>(null);

  // Report filter UI
  const [reportFilterDesde, setReportFilterDesde] = useState('');
  const [reportFilterHasta, setReportFilterHasta] = useState('');

  // Explosion Report UI
  const [explosionDesde, setExplosionDesde] = useState(new Date().toISOString().split('T')[0]);
  const [explosionHasta, setExplosionHasta] = useState(new Date().toISOString().split('T')[0]);
  const [explosionLoading, setExplosionLoading] = useState(false);
  const [explosionData, setExplosionData] = useState<{ codigo: string; material: string; totalKg: number; porOP: Record<string, number> }[]>([]);
  const [explosionDetalle, setExplosionDetalle] = useState<{ fecha: string; turno: string; op: number; cliente: string; formula: string; baches: number }[]>([]);
  const [explosionOps, setExplosionOps] = useState<{ lote: string; baches: number; formula_id: number; cliente: string; alimento: string }[]>([]);

  const fetchHistorialReportes = useCallback(async () => {
    const { data: reportes } = await supabase.from('reportes_turno').select('*').order('fecha', { ascending: false });
    if (reportes) setHistorialReportes(reportes);
  }, []);

  useEffect(() => {
    if (canView && activeTab === 'reporte') {
      fetchHistorialReportes();
    }
  }, [activeTab, fetchHistorialReportes, canView]);

  useEffect(() => {
    if (reportMode === 'nuevo') {
      const existing = historialReportes.find(r => r.fecha === reporteFecha && r.turno === reporteTurno);
      setReporteSavedInfo(existing || null);
    }
  }, [reporteFecha, reporteTurno, reportMode, historialReportes]);

  const currentTotalBultos = useMemo(() => {
    const turnData = data.filter(d => d.fecha_produccion === reporteFecha && d.turno === reporteTurno);
    const opsMap = new Map<string, ExtendedProduccionRow & { sum: number }>();
    turnData.forEach(r => {
      if (!opsMap.has(String(r.lote))) {
        opsMap.set(String(r.lote), { ...r, sum: 0 });
      }
      opsMap.get(String(r.lote))!.sum += r.bultos;
    });
    const uniqueOps = Array.from(opsMap.values());
    return uniqueOps.reduce((s, o) => s + o.sum, 0);
  }, [data, reporteFecha, reporteTurno]);

  const handleSaveReporte = async () => {
    if (!reporteFormData.supervisor || !reporteFormData.dosificador) {
      alert("Por favor completa los nombres de supervisor y dosificador.");
      return;
    }
    if (reportMode === 'nuevo' && reporteSavedInfo) {
      alert("Ya existe un reporte para esta fecha y turno. Edita el existente desde el historial.");
      return;
    }
    const payload = {
      fecha: reporteFecha,
      turno: reporteTurno,
      supervisor: reporteFormData.supervisor?.toUpperCase() || null,
      dosificador: reporteFormData.dosificador?.toUpperCase() || null,
      baches_dosificados: reporteFormData.baches_dosificados ? Number(reporteFormData.baches_dosificados) : null,
      total_bultos: currentTotalBultos,
      observaciones: reporteFormData.observaciones
    };
    try {
      if (reportMode === 'editar_detalle' && reporteSavedInfo?.id) {
        await supabase.from('reportes_turno').update(payload).eq('id', reporteSavedInfo.id);
        await registrarAuditoria('UPDATE', 'Producción', `Se actualizó el reporte de turno ${payload.fecha}`);
        alert('Reporte actualizado correctamente.');
      } else {
        await supabase.from('reportes_turno').insert([payload]);
        await registrarAuditoria('CREATE', 'Producción', `Se guardó el reporte de turno ${payload.fecha}`);
        alert('Reporte guardado correctamente.');
      }
      setReportMode('lista');
      fetchHistorialReportes();
    } catch (err: unknown) {
      alert('Error al guardar reporte: Detalles -> ' + (err as Error).message);
    }
  };

  const handleDeleteReporte = async () => {
    if (!reporteSavedInfo?.id) return;
    if (!window.confirm('¿Estás seguro de que deseas ELIMINAR este reporte? Esta acción no se puede deshacer.')) return;
    
    try {
      const { error } = await supabase.from('reportes_turno').delete().eq('id', reporteSavedInfo!.id);
      if (error) throw error;
      await registrarAuditoria('DELETE', 'Producción', `Se eliminó el reporte de turno ${reporteSavedInfo?.fecha}`);
      alert('Reporte eliminado correctamente.');
      setReportMode('lista');
      fetchHistorialReportes();
    } catch (err: unknown) {
      alert('Error al eliminar reporte: ' + (err as Error).message);
    }
  };

  const unlockReport = useCallback(() => {
    if (window.confirm("Este reporte ya se guardó previamente. ¿Estás seguro de que deseas desbloquearlo para realizar ediciones?")) {
      setReportMode('editar_detalle');
    }
  }, []);

  const generarReporteExplosion = async () => {
    setExplosionLoading(true);
    try {
      const { data: prodData, error } = await supabase
        .from('produccion')
        .select(`
          lote, baches_entregados, fecha_produccion, turno,
          programacion:programacion!inner(formula_id, maestro_clientes(nombre), maestro_alimentos(descripcion))
        `)
        .gte('fecha_produccion', explosionDesde)
        .lte('fecha_produccion', explosionHasta);
      if (error) throw error;
      
      const agrupado: Record<number, { baches: number, cliente: string, formula_id: number, alimento: string }> = {};
      const formulaIds = new Set<number>();
      const detallesList: { fecha: string; turno: string; op: number; cliente: string; formula: string; baches: number }[] = [];

      for (const p of prodData || []) {
        const prog = Array.isArray(p.programacion) ? p.programacion[0] : (p.programacion || {});
        const fid = prog.formula_id;
        const baches = Number((p as Record<string, unknown>).baches_entregados || 0);
        if (!fid || baches === 0) continue;
        
        formulaIds.add(fid);
        const cNombre = Array.isArray(prog.maestro_clientes) ? (prog.maestro_clientes as { nombre: string }[])[0]?.nombre : (prog.maestro_clientes as { nombre: string })?.nombre;
        const aNombre = Array.isArray(prog.maestro_alimentos) ? (prog.maestro_alimentos as { descripcion: string }[])[0]?.descripcion : (prog.maestro_alimentos as { descripcion: string })?.descripcion;
        
        const loteKey = Number(p.lote);
        if (!agrupado[loteKey]) agrupado[loteKey] = { baches: 0, formula_id: fid, cliente: cNombre || 'General', alimento: aNombre || '-' };
        agrupado[loteKey].baches += baches;
        
        detallesList.push({
          fecha: p.fecha_produccion,
          turno: p.turno,
          op: p.lote,
          cliente: cNombre || '-',
          formula: aNombre || '-',
          baches: baches
        });
      }

      setExplosionDetalle(detallesList.sort((a,b) => a.fecha.localeCompare(b.fecha)));

      if (formulaIds.size === 0) {
        setExplosionData([]);
        setExplosionLoading(false);
        return;
      }

      const { data: detalles, error: detErr } = await supabase
        .from('formula_detalle')
        .select(`
          formula_id, cantidad_base, material_id, 
          inventario_materiales!inner(codigo, nombre)
        `)
        .in('formula_id', Array.from(formulaIds));
      if (detErr) throw detErr;

      const consolidado: Record<number, { codigo: string, material: string, totalKg: number, porOP: Record<string, number> }> = {};
      const opsWithFormula = Object.keys(agrupado);

      for (const lote of opsWithFormula) {
        const info = agrupado[Number(lote)];
        const baches = info.baches;
        if (baches <= 0) continue;
        
        const de_f = detalles.filter(d => d.formula_id === info.formula_id);
        for (const d of de_f) {
          const mId = d.material_id;
          const invObj = Array.isArray(d.inventario_materiales) ? d.inventario_materiales[0] : d.inventario_materiales;
          if (!consolidado[mId]) consolidado[mId] = { codigo: (invObj as { codigo: string })?.codigo || '-', material: (invObj as { nombre: string })?.nombre || 'Desconocido', totalKg: 0, porOP: {} };
          
          const kg = d.cantidad_base * baches;
          consolidado[mId].totalKg += kg;
          consolidado[mId].porOP[lote] = (consolidado[mId].porOP[lote] || 0) + kg;
        }
      }

      setExplosionData(Object.values(consolidado).sort((a,b) => b.totalKg - a.totalKg));
      setExplosionOps(Object.keys(agrupado).map(k => ({ lote: k, ...agrupado[Number(k)] })));
    } catch(err: unknown) {
      alert("Error generando explosión: " + (err as Error).message);
    }
    setExplosionLoading(false);
  };

  const exportExplosionToExcel = async () => {
    if (!explosionData.length && !explosionDetalle.length) return;
    const wb = XLSX.utils.book_new();

    const flatList: Record<string, unknown>[] = [];
    for (const op of explosionOps) {
       for (const e of explosionData) {
          const kg = e.porOP[op.lote];
          if (kg > 0) {
             flatList.push({
               'DESCRIPCION ALIMENTO': op.alimento,
               'BACHEZ': op.baches,
               'Código': e.codigo,
               'Materia Prima': e.material,
               'TOTAL KG': kg,
               'OP': Number(op.lote)
             });
          }
       }
    }

    if (flatList.length > 0) {
      const wsFlat = XLSX.utils.json_to_sheet(flatList);
      XLSX.utils.book_append_sheet(wb, wsFlat, 'Explosión de Producción');
    }

    try {
      if ('showSaveFilePicker' in window) {
        const win = window as unknown as { showSaveFilePicker: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: unknown) => Promise<void>; close: () => Promise<void> }> }> };
        const handle = await win.showSaveFilePicker({ suggestedName: `Reporte_Explosion_${explosionDesde}_al_${explosionHasta}.xlsx`, types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
        const writable = await handle.createWritable();
        await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
        await writable.close();
      } else { XLSX.writeFile(wb, `Reporte_Explosion_${explosionDesde}.xlsx`); }
    } catch (_e) { }
  };

  const exportExplosionToPDF = async () => {
    if (!explosionData.length && !explosionDetalle.length) return;
    try {
      const doc = new jsPDF('landscape');
      doc.setFontSize(18);
      doc.text('Explosión de Consumos y Producción', 14, 20);
      doc.setFontSize(11);
      doc.text(`Periodo evaluado: ${explosionDesde} a ${explosionHasta}`, 14, 28);
      
      let finalY = 35;
      if (explosionDetalle.length > 0) {
        doc.setFontSize(14);
        doc.text('Detalle de Órdenes (Baches)', 14, 34);
        autoTable(doc, {
          startY: 38,
          head: [['Fecha', 'Turno', 'Lote', 'Cliente', 'Baches']],
          body: explosionDetalle.map(e => [e.fecha, e.turno, e.op, e.cliente, e.baches]),
          theme: 'grid',
          headStyles: { fillColor: [25, 118, 210] }
        });
        finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
      }

      if (explosionData.length > 0) {
         doc.setFontSize(14);
         doc.text('Consolidado Materiales Estimados', 14, finalY - 4);
         
         const headers = ['Código', 'Materia Prima', ...explosionOps.map(o => `OP ${o.lote}`), 'TOTAL(Kg)'];
         const bodyRows = explosionData.map(e => [
           e.codigo, e.material, 
           ...explosionOps.map(o => (e.porOP[o.lote] || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })),
           e.totalKg.toLocaleString('es-CO', { maximumFractionDigits: 2 })
         ]);

         autoTable(doc, {
           startY: finalY,
           head: [headers],
           body: bodyRows,
           theme: 'grid',
           headStyles: { fillColor: [46, 125, 50] }
         });
      }

      if ('showSaveFilePicker' in window) {
        const win = window as unknown as { showSaveFilePicker: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: unknown) => Promise<void>; close: () => Promise<void> }> }> };
        const handle = await win.showSaveFilePicker({ suggestedName: `Explosion_${explosionDesde}.pdf`, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
        const writable = await handle.createWritable();
        await writable.write(doc.output('blob'));
        await writable.close();
      } else {
        doc.save(`Explosion_${explosionDesde}.pdf`);
      }
    } catch(err) {
      alert("Error generating PDF");
    }
  };

  const handleExportPDF = async () => {
    if (!reporteSavedInfo) {
      alert("No hay información guardada para exportar.");
      return;
    }
    
    try {
      const doc = new jsPDF();
      
      try {
        const response = await fetch('/logo-agrifeed.png');
        const blob = await response.blob();
        const reader = new FileReader();
        await new Promise((resolve) => {
          reader.onloadend = resolve;
          reader.readAsDataURL(blob);
        });
        const imgData = reader.result as string;
        doc.addImage(imgData, 'PNG', 14, 10, 40, 28);
      } catch (e) {
        console.warn('No se pudo cargar el logo', e);
      }
      
      const r = reporteSavedInfo;
      const tBultos = r.total_bultos || data.filter(d => d.fecha_produccion === r.fecha && d.turno === r.turno).reduce((s, d) => s + (d.bultos || 0), 0);
      const baches = r.baches_dosificados || 0;
      
      doc.setFontSize(22);
      doc.setTextColor(40, 40, 40);
      doc.text('Reporte de Cumplimiento', 60, 20);
      
      doc.setFontSize(11);
      doc.setTextColor(80, 80, 80);
      
      // Fila 1: Fecha y Turno
      doc.setFont("helvetica", "bold");
      doc.text('Fecha:', 60, 30);
      doc.setFont("helvetica", "normal");
      doc.text(r.fecha, 75, 30);
      
      doc.setFont("helvetica", "bold");
      doc.text('Turno:', 120, 30);
      doc.setFont("helvetica", "normal");
      doc.text(r.turno, 135, 30);
      
      // Fila 2: Supervisor
      doc.setFont("helvetica", "bold");
      doc.text('Supervisor:', 60, 38);
      doc.setFont("helvetica", "normal");
      doc.text(r.supervisor || 'N/A', 84, 38);
      
      // Fila 3: Dosificador
      doc.setFont("helvetica", "bold");
      doc.text('Dosificador:', 60, 46);
      doc.setFont("helvetica", "normal");
      doc.text(r.dosificador || 'N/A', 84, 46);
      
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text('Cumplimiento del Turno:', 14, 58);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Baches: ${baches} / ${META_BACHES} (${((baches/META_BACHES)*100).toFixed(1)}%)`, 14, 65);
      doc.text(`Bultos: ${tBultos} / ${META_BULTOS} (${((tBultos/META_BULTOS)*100).toFixed(1)}%)`, 14, 71);

      let startY = 85;
      if (r.observaciones) {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(200, 50, 50);
        doc.text('Observaciones:', 14, 80);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        const splitObs = doc.splitTextToSize(r.observaciones, 180);
        doc.text(splitObs, 14, 86);
        startY = 86 + (splitObs.length * 5) + 5;
      }
      
      const filteredRecords = data.filter(d => d.fecha_produccion === r.fecha && d.turno === r.turno);
      const tableData = filteredRecords.map(item => [
        item.lote,
        item.alimento,
        item.bultos,
        item.kg,
        item.observaciones || ''
      ]);

      autoTable(doc, {
        startY: startY,
        head: [['Lote', 'Alimento', 'Bultos', 'Kg', 'Novedad']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [46, 125, 50] }
      });

      if ('showSaveFilePicker' in window) {
        const win = window as unknown as { showSaveFilePicker: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: unknown) => Promise<void>; close: () => Promise<void> }> }> };
        const handle = await win.showSaveFilePicker({
          suggestedName: `Reporte_Turno_${r.fecha}_${r.turno}.pdf`,
          types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }]
        });
        const writable = await handle.createWritable();
        const pdfBlob = doc.output('blob');
        await writable.write(pdfBlob);
        await writable.close();
      } else {
        doc.save(`Reporte_Turno_${r.fecha}_${r.turno}.pdf`);
      }
    } catch (error: unknown) {
      const err = error as Error;
      if (err.name !== 'AbortError') {
        console.error("Error generating PDF:", err);
        alert("Hubo un error al generar/guardar el PDF: " + (err.message || "Usa la consola para ver detalles."));
      }
    }
  };

  return {
    activeTab, setActiveTab,
    reportMode, setReportMode,
    historialReportes, fetchHistorialReportes,
    reporteFecha, setReporteFecha,
    reporteTurno, setReporteTurno,
    reporteFormData, setReporteFormData,
    reporteSavedInfo, setReporteSavedInfo,
    reportFilterDesde, setReportFilterDesde,
    reportFilterHasta, setReportFilterHasta,
    explosionDesde, setExplosionDesde,
    explosionHasta, setExplosionHasta,
    explosionLoading, explosionData, explosionDetalle, explosionOps,
    handleSaveReporte, handleDeleteReporte, unlockReport,
    generarReporteExplosion, exportExplosionToExcel, exportExplosionToPDF,
    handleExportPDF, currentTotalBultos, META_BULTOS, META_BACHES
  };
}
