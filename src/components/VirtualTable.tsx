// ══════════════════════════════════════════════════════════════
// VirtualTable — Componente reutilizable de tabla virtualizada
//
// Usa @tanstack/react-virtual para renderizar solo las filas
// visibles en el viewport, permitiendo tablas con miles de
// registros sin degradar el rendimiento.
//
// Uso:
//   <VirtualTable
//     data={filtered}
//     columns={[
//       { key: 'fecha', header: 'Fecha', width: 100 },
//       { key: 'cliente', header: 'Cliente', width: 200, render: (val, row) => <b>{val}</b> },
//     ]}
//     rowHeight={40}
//     maxHeight={600}
//     onRowClick={(row) => console.log(row)}
//     emptyIcon={<TruckIcon />}
//     emptyMessage="No hay registros"
//   />
// ══════════════════════════════════════════════════════════════

import { useRef, useMemo, useCallback, useState, type ReactNode, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface VirtualColumn<T = any> {
  /** Unique key for the column (used as data accessor if no render fn) */
  key: string;
  /** Header label */
  header: string | ReactNode;
  /** Fixed width in px (optional) */
  width?: number;
  /** Min width in px */
  minWidth?: number;
  /** Custom cell renderer. If omitted, displays row[key] as string */
  render?: (value: any, row: T, rowIndex: number) => ReactNode;
  /** Header style overrides */
  headerStyle?: CSSProperties;
  /** Cell style overrides */
  cellStyle?: CSSProperties;
  /** Filter input below header (optional) */
  filterInput?: ReactNode;
}

export interface VirtualTableProps<T = any> {
  data: T[];
  columns: VirtualColumn<T>[];
  /** Estimated height of each row in px (default: 42) */
  rowHeight?: number;
  /** Max container height (default: calc(100vh - 300px)) */
  maxHeight?: number | string;
  /** If true, enables built-in pagination (PAGE_SIZE rows per page) */
  paginated?: boolean;
  /** Rows per page when paginated (default: 100) */
  pageSize?: number;
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** Row class callback */
  rowClassName?: (row: T, index: number) => string;
  /** Row style callback */
  rowStyle?: (row: T, index: number) => CSSProperties | undefined;
  /** Icon/element for empty state */
  emptyIcon?: ReactNode;
  /** Text for empty state */
  emptyMessage?: string;
  /** Loading state */
  loading?: boolean;
  /** Loading message */
  loadingMessage?: string;
  /** Total raw data count (for displaying "Total: X") */
  totalCount?: number;
  /** Extra rows to render outside visible area (default: 5) */
  overscan?: number;
  /** Extra render after each row (e.g. expanded detail) */
  renderAfterRow?: (row: T, index: number) => ReactNode | null;
  /** Table class */
  className?: string;
}

export default function VirtualTable<T extends Record<string, any>>({
  data,
  columns,
  rowHeight = 42,
  maxHeight = 'calc(100vh - 300px)',
  paginated = false,
  pageSize = 100,
  onRowClick,
  rowClassName,
  rowStyle,
  emptyIcon,
  emptyMessage = 'No hay registros',
  loading = false,
  loadingMessage = 'Cargando...',
  totalCount,
  overscan = 5,
  renderAfterRow: _renderAfterRow,
  className,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Pagination
  const displayData = useMemo(() => {
    if (!paginated) return data;
    const start = (currentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, paginated, currentPage, pageSize]);

  const totalPages = paginated ? Math.ceil(data.length / pageSize) : 1;

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: displayData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const getValue = useCallback((row: T, key: string) => {
    const parts = key.split('.');
    let val: any = row;
    for (const p of parts) {
      val = val?.[p];
    }
    return val;
  }, []);

  if (loading) {
    return (
      <div className={`virtual-table-container ${className || ''}`}>
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: 8 }}>⏳</div>
          {loadingMessage}
        </div>
      </div>
    );
  }

  if (displayData.length === 0) {
    return (
      <div className={`virtual-table-container ${className || ''}`}>
        <div className="empty-state" style={{ padding: '48px 0', textAlign: 'center' }}>
          {emptyIcon && <div style={{ marginBottom: 12, opacity: 0.5 }}>{emptyIcon}</div>}
          <p><strong>{emptyMessage}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div className={`virtual-table-container ${className || ''}`}>
      {/* Scrollable table area */}
      <div
        ref={parentRef}
        style={{
          maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        <table
          className="data-table"
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          {/* Sticky header */}
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{
                    width: col.width,
                    minWidth: col.minWidth,
                    ...col.headerStyle,
                  }}
                >
                  {col.header}
                  {col.filterInput}
                </th>
              ))}
            </tr>
          </thead>

          {/* Virtualized body */}
          <tbody>
            {/* Top spacer */}
            {virtualRows.length > 0 && virtualRows[0].start > 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ height: virtualRows[0].start, padding: 0, border: 'none' }}
                />
              </tr>
            )}

            {virtualRows.map(virtualRow => {
              const row = displayData[virtualRow.index];
              const idx = virtualRow.index;
              const cls = rowClassName ? rowClassName(row, idx) : '';
              const sty = rowStyle ? rowStyle(row, idx) : undefined;

              return (
                <tr
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  className={cls}
                  style={{
                    height: rowHeight,
                    cursor: onRowClick ? 'pointer' : undefined,
                    ...sty,
                  }}
                  onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      style={{
                        width: col.width,
                        minWidth: col.minWidth,
                        ...col.cellStyle,
                      }}
                    >
                      {col.render
                        ? col.render(getValue(row, col.key), row, idx)
                        : String(getValue(row, col.key) ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* Bottom spacer */}
            {virtualRows.length > 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    height: totalSize - (virtualRows[virtualRows.length - 1].end),
                    padding: 0,
                    border: 'none',
                  }}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {paginated && (
        <div
          className="pagination"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
          }}
        >
          <span>
            Mostrando {((currentPage - 1) * pageSize) + 1}–
            {Math.min(currentPage * pageSize, data.length)} de {data.length} registros
            {totalCount !== undefined && ` (Total: ${totalCount})`}
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn btn-outline btn-sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                <ChevronLeft size={14} /> Ant
              </button>
              <span style={{ fontWeight: 600 }}>
                Pág {currentPage} / {totalPages}
              </span>
              <button
                className="btn btn-outline btn-sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Sig <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
