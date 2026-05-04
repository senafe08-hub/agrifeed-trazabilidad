import { useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase, createDespacho } from '../lib/supabase';
import { toast } from '../components/Toast';
import { DespachoEncabezado, DespachoDetalle } from '../lib/types';

export function useDespachosReportes(
  canEdit: boolean,
  filteredDespachos: DespachoEncabezado[],
  loadDespachos: () => Promise<void>
) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Export to Excel (master‑detail) ──
  const exportToExcel = useCallback(async () => {
    let rows = [] as Record<string, unknown>[];
    filteredDespachos.forEach(enc => {
      const base = {
        Fecha: enc.fecha,
        Remisión: enc.remision,
        Cliente: enc.cliente?.nombre,
        Granja: enc.granja?.nombre || '',
        Placa: enc.vehiculo?.placa,
        Conductor: enc.conductor,
        Observaciones: enc.observaciones || '',
        Estado: enc.estado,
      };
      if (enc.detalle && enc.detalle.length) {
        enc.detalle.forEach((det: DespachoDetalle) => {
          rows.push({
            ...base,
            OP: det.op,
            Alimento: typeof det.alimento === 'object' ? (det.alimento as { descripcion?: string })?.descripcion : String(det.alimento || ''),
            'Cant. Entregada': det.cantidad_entregada,
            'Cant. Despachada': det.cantidad_despachada_acumulada,
            'Cant. A Despachar': det.cantidad_a_despachar,
            ObservaciónDetalle: det.observaciones || '',
          });
        });
      } else {
        rows.push(base);
      }
    });
    if (rows.length === 0) { alert('No hay datos para exportar'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DESPACHOS');
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as unknown as { showSaveFilePicker: (opts: Record<string, unknown>) => Promise<{ createWritable: () => Promise<{ write: (data: unknown) => Promise<void>, close: () => Promise<void> }> }> }).showSaveFilePicker({
          suggestedName: 'Despachos.xlsx',
          types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
        await writable.close();
      } else {
        XLSX.writeFile(wb, 'Despachos.xlsx');
      }
    } catch (e: unknown) {
      const error = e as Error;
      if (error.name !== 'AbortError') alert('Error al exportar: ' + error.message);
    }
  }, [filteredDespachos]);

  // ── Import from Excel ──
  const handleImportExcel = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);
      if (rows.length === 0) return toast.error('El archivo está vacío.');

      // Group rows by Remisión
      const groups: Record<string, Record<string, unknown>[]> = {};
      for (const r of rows) {
        const key = String(r['Remisión'] || r['Remision'] || 'sin_remision');
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      }

      let imported = 0;
      for (const [, group] of Object.entries(groups)) {
        const first = group[0];
        // Look up cliente_id by name
        const { data: clienteMatch } = await supabase
          .from('maestro_clientes')
          .select('codigo_sap')
          .ilike('nombre', `%${first.Cliente || ''}%`)
          .limit(1);
        const clienteId = clienteMatch?.[0]?.codigo_sap || null;

        // Look up vehiculo_id by placa
        const { data: vehiculoMatch } = await supabase
          .from('maestro_vehiculos')
          .select('id')
          .eq('placa', first.Placa || '')
          .limit(1);
        const vehiculoId = vehiculoMatch?.[0]?.id || null;

        // Look up granja_id by nombre
        const { data: granjaMatch } = await supabase
          .from('maestro_granjas')
          .select('id')
          .ilike('nombre', `%${first.Granja || ''}%`)
          .limit(1);
        const granjaId = granjaMatch?.[0]?.id || null;

        const encabezado = {
          fecha: String(first.Fecha || new Date().toISOString().split('T')[0]),
          remision: String(first['Remisión'] || first['Remision'] || ''),
          cliente_id: clienteId ? Number(clienteId) : '',
          vehiculo_id: vehiculoId ? Number(vehiculoId) : '',
          granja_id: granjaId ? Number(granjaId) : '',
          conductor: String(first.Conductor || ''),
          observaciones: String(first.Observaciones || ''),
          estado: String(first.Estado || 'borrador'),
        };
        const detalles = group.map(r => ({
          op: String(r.OP || r.op || ''),
          cantidad_a_despachar: Number(r['Cant. A Despachar'] || r['Cant. Despachada'] || 0),
          bultos_danados: 0,
        }));
        await createDespacho(encabezado, detalles);
        imported++;
      }
      toast.success(`Se importaron ${imported} despachos correctamente.`);
      await loadDespachos();
    } catch (err: unknown) {
      toast.error('Error al importar: ' + (err as Error).message);
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [canEdit, loadDespachos]);

  // ── Generate PDF Remisión ──
  const generateRemisionPDF = useCallback(async (item: DespachoEncabezado) => {
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;

    // Try load logo
    let logoImg: string | null = null;
    try {
      const resp = await fetch('/logo-agrifeed.png');
      const blob = await resp.blob();
      logoImg = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { /* no logo */ }

    // ── Header ──
    if (logoImg) {
      doc.addImage(logoImg, 'PNG', pageW - margin - 45, margin, 45, 18);
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('AGRIFEED S.A.S-', margin, margin + 4);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('NIT. 900.959.683-1', margin, margin + 9);
    doc.text('Zona Franca Palermo Kilometro 1', margin, margin + 13);
    doc.text('Vía Barranquilla - Ciénaga', margin, margin + 17);

    // ── Remisión Title ──
    const yRem = margin + 28;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('REMISIÓN', margin, yRem);
    doc.setTextColor(200, 30, 30);
    doc.setFontSize(16);
    doc.text(String(item.remision || 'BORRADOR'), margin + 40, yRem);
    doc.setTextColor(0, 0, 0);

    // Fecha / Hora
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const fechaStr = item.fecha || '';
    const horaStr = item.hora || '';
    doc.text(`Fecha: ${fechaStr}`, pageW - margin - 50, yRem);
    if (horaStr) doc.text(`Hora: ${horaStr}`, pageW - margin - 50, yRem + 6);

    // ── Info Fields ──
    const yInfo = yRem + 10;
    doc.setFontSize(9);
    doc.text(`Centro de Costos: AGRIFEED SAS`, margin, yInfo);
    doc.text(`Ordenado por: Marco Munive`, margin + 100, yInfo);
    doc.text(`Cliente: ${item.cliente?.nombre || '—'}`, margin, yInfo + 6);
    if (item.granja?.nombre) {
      doc.text(`Granja: ${item.granja.nombre}`, margin + 100, yInfo + 6);
    }
    doc.text(`Entregado por: ${item.entregado_por || '____________________'}`, margin, yInfo + 12);

    // ── Detail Table ──
    const tableY = yInfo + 20;
    const totalBultos = item.detalle?.reduce((s: number, d: DespachoDetalle) => s + (d.cantidad_a_despachar || 0), 0) || 0;
    const bodyRows = (item.detalle || []).map((d: DespachoDetalle) => [
      d.op || '',
      typeof d.alimento === 'object' ? (d.alimento as { descripcion?: string })?.descripcion || '—' : String(d.alimento || '—'),
      'Bultos',
      d.cantidad_a_despachar || 0,
    ]);

    autoTable(doc, {
      startY: tableY,
      head: [['OP', 'ARTÍCULO', 'UNIDAD', 'CANTIDAD']],
      body: bodyRows,
      foot: [['', '', 'TOTAL', totalBultos]],
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [27, 94, 32], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 244, 238], textColor: [27, 94, 32], fontStyle: 'bold', fontSize: 10 },
      margin: { left: margin, right: margin },
      tableWidth: pageW - margin * 2,
    });

    // ── Observaciones ──
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || tableY + 60;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES:', margin, finalY + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(item.observaciones || '', margin + 35, finalY + 10);

    // ── Footer Legal ──
    const yFoot = finalY + 25;
    doc.setFontSize(7);
    doc.text(
      'Recibí de conformidad lo relacionado en esta remisión. En caso de pérdida autorizo a Industrias Puropollo S.A.S. descontar de mis salarios,',
      margin, yFoot
    );
    doc.text(
      'vacaciones y demás prestaciones sociales o compensaciones a que tenga derecho. En señal de aceptación firmo.',
      margin, yFoot + 4
    );

    // Signature fields
    const ySig = yFoot + 14;
    doc.setFontSize(9);
    doc.text(`Entregado por: ${item.entregado_por || '____________________________'}`, margin, ySig);
    doc.text(`Nombre Transportador: ${item.conductor || '________________'}`, pageW / 2, ySig);
    doc.text(`Firma y Placa Transportador: ${item.vehiculo?.placa || '________'}`, margin, ySig + 8);

    // Save
    const fileName = `Remision_${item.remision || 'borrador'}_${item.fecha}.pdf`;
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as unknown as { showSaveFilePicker: (opts: Record<string, unknown>) => Promise<{ createWritable: () => Promise<{ write: (data: unknown) => Promise<void>, close: () => Promise<void> }> }> }).showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(doc.output('arraybuffer'));
        await writable.close();
      } else {
        doc.save(fileName);
      }
      toast.success('Remisión PDF generada');
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') toast.error('Error al generar PDF: ' + (err as Error).message);
    }
  }, []);

  return {
    fileInputRef,
    exportToExcel,
    handleImportExcel,
    generateRemisionPDF
  };
}
