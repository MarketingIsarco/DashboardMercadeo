import type { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  cell: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
}

export function DataTable<T>({
  columns,
  rows,
  empty = 'Sin datos para el filtro actual.',
  maxHeight,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  /** Cuando se pasa, el cuerpo hace scroll y el encabezado queda fijo. */
  maxHeight?: number;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 text-xs text-muted">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className="dt">
        <thead className={maxHeight ? 'sticky top-0 z-10' : undefined}>
          <tr>
            {columns.map((c) => (
              <th key={c.header} style={{ textAlign: c.align ?? 'left' }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.header} style={{ textAlign: c.align ?? 'left' }}>
                  {c.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
