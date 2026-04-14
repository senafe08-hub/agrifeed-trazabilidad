# -*- coding: utf-8 -*-
"""
Generador de Informe PDF – Agrifeed Trazabilidad (v4 - Con tildes y ortografía correcta)
Genera un documento PDF profesional y exhaustivo con capturas reales de cada
módulo, pestaña, formulario y reporte de la aplicación.
"""

import os
import sys
import io

# Forzar stdout en UTF-8 para evitar errores de encoding en Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.units import inch, mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, Image, KeepTogether, HRFlowable
    )
    from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.lib.utils import ImageReader
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'reportlab'])
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.units import inch, mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, Image, KeepTogether, HRFlowable
    )
    from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.lib.utils import ImageReader

from datetime import datetime

# ─── CONFIGURACIÓN ───
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(OUTPUT_DIR, '..', 'Informe_Agrifeed_Trazabilidad.pdf')
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, 'screenshots')

# ─── COLORES ───
GREEN_DARK  = colors.HexColor('#1B5E20')
GREEN_MID   = colors.HexColor('#2E7D32')
GREEN_LIGHT = colors.HexColor('#E8F5E9')
GREEN_BG    = colors.HexColor('#F1F8E9')
GOLD        = colors.HexColor('#F59E0B')
BLUE        = colors.HexColor('#3B82F6')
PURPLE      = colors.HexColor('#8B5CF6')
RED         = colors.HexColor('#EF4444')
GRAY_BRD    = colors.HexColor('#E2E8F0')
GRAY_TXT    = colors.HexColor('#64748B')
WHITE       = colors.white
DARK_BG     = colors.HexColor('#0F172A')

# ─── ESTILOS ───
styles = getSampleStyleSheet()
_add = styles.add
_add(ParagraphStyle('CoverTitle', parent=styles['Title'],
    fontSize=36, textColor=WHITE, alignment=TA_CENTER,
    spaceAfter=10, fontName='Helvetica-Bold', leading=44))
_add(ParagraphStyle('CoverSub', parent=styles['Normal'],
    fontSize=16, textColor=colors.HexColor('#C8E6C9'),
    alignment=TA_CENTER, spaceAfter=6, fontName='Helvetica', leading=22))
_add(ParagraphStyle('SecTitle', parent=styles['Heading1'],
    fontSize=22, textColor=GREEN_DARK, fontName='Helvetica-Bold',
    spaceAfter=14, spaceBefore=20, leading=28))
_add(ParagraphStyle('SubTitle', parent=styles['Heading2'],
    fontSize=15, textColor=GREEN_MID, fontName='Helvetica-Bold',
    spaceAfter=8, spaceBefore=14, leading=20))
_add(ParagraphStyle('Body2', parent=styles['Normal'],
    fontSize=10.5, textColor=colors.HexColor('#334155'),
    fontName='Helvetica', alignment=TA_JUSTIFY, spaceAfter=8, leading=15))
_add(ParagraphStyle('BulletAg', parent=styles['Normal'],
    fontSize=10.5, textColor=colors.HexColor('#334155'),
    fontName='Helvetica', leftIndent=20, spaceAfter=4, leading=14))
_add(ParagraphStyle('Cap', parent=styles['Normal'],
    fontSize=9, textColor=GRAY_TXT, fontName='Helvetica-Oblique',
    alignment=TA_CENTER, spaceAfter=12, spaceBefore=4))
_add(ParagraphStyle('NoteS', parent=styles['Normal'],
    fontSize=9.5, textColor=colors.HexColor('#1E40AF'),
    fontName='Helvetica-Oblique', leftIndent=12, spaceAfter=6, leading=13))

# ─── FUNCIONES AUXILIARES ───
def hr():
    return HRFlowable(width="100%", thickness=2, color=GREEN_MID, spaceBefore=4, spaceAfter=12)

def sec(t):
    return Paragraph(t, styles['SecTitle'])

def sub(t):
    return Paragraph(t, styles['SubTitle'])

def body(t):
    return Paragraph(t, styles['Body2'])

def bul(t):
    return Paragraph('  \u2022 ' + t, styles['BulletAg'])

def cap(t):
    return Paragraph(t, styles['Cap'])

def note(t):
    return Paragraph('\u2139\ufe0f  ' + t, styles['NoteS'])

def img(filename, caption_text, max_w=490, max_h=330):
    """Inserta una captura de pantalla con marco verde y pie de foto."""
    path = os.path.join(SCREENSHOTS_DIR, filename)
    els = []
    if os.path.exists(path):
        reader = ImageReader(path)
        iw, ih = reader.getSize()
        ratio = ih / iw
        w = min(max_w, iw)
        h = w * ratio
        if h > max_h:
            h = max_h
            w = h / ratio
        image = Image(path, width=w, height=h)
        frame = Table([[image]], colWidths=[w + 8])
        frame.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 1.5, GREEN_MID),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FAFAFA')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        els.append(Spacer(1, 6))
        els.append(frame)
        els.append(cap(caption_text))
    else:
        els.append(body(f'<i>[Captura no disponible: {filename}]</i>'))
    return els

def mk_table(headers, data, widths=None):
    """Tabla estilizada con encabezado verde Agrifeed."""
    td = [headers] + data
    t = Table(td, colWidths=widths, repeatRows=1) if widths else Table(td, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GREEN_DARK),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('TOPPADDING', (0, 1), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BRD),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, GREEN_BG]),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    return t

def flow_diagram(width=490, height=65, steps=None):
    """Diagrama de flujo horizontal con cajas de colores."""
    d = Drawing(width, height)
    if not steps:
        return d
    n = len(steps)
    bw = min(100, (width - 30*(n-1)) / n)
    bh = 38
    gap = (width - n * bw) / max(n - 1, 1)
    y = (height - bh) / 2
    clrs = [GOLD, GREEN_MID, BLUE, PURPLE, RED, colors.HexColor('#06B6D4')]
    for i, s in enumerate(steps):
        x = i * (bw + gap)
        c = clrs[i % len(clrs)]
        d.add(Rect(x, y, bw, bh, fillColor=c, strokeColor=None, rx=6, ry=6))
        d.add(String(x + bw/2, y + bh/2 + 4, s,
                     fontSize=8, fontName='Helvetica-Bold',
                     fillColor=WHITE, textAnchor='middle'))
        if i < n - 1:
            ax = x + bw + 4
            ay = y + bh / 2
            d.add(Line(ax, ay, ax + gap - 8, ay, strokeColor=c, strokeWidth=2))
            d.add(Polygon(
                points=[ax+gap-8, ay+4, ax+gap-2, ay, ax+gap-8, ay-4],
                fillColor=clrs[(i+1) % len(clrs)],
                strokeColor=None
            ))
    return d


# ─── PLANTILLAS DE PÁGINA ───
def cover_page(canvas, doc):
    """Fondo de la portada."""
    canvas.saveState()
    w, h = letter
    canvas.setFillColor(GREEN_DARK)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)
    # Franja diagonal decorativa
    canvas.setFillColor(GREEN_MID)
    p = canvas.beginPath()
    p.moveTo(0, h*0.35); p.lineTo(w, h*0.55)
    p.lineTo(w, h*0.45); p.lineTo(0, h*0.25); p.close()
    canvas.drawPath(p, fill=1, stroke=0)
    # Barra inferior
    canvas.setFillColor(DARK_BG)
    canvas.rect(0, 0, w, 50, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont('Helvetica', 8)
    canvas.drawCentredString(w/2, 30,
        'AGRIFEED S.A.S  \u2014  NIT 900.959.683-1  \u2014  Zona Franca Palermo Km 1, V\u00eda Barranquilla - Ci\u00e9naga')
    canvas.drawCentredString(w/2, 18,
        f'Documento generado el {datetime.now().strftime("%d/%m/%Y a las %H:%M")}')
    canvas.restoreState()

def normal_page(canvas, doc):
    """Encabezado y pie de página estándar."""
    canvas.saveState()
    w, h = letter
    canvas.setFillColor(GREEN_DARK)
    canvas.rect(0, h-35, w, 35, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont('Helvetica-Bold', 10)
    canvas.drawString(40, h-22, 'AGRIFEED TRAZABILIDAD \u2014 Informe Funcional Detallado')
    canvas.setFont('Helvetica', 8)
    canvas.drawRightString(w-40, h-22, f'P\u00e1gina {doc.page}')
    canvas.setFillColor(GREEN_LIGHT)
    canvas.rect(0, 0, w, 25, fill=1, stroke=0)
    canvas.setFillColor(GRAY_TXT)
    canvas.setFont('Helvetica', 7)
    canvas.drawCentredString(w/2, 10,
        f'\u00a9 {datetime.now().year} Agrifeed S.A.S \u2014 Documento confidencial \u2014 Plataforma de trazabilidad integral')
    canvas.restoreState()


# ═══════════════════════════════════════════════════════════════
# CONSTRUCCIÓN DEL DOCUMENTO
# ═══════════════════════════════════════════════════════════════
def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT_FILE, pagesize=letter,
        topMargin=55, bottomMargin=45, leftMargin=40, rightMargin=40
    )
    s = []  # historia (story)

    # ─── PORTADA ───────────────────────────────────────────
    s.append(Spacer(1, 150))
    s.append(Paragraph('AGRIFEED', styles['CoverTitle']))
    s.append(Paragraph('TRAZABILIDAD', styles['CoverTitle']))
    s.append(Spacer(1, 20))
    s.append(Paragraph('Informe Funcional Detallado de la Aplicaci\u00f3n', styles['CoverSub']))
    s.append(Spacer(1, 10))
    s.append(Paragraph('Gu\u00eda Pr\u00e1ctica con Capturas de Pantalla Reales', styles['CoverSub']))
    s.append(Spacer(1, 40))
    vi = ParagraphStyle('vi', parent=styles['Normal'], fontSize=11,
                        textColor=colors.HexColor('#A5D6A7'),
                        alignment=TA_CENTER, fontName='Helvetica')
    s.append(Paragraph(f'Versi\u00f3n 2.0 \u2014 {datetime.now().strftime("%B %Y")}', vi))
    s.append(Paragraph('Aplicaci\u00f3n de Escritorio (Tauri + React + Supabase)', vi))
    s.append(PageBreak())

    # ─── TABLA DE CONTENIDO ────────────────────────────────
    s.append(sec('TABLA DE CONTENIDO'))
    s.append(hr())
    toc = [
        ('1',    'Introducci\u00f3n y Visi\u00f3n General'),
        ('2',    'Acceso al Sistema \u2014 Pantalla de Login'),
        ('3',    'Dashboard (Panel de Control)'),
        ('3.1',  '  KPIs Principales y Secundarios'),
        ('3.2',  '  Gr\u00e1ficas Interactivas'),
        ('3.3',  '  Cumplimiento de Supervisores y Dosificadores'),
        ('4',    'Maestro de Datos'),
        ('4.1',  '  Alimentos'),
        ('4.2',  '  Clientes'),
        ('4.3',  '  Veh\u00edculos'),
        ('4.4',  '  Granjas'),
        ('5',    'Programaci\u00f3n de Producci\u00f3n'),
        ('5.1',  '  Tabla de \u00d3rdenes de Producci\u00f3n (OPs)'),
        ('5.2',  '  Cat\u00e1logo de F\u00f3rmulas'),
        ('5.3',  '  Asociar OP \u2194 F\u00f3rmula'),
        ('5.4',  '  Explosi\u00f3n de Traslado de Materia Prima'),
        ('6',    'Producci\u00f3n'),
        ('6.1',  '  Registros de Entrega'),
        ('6.2',  '  Formulario de Nueva Entrega'),
        ('6.3',  '  Reporte de Turno'),
        ('6.4',  '  Estado de \u00d3rdenes (OP)'),
        ('6.5',  '  Reporte Explosi\u00f3n de Producci\u00f3n'),
        ('7',    'Log\u00edstica (Despachos)'),
        ('7.1',  '  Tabla de Despachos'),
        ('7.2',  '  Detalle Expandido'),
        ('7.3',  '  Formulario Nuevo Despacho'),
        ('7.4',  '  Formulario de Edici\u00f3n'),
        ('7.5',  '  Inventario de Materias Primas'),
        ('8',    'Facturaci\u00f3n'),
        ('8.1',  '  Creaci\u00f3n de Pedido'),
        ('8.2',  '  Formulario de Pedido'),
        ('8.3',  '  Cartera / Liberaci\u00f3n'),
        ('8.4',  '  Asignaci\u00f3n de Factura'),
        ('8.5',  '  Hist\u00f3rico de Facturaci\u00f3n'),
        ('8.6',  '  Dashboard de Cartera'),
        ('9',    'Trazabilidad'),
        ('10',   'Administraci\u00f3n'),
        ('10.1', '  Usuarios'),
        ('10.2', '  Roles y Permisos'),
        ('10.3', '  Log de Auditor\u00eda'),
        ('11',   'Sistema de Roles y Permisos'),
        ('12',   'Cat\u00e1logo Completo de Reportes'),
        ('13',   'Flujo Operativo Completo'),
    ]
    td = []
    for num, title in toc:
        td.append([
            Paragraph(f'<b>{num}</b>', styles['Body2']),
            Paragraph(title, styles['Body2'])
        ])
    tt = Table(td, colWidths=[40, 430])
    tt.setStyle(TableStyle([
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('LINEBELOW', (1,0), (1,-1), 0.3, GRAY_BRD),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    s.append(tt)
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 1. INTRODUCCIÓN
    # ═══════════════════════════════════════════════════════
    s.append(sec('1. Introducci\u00f3n y Visi\u00f3n General'))
    s.append(hr())
    s.append(body(
        '<b>Agrifeed Trazabilidad</b> es una aplicaci\u00f3n de escritorio integral desarrollada para '
        '<b>AGRIFEED S.A.S</b> (NIT 900.959.683-1), empresa dedicada a la producci\u00f3n y '
        'distribuci\u00f3n de alimentos concentrados para animales. La aplicaci\u00f3n cubre el ciclo '
        'operativo completo: Programaci\u00f3n \u2192 Producci\u00f3n \u2192 Log\u00edstica '
        '\u2192 Facturaci\u00f3n \u2192 Trazabilidad.'
    ))
    s.append(Spacer(1, 8))
    s.append(sub('Stack Tecnol\u00f3gico'))
    s.append(mk_table(
        ['Componente', 'Tecnolog\u00eda', 'Descripci\u00f3n'],
        [
            ['Frontend',          'React + TypeScript + Vite',   'Interfaz moderna y reactiva'],
            ['Escritorio',        'Tauri (Rust)',                  'App nativa Windows (.EXE)'],
            ['Base de Datos',     'Supabase (PostgreSQL)',         'Almacenamiento en la nube'],
            ['Gr\u00e1ficas',    'Recharts',                     'Gr\u00e1ficas interactivas'],
            ['Exportaciones',     'XLSX / jsPDF',                 'Excel y PDF con estilos corporativos'],
            ['Autenticaci\u00f3n','Local + Supabase Auth',        'Login por credenciales y rol'],
            ['Actualizaciones',   'Tauri Updater',                'Auto-actualizaci\u00f3n v\u00eda GitHub'],
        ],
        widths=[90, 155, 225]
    ))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 2. LOGIN
    # ═══════════════════════════════════════════════════════
    s.append(sec('2. Acceso al Sistema \u2014 Pantalla de Login'))
    s.append(hr())
    s.append(body(
        'La aplicaci\u00f3n requiere autenticaci\u00f3n para acceder. Cada usuario tiene un correo '
        'electr\u00f3nico, contrase\u00f1a y rol asignado que determina sus permisos dentro del sistema.'
    ))
    s.append(Spacer(1, 4))
    s.append(bul('<b>Campo Correo Electr\u00f3nico:</b> Email del usuario registrado en el sistema.'))
    s.append(bul('<b>Campo Contrase\u00f1a:</b> Contrase\u00f1a asignada por el Administrador.'))
    s.append(bul('<b>Bot\u00f3n Iniciar Sesi\u00f3n:</b> Valida credenciales y redirige al Dashboard.'))
    s.append(bul('<b>Logo corporativo:</b> Identidad visual de Agrifeed S.A.S.'))
    s.extend(img('login_page.png',
        'Captura real: Pantalla de inicio de sesi\u00f3n con logo corporativo Agrifeed'))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 3. DASHBOARD
    # ═══════════════════════════════════════════════════════
    s.append(sec('3. Dashboard (Panel de Control)'))
    s.append(hr())
    s.append(body(
        'El Dashboard es la <b>pantalla principal</b> de la aplicaci\u00f3n. Presenta un resumen '
        'ejecutivo con <b>indicadores clave de rendimiento (KPIs)</b>, gr\u00e1ficos interactivos y '
        'una vista r\u00e1pida del estado de toda la operaci\u00f3n.'
    ))
    s.append(Spacer(1, 6))

    s.append(sub('3.1 KPIs Principales'))
    s.append(mk_table(
        ['KPI', 'Color', '\u00bfQu\u00e9 mide?'],
        [
            ['Programado', 'Amarillo', 'Total de bultos programados en el per\u00edodo seleccionado'],
            ['Producido',  'Verde',    'Total de bultos realmente entregados por producci\u00f3n'],
            ['Despachado', 'Azul',     'Total de bultos enviados en remisiones de despacho'],
            ['Facturado',  'Morado',   'Total de bultos incluidos en facturas procesadas'],
        ],
        widths=[100, 60, 320]
    ))

    s.append(sub('3.2 KPIs Secundarios'))
    s.append(mk_table(
        ['Indicador', 'Descripci\u00f3n'],
        [
            ['OPs Completas',   'Programado = Producido = Despachado = Facturado (y > 0)'],
            ['OPs Incompletas', 'Lotes con etapas pendientes en el flujo operativo'],
            ['Clientes Activos','N\u00famero de clientes \u00fanicos con OPs en el per\u00edodo'],
            ['KG Totales',      'Kilogramos totales programados (bultos \u00d7 40 kg)'],
        ],
        widths=[130, 350]
    ))
    s.extend(img('dashboard_page.png',
        'Captura real: Dashboard principal con KPIs, filtros de per\u00edodo y barra lateral de navegaci\u00f3n'))
    s.append(PageBreak())

    s.append(sub('3.3 Gr\u00e1ficas del Dashboard'))
    s.append(bul('<b>Tendencia Semanal (Embudo Operativo):</b> Gr\u00e1fica de \u00e1reas con la evoluci\u00f3n semanal de Programado, Producido, Despachado y Facturado.'))
    s.append(bul('<b>Distribuci\u00f3n por Categor\u00eda:</b> Gr\u00e1fica de torta (Pie Chart) con el porcentaje de bultos por tipo de alimento.'))
    s.append(bul('<b>Producci\u00f3n Diaria:</b> Gr\u00e1fica de barras con bultos entregados por d\u00eda (\u00faltimos 21 d\u00edas).'))
    s.append(bul('<b>Top Clientes:</b> Barras horizontales con los 8 clientes de mayor volumen.'))
    s.extend(img('dashboard_charts_page.png',
        'Captura real: Gr\u00e1ficas interactivas del Dashboard \u2014 tendencia semanal, distribuci\u00f3n y top clientes'))

    s.append(sub('3.4 Cumplimiento de Supervisores y Dosificadores'))
    s.append(body(
        'Secci\u00f3n inferior del Dashboard con barras de progreso que comparan el desempe\u00f1o '
        'real contra las metas establecidas:'
    ))
    s.append(bul('<b>Cumplimiento Supervisores:</b> Promedio de bultos por turno vs. meta de 5.500 bultos.'))
    s.append(bul('<b>Cumplimiento Dosificadores:</b> Promedio de baches por turno vs. meta de 108 baches.'))
    s.extend(img('dashboard_cumplimiento.png',
        'Captura real: Secci\u00f3n de cumplimiento de supervisores y dosificadores con barras de progreso'))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 4. MAESTRO DE DATOS
    # ═══════════════════════════════════════════════════════
    s.append(sec('4. Maestro de Datos'))
    s.append(hr())
    s.append(body(
        'Base de configuraci\u00f3n del sistema. Gestiona los cat\u00e1logos maestros que '
        'alimentan todos los m\u00f3dulos. Cada operaci\u00f3n CRUD genera un registro de '
        'auditor\u00eda autom\u00e1tico. Incluye b\u00fasqueda global y filtros por columna con '
        'autocompletado.'
    ))
    s.append(Spacer(1, 6))

    # 4.1 Alimentos
    s.append(sub('4.1 Pesta\u00f1a: Alimentos'))
    s.append(body('Cat\u00e1logo de alimentos concentrados registrados en el sistema:'))
    s.append(mk_table(
        ['Campo', 'Descripci\u00f3n'],
        [
            ['C\u00f3digo SAP',  'Identificador \u00fanico num\u00e9rico del alimento en SAP'],
            ['Descripci\u00f3n', 'Nombre completo (ej: CERDO ENGORDE PREMEX)'],
            ['Categor\u00eda',   'Tipo de alimento: Cerdo, Pollo, Acu\u00edcola, Bovino, etc.'],
        ],
        widths=[120, 360]
    ))
    s.append(bul('<b>B\u00fasqueda global:</b> Filtra en todas las columnas simult\u00e1neamente.'))
    s.append(bul('<b>Filtros por columna:</b> Cada columna tiene campo de filtro con lista de valores.'))
    s.append(bul('<b>Exportar a Excel:</b> Descarga los datos filtrados en formato .xlsx.'))
    s.append(bul('<b>CRUD completo:</b> Crear, editar y eliminar registros con confirmaci\u00f3n.'))
    s.extend(img('maestro_alimentos.png',
        'Captura real: Maestro de Datos \u2014 Pesta\u00f1a Alimentos con tabla, b\u00fasqueda y filtros por columna'))

    # 4.2 Clientes
    s.append(sub('4.2 Pesta\u00f1a: Clientes'))
    s.append(mk_table(
        ['Campo', 'Descripci\u00f3n'],
        [
            ['C\u00f3digo SAP',      'Identificador \u00fanico del cliente en SAP'],
            ['Nombre',              'Raz\u00f3n social del cliente'],
            ['Poblaci\u00f3n',       'Ciudad o municipio del cliente'],
            ['Tipo de Pago',        'Contado o Cr\u00e9dito'],
            ['L\u00edmite Cr\u00e9dito', 'Cupo m\u00e1ximo autorizado (solo roles autorizados)'],
            ['Plazo de Pago',       'D\u00edas de plazo para pago a cr\u00e9dito'],
        ],
        widths=[130, 350]
    ))
    s.append(note(
        'Solo los roles Administrador, Analista de Costos y Analista de Cartera '
        'pueden editar los l\u00edmites de cr\u00e9dito.'
    ))
    s.extend(img('maestro_clientes.png',
        'Captura real: Maestro de Datos \u2014 Pesta\u00f1a Clientes con gesti\u00f3n de cupos de cr\u00e9dito'))
    s.append(PageBreak())

    # 4.3 Vehículos
    s.append(sub('4.3 Pesta\u00f1a: Veh\u00edculos'))
    s.append(body('Registro de veh\u00edculos disponibles para los despachos:'))
    s.append(mk_table(
        ['Campo', 'Descripci\u00f3n'],
        [
            ['Placa',   'N\u00famero de placa del veh\u00edculo (ej: ABC-123)'],
            ['Conductor', 'Nombre del conductor asignado al veh\u00edculo'],
            ['Estado',  'Activo o Inactivo'],
        ],
        widths=[120, 360]
    ))
    s.extend(img('maestro_vehiculos.png',
        'Captura real: Maestro de Datos \u2014 Pesta\u00f1a Veh\u00edculos con placas y conductores'))

    # 4.4 Granjas
    s.append(sub('4.4 Pesta\u00f1a: Granjas'))
    s.append(body(
        'Lista de granjas destino que se seleccionan al momento de crear un despacho. '
        'Permite gestionar los puntos de entrega de la mercader\u00eda.'
    ))
    s.extend(img('maestro_granjas.png',
        'Captura real: Maestro de Datos \u2014 Pesta\u00f1a Granjas (destinos de despacho)'))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 5. PROGRAMACIÓN
    # ═══════════════════════════════════════════════════════
    s.append(sec('5. Programaci\u00f3n de Producci\u00f3n'))
    s.append(hr())
    s.append(body(
        'Registra las <b>\u00d3rdenes de Producci\u00f3n (OPs)</b>. Cada OP representa un lote '
        'de alimento que debe producirse para un cliente espec\u00edfico. Es el punto de '
        'partida de todo el flujo operativo de la empresa.'
    ))

    # 5.1 Tabla OPs
    s.append(sub('5.1 Tabla de \u00d3rdenes de Producci\u00f3n'))
    s.append(mk_table(
        ['Campo', 'Descripci\u00f3n'],
        [
            ['Fecha',             'Fecha programada de producci\u00f3n'],
            ['Lote (OP)',         'N\u00famero \u00fanico de la orden de producci\u00f3n'],
            ['C\u00f3digo SAP',   'Referencia al alimento del cat\u00e1logo maestro'],
            ['Bultos',            'Cantidad objetivo de bultos (sacos de 40 kg)'],
            ['Baches',            'Cantidad de mezclas (baches) necesarias'],
            ['Cliente',           'Cliente destino de la producci\u00f3n'],
            ['Observaciones',     'Notas adicionales sobre la OP'],
        ],
        widths=[120, 360]
    ))
    s.append(bul('<b>CRUD completo:</b> Crear, editar y eliminar OPs individualmente.'))
    s.append(bul('<b>Importaci\u00f3n masiva Excel:</b> Detecta columnas autom\u00e1ticamente (FECHA, OP, C\u00d3DIGO SAP, BULTOS...).'))
    s.append(bul('<b>Exportaci\u00f3n a Excel:</b> Descarga las OPs filtradas con formato estilizado.'))
    s.extend(img('programacion_ops.png',
        'Captura real: Programaci\u00f3n \u2014 Tabla principal de OPs con filtros, b\u00fasqueda y acciones CRUD'))

    # 5.2 Catálogo Fórmulas
    s.append(sub('5.2 Cat\u00e1logo de F\u00f3rmulas'))
    s.append(body(
        'Las f\u00f3rmulas se organizan por <b>categor\u00eda de alimento</b>. Cada f\u00f3rmula '
        'contiene un listado de ingredientes clasificados por referencia: '
        '<b>MACROS</b>, <b>MICROS</b>, <b>MENORES</b>, <b>L\u00cdQUIDOS</b> y <b>EMPAQUES</b>.'
    ))
    s.append(mk_table(
        ['Campo', 'Descripci\u00f3n'],
        [
            ['Nombre',           'Nombre descriptivo (ej: CERDO LEVANTE PREMEX)'],
            ['Categor\u00eda',   'Categor\u00eda del alimento asociada'],
            ['Sacos/Bache',      'Rendimiento por bache: 35, 50 o 60 sacos'],
            ['Estado',           'Activa o Inactiva (solo activas se pueden asignar)'],
            ['Ingredientes',     'Lista de materias primas con KG por bache y referencia'],
        ],
        widths=[120, 360]
    ))
    s.extend(img('programacion_formulas.png',
        'Captura real: Cat\u00e1logo de F\u00f3rmulas agrupadas por categor\u00eda con detalle de ingredientes'))
    s.append(PageBreak())

    # 5.3 Asociar OP
    s.append(sub('5.3 Asociar OP \u2194 F\u00f3rmula'))
    s.append(body(
        'Permite vincular cada OP a una f\u00f3rmula activa del cat\u00e1logo. '
        'Los KPIs muestran el estado de la asignaci\u00f3n:'
    ))
    s.append(bul('<b>Total OPs:</b> Cantidad total de OPs en el per\u00edodo.'))
    s.append(bul('<b>Con F\u00f3rmula:</b> OPs que ya tienen f\u00f3rmula asignada.'))
    s.append(bul('<b>Sin F\u00f3rmula:</b> OPs pendientes de asignaci\u00f3n.'))
    s.extend(img('programacion_asociar.png',
        'Captura real: Asociar OP\u2194F\u00f3rmula con KPIs de estado y tabla de vinculaci\u00f3n'))

    # 5.4 Explosión
    s.append(sub('5.4 Explosi\u00f3n de Traslado de Materia Prima'))
    s.append(body(
        'Calcula autom\u00e1ticamente las materias primas necesarias para un conjunto de OPs '
        'seleccionadas, con el fin de gestionar el traslado del almac\u00e9n a producci\u00f3n:'
    ))
    s.append(bul('Filtrar por rango de fechas y/o cliente.'))
    s.append(bul('Calcula KG = Cantidad Base \u00d7 N\u00famero de Baches.'))
    s.append(bul('Consolida consumos por material (sumando todas las OPs).'))
    s.append(bul('Compara contra el stock actual del inventario.'))
    s.append(bul('<b>Liquidar:</b> Desconta los consumos del inventario de materias primas.'))
    s.append(bul('Exporta a <b>Excel</b> (con estilos) y <b>PDF</b> (con logo corporativo).'))
    s.extend(img('programacion_explosion.png',
        'Captura real: Explosi\u00f3n de Traslado \u2014 filtros de fechas y c\u00e1lculo de materias primas'))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 6. PRODUCCIÓN
    # ═══════════════════════════════════════════════════════
    s.append(sec('6. Producci\u00f3n'))
    s.append(hr())
    s.append(body(
        'Registra las entregas reales de producci\u00f3n. Indica cu\u00e1ntos baches y bultos '
        'se entregaron de un lote (OP) en una fecha y turno espec\u00edficos.'
    ))

    # 6.1 Registros
    s.append(sub('6.1 Registros de Entrega'))
    s.append(body(
        'Tabla principal con todas las entregas de producci\u00f3n. Incluye b\u00fasqueda, '
        'filtros de fecha y paginaci\u00f3n (100 registros por p\u00e1gina).'
    ))
    s.append(mk_table(
        ['Campo', 'Descripci\u00f3n'],
        [
            ['Fecha',           'Fecha de la entrega de producci\u00f3n'],
            ['Turno',           'Diurno o Nocturno'],
            ['Lote (OP)',       'N\u00famero de la orden de producci\u00f3n'],
            ['Baches',          'Cantidad de baches producidos en este registro'],
            ['Bultos',          'Cantidad de bultos (sacos) producidos'],
            ['Observaciones',   'Notas adicionales del operador'],
        ],
        widths=[120, 360]
    ))
    s.extend(img('produccion_registros.png',
        'Captura real: Producci\u00f3n \u2014 Tabla de registros de entrega con filtros y pagianaci\u00f3n'))

    # 6.2 Formulario
    s.append(sub('6.2 Formulario de Nueva Entrega'))
    s.append(body(
        'El formulario muestra autom\u00e1ticamente el alimento, el cliente, '
        'los baches y bultos acumulados hasta el momento, y los pendientes por entregar.'
    ))
    s.append(note(
        'Validaci\u00f3n inteligente: No permite registrar m\u00e1s baches que los programados para la OP. '
        'Si los bultos difieren m\u00e1s del 10% del rendimiento esperado, muestra una advertencia.'
    ))
    s.extend(img('produccion_formulario.png',
        'Captura real: Formulario de nueva entrega con acumulados, pendientes y validaciones'))
    s.append(PageBreak())

    # 6.3 Reporte Turno
    s.append(sub('6.3 Reporte de Turno'))
    s.append(body(
        'Res\u00famenes diarios que registran el supervisor, el dosificador, '
        'los baches dosificados y el total de bultos del turno. '
        'Estos datos alimentan las gr\u00e1ficas de cumplimiento del Dashboard.'
    ))
    s.append(bul('Guardar y editar reportes de turno (con desbloqueo de edici\u00f3n).'))
    s.append(bul('Eliminar reportes incorrectos.'))
    s.append(bul('Exportar cada reporte individual a PDF con logo corporativo.'))
    s.extend(img('produccion_reporte_turno.png',
        'Captura real: Lista de reportes de turno con supervisor, dosificador y totales'))

    # 6.4 Estado OPs
    s.append(sub('6.4 Estado de \u00d3rdenes (OP)'))
    s.append(body('Vista consolidada del avance de cada OP:'))
    s.append(bul('Baches: Programados vs. Acumulados vs. Pendientes.'))
    s.append(bul('Bultos: Programados vs. Acumulados vs. Pendientes.'))
    s.append(bul('Barra de progreso visual con colores seg\u00fan cumplimiento.'))
    s.append(bul('Filtro r\u00e1pido para mostrar solo las OPs con pendientes.'))
    s.extend(img('produccion_estado_ops.png',
        'Captura real: Estado de \u00d3rdenes \u2014 tabla consolidada con porcentajes de avance'))
    s.extend(img('produccion_estado_ops_barras.png',
        'Captura real: Detalle de barras de progreso con colores din\u00e1micos por nivel de cumplimiento'))

    # 6.5 Explosión producción
    s.append(sub('6.5 Reporte de Explosi\u00f3n de Producci\u00f3n'))
    s.append(body(
        'Calcula los consumos reales de materia prima basados en la producci\u00f3n '
        'registrada (no en la programaci\u00f3n). Exportable a Excel y PDF.'
    ))
    s.extend(img('produccion_explosion.png',
        'Captura real: Reporte Explosi\u00f3n de Producci\u00f3n \u2014 c\u00e1lculo de consumos reales de MP'))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 7. LOGÍSTICA
    # ═══════════════════════════════════════════════════════
    s.append(sec('7. Log\u00edstica (Despachos)'))
    s.append(hr())
    s.append(body(
        'Gestiona los despachos de mercanc\u00eda con estructura <b>maestro-detalle</b>: '
        'cada despacho tiene un encabezado (remisi\u00f3n) con m\u00faltiples \u00d3rdenes '
        'de Producci\u00f3n detalladas.'
    ))

    # 7.1 Tabla
    s.append(sub('7.1 Tabla de Despachos'))
    s.append(mk_table(
        ['KPI', 'Descripci\u00f3n'],
        [
            ['Total Despachos', 'Cantidad de remisiones registradas en el per\u00edodo filtrado'],
            ['Borradores',      'Despachos en estado borrador (a\u00fan no confirmados)'],
            ['Despachados',     'Despachos confirmados y enviados'],
            ['Total Bultos',    'Suma total de bultos despachados en el per\u00edodo'],
        ],
        widths=[130, 350]
    ))
    s.extend(img('despachos_page.png',
        'Captura real: Log\u00edstica \u2014 Tabla principal con KPIs y lista de despachos con filtros'))

    # 7.2 Detalle expandido
    s.append(sub('7.2 Detalle Expandido de un Despacho'))
    s.append(body(
        'Al expandir una fila, se muestra la <b>sub-tabla de OPs</b> con: alimento, '
        'cantidad de bultos despachados, bultos da\u00f1ados y observaciones por l\u00ednea.'
    ))
    s.extend(img('despachos_detalle_expandido.png',
        'Captura real: Despacho expandido mostrando OPs, alimentos, bultos despachados y da\u00f1ados'))
    s.extend(img('despachos_detalle.png',
        'Captura real: Vista completa del detalle de un despacho'))
    s.append(PageBreak())

    # 7.3 Formulario nuevo
    s.append(sub('7.3 Formulario de Nuevo Despacho'))
    s.append(body('Flujo de creaci\u00f3n de un despacho:'))
    s.append(flow_diagram(width=490, height=55,
        steps=['Encabezado', 'Agregar OPs', 'Guardar', 'PDF Remisi\u00f3n']))
    s.append(mk_table(
        ['Campo', 'Descripci\u00f3n'],
        [
            ['Remisi\u00f3n',        'N\u00famero consecutivo autom\u00e1tico'],
            ['Fecha / Hora',        'Fecha y hora del despacho'],
            ['Cliente',             'Selecci\u00f3n del cat\u00e1logo maestro de clientes'],
            ['Veh\u00edculo',        'Selecci\u00f3n del cat\u00e1logo maestro de veh\u00edculos'],
            ['Conductor',           'Auto-llenado al seleccionar el veh\u00edculo'],
            ['Entregado por',       'Persona responsable de la entrega'],
            ['Granja',              'Destino del despacho (del cat\u00e1logo de granjas)'],
            ['Estado',              'Borrador (editable) o Despachado (confirmado)'],
        ],
        widths=[130, 350]
    ))
    s.extend(img('despachos_formulario_nuevo.png',
        'Captura real: Formulario de creaci\u00f3n de nuevo despacho con todos sus campos'))

    # 7.4 Formulario edición
    s.append(sub('7.4 Formulario de Edici\u00f3n'))
    s.append(body(
        'Permite modificar el encabezado y las l\u00edneas de OPs de un despacho existente. '
        'Tambi\u00e9n permite cambiar el estado de Borrador a Despachado.'
    ))
    s.extend(img('despachos_formulario_editar.png',
        'Captura real: Formulario de edici\u00f3n con l\u00edneas de OPs y cambio de estado'))

    # 7.5 Inventario
    s.append(sub('7.5 Inventario de Materias Primas'))
    s.append(body('Panel integral para gestionar las existencias de materias primas:'))
    s.append(bul('<b>Stock actual:</b> Existencias por material con movimientos mensuales.'))
    s.append(bul('<b>Alertas de cobertura:</b> Cr\u00edtico (rojo), Advertencia (naranja), OK (verde).'))
    s.append(bul('<b>Entradas y Salidas:</b> Registro de movimientos del inventario.'))
    s.append(bul('<b>Consumos calculados:</b> Basados en liquidaciones de explosi\u00f3n.'))
    s.extend(img('logistica_inventario_panel.png',
        'Captura real: Panel de Inventario de Materias Primas con alertas de cobertura y stock'))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 8. FACTURACIÓN
    # ═══════════════════════════════════════════════════════
    s.append(sec('8. Facturaci\u00f3n'))
    s.append(hr())
    s.append(body(
        'Implementa un flujo completo de pedidos y facturaci\u00f3n con aprobaci\u00f3n '
        'por etapas. Es el m\u00f3dulo con mayor control de permisos por rol del sistema.'
    ))
    s.append(sub('Flujo de Facturaci\u00f3n'))
    s.append(flow_diagram(width=490, height=55,
        steps=['Pedido', 'Cartera', 'Liberaci\u00f3n', 'Factura']))
    s.append(cap('Figura: Flujo de estados del proceso de facturaci\u00f3n'))

    # 8.1 Creación Pedido
    s.append(sub('8.1 Creaci\u00f3n de Pedido'))
    s.append(body(
        'Registrar pedidos con OPs asociadas. Estados disponibles: '
        'PENDIENTE PAGO, PENDIENTE PV, VERIFICAR PEDIDO.'
    ))
    s.extend(img('facturacion_pedidos.png',
        'Captura real: Facturaci\u00f3n \u2014 Pesta\u00f1a Creaci\u00f3n de Pedido con KPIs y tabla'))

    # 8.2 Formulario pedido
    s.append(sub('8.2 Formulario de Creaci\u00f3n de Pedido'))
    s.append(body(
        'Panel de creaci\u00f3n que permite seleccionar el cliente, agregar OPs del pool '
        'de remisiones disponibles, y especificar cantidades a facturar por cada OP.'
    ))
    s.extend(img('facturacion_formulario_pedido.png',
        'Captura real: Formulario de creaci\u00f3n de pedido con selecci\u00f3n de OPs y cantidades'))
    s.append(PageBreak())

    # 8.3 Cartera
    s.append(sub('8.3 Cartera / Liberaci\u00f3n'))
    s.append(body(
        'El Analista de Cartera revisa los pedidos pendientes, verifica los l\u00edmites '
        'de cr\u00e9dito del cliente y libera los pedidos aprobados para facturaci\u00f3n.'
    ))
    s.extend(img('facturacion_cartera.png',
        'Captura real: Cartera/Liberaci\u00f3n \u2014 revisi\u00f3n de pedidos y aprobaci\u00f3n por analista'))

    # 8.4 Asignación
    s.append(sub('8.4 Asignaci\u00f3n de Factura'))
    s.append(body(
        'Asigna el n\u00famero de factura SAP y n\u00famero de PV a pedidos liberados. '
        'Cambia el estado a FACTURADO.'
    ))
    s.extend(img('facturacion_asignacion.png',
        'Captura real: Asignaci\u00f3n de Factura \u2014 ingreso de n\u00famero de factura y PV'))

    # 8.5 Histórico
    s.append(sub('8.5 Hist\u00f3rico de Facturaci\u00f3n'))
    s.append(body(
        'Consulta completa de todos los pedidos y facturas del sistema:'
    ))
    s.append(bul('B\u00fasqueda por n\u00famero de factura, pedido o cliente.'))
    s.append(bul('Anular pedidos y facturas existentes.'))
    s.append(bul('Marcar facturas como <b>"Matrizada"</b> (exclusivo del rol Coordinador PICIZ).'))
    s.append(bul('Exportar reporte PICIZ de consumo de materias primas.'))
    s.extend(img('facturacion_historico.png',
        'Captura real: Hist\u00f3rico de Facturaci\u00f3n con opciones de anulaci\u00f3n y matrizado'))

    # 8.6 Dashboard Cartera
    s.append(sub('8.6 Dashboard de Cartera'))
    s.append(body(
        'Panel anal\u00edtico con gr\u00e1ficas de cartera vencida, concentraci\u00f3n de '
        'clientes, vencimientos por edades y an\u00e1lisis de uso de cupos de cr\u00e9dito.'
    ))
    s.extend(img('facturacion_dashboard.png',
        'Captura real: Dashboard de Cartera \u2014 KPIs y resumen ejecutivo'))
    s.extend(img('facturacion_dashboard_graficas.png',
        'Captura real: Gr\u00e1ficas detalladas del Dashboard de Cartera (cartera por edades, top deudores)'))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 9. TRAZABILIDAD
    # ═══════════════════════════════════════════════════════
    s.append(sec('9. Trazabilidad'))
    s.append(hr())
    s.append(body(
        'Cuadro de mando que cruza datos de <b>todos los m\u00f3dulos</b> para mostrar, '
        'en un solo lugar, el estado completo de cada OP desde que se programa '
        'hasta que se factura.'
    ))

    s.append(sub('9.1 KPIs de Trazabilidad'))
    s.extend(img('trazabilidad_kpis.png',
        'Captura real: Trazabilidad \u2014 KPIs superiores con resumen del estado global'))

    s.append(sub('9.2 Tabla de Trazabilidad'))
    s.append(mk_table(
        ['Secci\u00f3n', 'Columnas que incluye'],
        [
            ['IDENTIFICACI\u00d3N', 'OP (Lote), Fecha de programaci\u00f3n, Producto, Cliente'],
            ['PRODUCCI\u00d3N',     'Programado vs. Entregado + Barra de progreso de fabricaci\u00f3n'],
            ['LOG\u00cdSTICA',     'Despachado / Da\u00f1ados + Barra de progreso de despacho'],
            ['COMERCIAL',          'Facturado + Estado final de la OP'],
        ],
        widths=[130, 350]
    ))

    s.append(sub('9.3 Estados de Trazabilidad'))
    s.append(bul('<b>Completo:</b> Programado = Producido = Despachado = Facturado (y > 0).'))
    s.append(bul('<b>Incompleto:</b> Tiene producci\u00f3n pero falta despacho o facturaci\u00f3n.'))
    s.append(bul('<b>Pendiente:</b> Sin entregas de producci\u00f3n registradas.'))
    s.extend(img('trazabilidad_tabla.png',
        'Captura real: Tabla de Trazabilidad completa con barras de progreso por etapa operativa'))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 10. ADMINISTRACIÓN
    # ═══════════════════════════════════════════════════════
    s.append(sec('10. Administraci\u00f3n'))
    s.append(hr())
    s.append(body(
        'Permite gestionar los usuarios del sistema, visualizar los roles y sus '
        'permisos, y consultar el log de auditor\u00eda de todas las acciones realizadas.'
    ))

    # 10.1 Usuarios
    s.append(sub('10.1 Gesti\u00f3n de Usuarios'))
    s.append(bul('Ver contrase\u00f1as con bot\u00f3n de ojo (alternar mostrar/ocultar).'))
    s.append(bul('Crear usuarios nuevos con rol asignado.'))
    s.append(bul('Editar informaci\u00f3n de usuarios existentes.'))
    s.append(bul('Activar o Desactivar usuarios.'))
    s.append(bul('Resetear contrase\u00f1as.'))
    s.append(note(
        'La lista de usuarios solo es visible para el rol <b>Administrador</b>. '
        'La Gerencia accede al m\u00f3dulo pero sin ver las credenciales.'
    ))
    s.extend(img('admin_usuarios.png',
        'Captura real: Administraci\u00f3n \u2014 Tabla de usuarios con roles, estados y contrase\u00f1as'))

    # 10.2 Roles
    s.append(sub('10.2 Roles y Permisos'))
    s.append(body(
        'Tabla descriptiva de cada rol del sistema con los m\u00f3dulos que puede '
        'ver y editar. Visible para los roles Administrador, Gerencia y Coordinador PICIZ.'
    ))
    s.extend(img('admin_roles.png',
        'Captura real: Vista de Roles y Permisos con descripci\u00f3n de acceso por rol'))

    # 10.3 Auditoría
    s.append(sub('10.3 Log de Auditor\u00eda'))
    s.append(body(
        'Registro cronol\u00f3gico de todas las acciones cr\u00edticas del sistema. '
        'Cada entrada registra: usuario, fecha/hora, m\u00f3dulo, tipo de acci\u00f3n y detalle.'
    ))
    s.append(bul('<b>CREATE:</b> Nuevos registros creados en cualquier m\u00f3dulo.'))
    s.append(bul('<b>UPDATE:</b> Registros modificados con detalle del cambio.'))
    s.append(bul('<b>DELETE:</b> Registros eliminados con su informaci\u00f3n previa.'))
    s.append(bul('<b>IMPORT:</b> Importaciones masivas desde archivos Excel.'))
    s.extend(img('admin_auditoria.png',
        'Captura real: Log de Auditor\u00eda con usuario, acci\u00f3n, m\u00f3dulo y detalle'))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 11. ROLES Y PERMISOS
    # ═══════════════════════════════════════════════════════
    s.append(sec('11. Sistema de Roles y Permisos'))
    s.append(hr())
    s.append(body(
        'La aplicaci\u00f3n implementa un sistema de <b>control de acceso basado en roles '
        '(RBAC)</b> granular. Cada usuario tiene un rol que determina qu\u00e9 m\u00f3dulos '
        'puede ver y cu\u00e1les puede editar.'
    ))
    s.append(mk_table(
        ['Rol', 'Descripci\u00f3n de Permisos'],
        [
            ['Administrador',           'Acceso total de lectura y escritura en todos los m\u00f3dulos'],
            ['Gerencia',                'Solo lectura en todos los m\u00f3dulos (sin edici\u00f3n)'],
            ['Analista de Costos',      'Lectura y escritura en todos los m\u00f3dulos operativos'],
            ['Auxiliar de Producci\u00f3n', 'Edita Programaci\u00f3n y Maestro; ve Producci\u00f3n y Log\u00edstica'],
            ['Supervisor Producci\u00f3n',  'Edita solo Producci\u00f3n; ve Programaci\u00f3n y Trazabilidad'],
            ['Auxiliar Log\u00edstica',    'Edita Despachos y Maestro; ve Trazabilidad y Producci\u00f3n'],
            ['Auxiliar Administrativa', 'Edita Asignaci\u00f3n de Facturas; ve m\u00f3dulos administrativos'],
            ['Coordinador Administrativo', 'Edita Pedidos y Anulaciones; ve m\u00f3dulos administrativos'],
            ['Coordinador PICIZ',       'Solo lectura global + Marca facturas como Matrizadas'],
            ['Analista de Cartera',     'Edita Cartera/Liberaci\u00f3n y Dashboard Cartera \u00fanicamente'],
        ],
        widths=[160, 320]
    ))

    s.append(Spacer(1, 10))
    s.append(sub('Matriz de Acceso por M\u00f3dulo'))
    modules = [
        'Dashboard', 'Maestro', 'Programaci\u00f3n', 'Producci\u00f3n',
        'Despachos', 'Facturaci\u00f3n', 'Trazabilidad', 'Admin'
    ]
    roles_hdr = ['Admin', 'Gcia', 'Costos', 'AuxProd', 'Sup.', 'Logist.', 'AuxAdm', 'Coord.', 'PICIZ', 'Cartera']
    mx = [
        ['R/W','R','R/W','-','-','-','-','-','R','-'],
        ['R/W','R','R/W','R/W','-','R/W','R','R','R','-'],
        ['R/W','R','R/W','R/W','R','R','R','R','R','-'],
        ['R/W','R','R/W','R','R/W','R','-','-','R','-'],
        ['R/W','R','R/W','R','-','R/W','R','R','R','-'],
        ['R/W','R','R/W','R*','-','-','R/W*','R/W*','R*','R/W*'],
        ['R/W','R','R/W','R','R','-','R','R','R','-'],
        ['R/W','R*','-','-','-','-','-','-','R','-'],
    ]
    hdr_row = ['M\u00f3dulo'] + roles_hdr
    mdata = [[m] + mx[i] for i, m in enumerate(modules)]
    s.append(mk_table(hdr_row, mdata, widths=[72]+[42]*10))
    s.append(body(
        '<b>R</b> = Solo Lectura | <b>R/W</b> = Lectura y Escritura | '
        '<b>\u2014</b> = Sin Acceso | <b>*</b> = Acceso parcial a pesta\u00f1as espec\u00edficas'
    ))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 12. CATÁLOGO DE REPORTES
    # ═══════════════════════════════════════════════════════
    s.append(sec('12. Cat\u00e1logo Completo de Reportes'))
    s.append(hr())
    s.append(body(
        'La aplicaci\u00f3n genera m\u00faltiples tipos de reportes exportables en '
        'formato Excel (.xlsx) y PDF, con estilos corporativos de Agrifeed:'
    ))
    s.append(mk_table(
        ['Reporte', 'Contenido', 'M\u00f3dulo', 'Formato'],
        [
            ['Programaci\u00f3n Excel',    'OPs filtradas por rango de fechas',                    'Programaci\u00f3n', 'XLSX'],
            ['Producci\u00f3n Excel',      'Entregas filtradas por fecha y OP',                    'Producci\u00f3n',   'XLSX'],
            ['Reporte Turno PDF',         'Resumen de turno con supervisor y dosificador',         'Producci\u00f3n',   'PDF'],
            ['Explosi\u00f3n Producci\u00f3n', 'Consumos de MP por producci\u00f3n real',         'Producci\u00f3n',   'XLSX/PDF'],
            ['Explosi\u00f3n Traslado',    'Consumos de MP estimados por f\u00f3rmula',           'Formulaci\u00f3n',  'XLSX/PDF'],
            ['Despachos Excel',           'Maestro-detalle de despachos con OPs',                 'Log\u00edstica',   'XLSX'],
            ['Remisi\u00f3n PDF',          'Documento con logo, membrete y campos de firma',       'Log\u00edstica',   'PDF'],
            ['Inventario MP',             'Movimientos de inventario por mes',                     'Log\u00edstica',   'XLSX'],
            ['Trazabilidad Excel',        'Cuadro completo de estado por OP',                     'Trazabilidad',     'XLSX'],
            ['Consumo PICIZ',            'MP de facturas no matrizadas',                          'Facturaci\u00f3n',  'XLSX'],
            ['Dashboard Cartera',        'An\u00e1lisis de cartera y cr\u00e9ditos',              'Facturaci\u00f3n',  'XLSX'],
            ['Maestro de Datos',         'Exportaci\u00f3n de cat\u00e1logos maestros',           'Maestro',          'XLSX'],
        ],
        widths=[120, 190, 80, 70]
    ))
    s.append(Spacer(1, 10))
    s.append(sub('Caracter\u00edsticas de los Reportes PDF'))
    s.append(bul('<b>Logo corporativo</b> en el encabezado de todos los documentos PDF.'))
    s.append(bul('<b>Franja verde</b> con nombre de la empresa, NIT y direcci\u00f3n.'))
    s.append(bul('<b>Tablas con estilos:</b> colores alternos, bordes y totales resaltados.'))
    s.append(bul('<b>Pie de p\u00e1gina:</b> NIT, direcci\u00f3n y fecha/hora de generaci\u00f3n.'))
    s.append(bul('<b>Di\u00e1logo nativo de guardado</b> para seleccionar la ubicaci\u00f3n del archivo.'))
    s.append(PageBreak())

    # ═══════════════════════════════════════════════════════
    # 13. FLUJO OPERATIVO
    # ═══════════════════════════════════════════════════════
    s.append(sec('13. Flujo Operativo Completo'))
    s.append(hr())
    s.append(body(
        'A continuaci\u00f3n se describe el flujo operativo completo de la empresa, '
        'paso a paso, mostrando c\u00f3mo cada m\u00f3dulo interviene en el proceso:'
    ))
    s.append(mk_table(
        ['#', 'Paso', 'M\u00f3dulo', 'Descripci\u00f3n'],
        [
            ['1',  'Configuraci\u00f3n Inicial', 'Maestro',        'Registrar alimentos, clientes, veh\u00edculos y granjas'],
            ['2',  'Crear F\u00f3rmulas',        'Formulaci\u00f3n','Definir recetas con materias primas por bache'],
            ['3',  'Programar OPs',             'Programaci\u00f3n','Crear \u00f3rdenes con fecha, alimento, bultos y cliente'],
            ['4',  'Asociar F\u00f3rmulas',      'Programaci\u00f3n','Vincular cada OP a su f\u00f3rmula de producci\u00f3n'],
            ['5',  'Generar Explosi\u00f3n',     'Formulaci\u00f3n','Calcular y solicitar las materias primas necesarias'],
            ['6',  'Registrar Producci\u00f3n',  'Producci\u00f3n', 'Registrar entregas diarias de baches y bultos'],
            ['7',  'Reporte de Turno',           'Producci\u00f3n', 'Consolidar la producci\u00f3n del d\u00eda con supervisor'],
            ['8',  'Crear Despacho',             'Log\u00edstica',  'Registrar la remisi\u00f3n con las OPs despachadas'],
            ['9',  'Imprimir Remisi\u00f3n',     'Log\u00edstica',  'Generar el PDF de remisi\u00f3n para el transportador'],
            ['10', 'Crear Pedido',               'Facturaci\u00f3n', 'Generar pedido de venta con las OPs despachadas'],
            ['11', 'Liberar en Cartera',         'Facturaci\u00f3n', 'Analista verifica cr\u00e9dito y libera el pedido'],
            ['12', 'Asignar Factura',            'Facturaci\u00f3n', 'Registrar el n\u00famero de factura SAP'],
            ['13', 'Verificar Trazabilidad',     'Trazabilidad',  'Confirmar que el ciclo est\u00e9 completo'],
        ],
        widths=[25, 120, 85, 250]
    ))

    s.append(Spacer(1, 14))
    s.append(sub('Diagrama Resumen del Flujo'))
    s.append(flow_diagram(width=490, height=70,
        steps=['Maestro', 'Programar', 'Producir', 'Despachar', 'Facturar', 'Trazar']))
    s.append(cap('Flujo operativo simplificado de extremo a extremo'))

    # ─── CAJA FINAL ─────────────────────────────────────────
    s.append(Spacer(1, 30))
    fb_data = [[Paragraph(
        '<b>AGRIFEED TRAZABILIDAD v2.0</b><br/><br/>'
        'Sistema integral de trazabilidad operativa para la gesti\u00f3n de '
        'producci\u00f3n, log\u00edstica y facturaci\u00f3n de alimentos concentrados.<br/><br/>'
        f'<i>Documento generado el {datetime.now().strftime("%d/%m/%Y a las %H:%M")}</i>',
        ParagraphStyle('fb', parent=styles['Body2'],
                       alignment=TA_CENTER, fontSize=11, leading=16,
                       textColor=GREEN_DARK)
    )]]
    ft = Table(fb_data, colWidths=[440])
    ft.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), GREEN_LIGHT),
        ('BOX',        (0,0), (-1,-1), 2, GREEN_MID),
        ('TOPPADDING', (0,0), (-1,-1), 20),
        ('BOTTOMPADDING', (0,0), (-1,-1), 20),
        ('LEFTPADDING',   (0,0), (-1,-1), 20),
        ('RIGHTPADDING',  (0,0), (-1,-1), 20),
    ]))
    s.append(ft)

    # ─── CONSTRUIR ──────────────────────────────────────────
    doc.build(s, onFirstPage=cover_page, onLaterPages=normal_page)

    abs_path = os.path.abspath(OUTPUT_FILE)
    size_kb  = os.path.getsize(OUTPUT_FILE) / 1024
    print(f'[OK] PDF generado exitosamente en:\n   {abs_path}')
    print(f'   Tamano: {size_kb:.1f} KB')


if __name__ == '__main__':
    build_pdf()
