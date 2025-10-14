import { useEffect, useMemo, useState } from 'react';

type Props = {
  total: number;
  page: number;                 // 1-based
  pageSize: number;
  onChangePage: (p: number) => void;
  onChangePageSize: (n: number) => void;
  onOpenFilters?: (anchor: HTMLElement) => void;
  onOpenSorts?: (anchor: HTMLElement) => void;
  sortCount?: number;
  filtersCount?: number;
};

const PAGE_SIZES = [10, 25, 50, 100];

export default function GridToolbar({
  total,
  page,
  pageSize,
  onChangePage,
  onChangePageSize,
  onOpenFilters,
  onOpenSorts,
  sortCount = 0,
  filtersCount = 0,
}: Props) {
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
    [total, pageSize]
  );

  const range = useMemo(() => {
    if (total === 0) return { from: 0, to: 0 };
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    return { from, to };
  }, [total, page, pageSize]);

  const [pageInput, setPageInput] = useState(String(page));
  useEffect(() => { setPageInput(String(page)); }, [page]);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const clamp = (n: number) => {
    if (!Number.isFinite(n) || n < 1) return 1;
    if (n > totalPages) return totalPages;
    return n;
  };

  const go = (n: number) => onChangePage(clamp(n));

  return (
    <div className="grid-toolbar">
      {/* Izquierda: Filtros + Ordenar */}
      <div className="gt-left">
        <div className="relative">
          <button
            className="btn"
            onClick={(e) => onOpenFilters?.(e.currentTarget as HTMLElement)}
            title="Abrir filtros"
          >
            Filtros ▾
          </button>
          {filtersCount > 0 && (
            <span className="pill-green ml-1 text-[11px]">{filtersCount}</span>
          )}
        </div>

        <div className="relative">
          <button
            className="btn"
            onClick={(e) => onOpenSorts?.(e.currentTarget as HTMLElement)}
            title="Ordenar"
          >
            Ordenar ▾
          </button>
          {sortCount > 0 && (
            <span className="pill-gray ml-1 text-[11px]">{sortCount}</span>
          )}
        </div>
      </div>

      {/* Derecha: Rango, paginación y tamaño de página */}
      <div className="toolbar-right">
        <div className="gt-range muted">
          {range.from}–{range.to} de {total}
        </div>

        <div className="gt-pages">
          <button className="icon-btn" disabled={!canPrev} onClick={() => go(1)} title="Primera">«</button>
          <button className="icon-btn" disabled={!canPrev} onClick={() => go(page - 1)} title="Anterior">‹</button>

          <div className="gt-page-input">
            <input
              className="input input-sm"
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => {
                const n = clamp(Number(pageInput));
                if (n !== page) onChangePage(n);
                setPageInput(String(n));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = clamp(Number(pageInput));
                  if (n !== page) onChangePage(n);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              aria-label="Ir a página"
            />
            <span className="muted">/ {totalPages}</span>
          </div>

          <button className="icon-btn" disabled={!canNext} onClick={() => go(page + 1)} title="Siguiente">›</button>
          <button className="icon-btn" disabled={!canNext} onClick={() => go(totalPages)} title="Última">»</button>
        </div>

        <div className="gt-pagesize">
          <label className="muted hidden sm:inline" htmlFor="gt-ps">Filas:</label>
          <select
            id="gt-ps"
            className="select"
            value={pageSize}
            onChange={(e) => onChangePageSize(Number(e.target.value))}
            aria-label="Tamaño de página"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}/página</option>
            ))}
          </select>
        </div>
      </div>

      {/* Estilos de apoyo (siguen el look&feel de Luisa) */}
      <style>{`
        .grid-toolbar {
          display:flex; align-items:center; justify-content:space-between;
          padding:.5rem .75rem; gap:.5rem; background:#fff; border-bottom:1px solid #e5e7eb;
        }
        .gt-left, .toolbar-right { display:flex; align-items:center; gap:.5rem; }
        .gt-range { margin-right:.25rem; }
        .gt-pages { display:flex; align-items:center; gap:.25rem; }
        .gt-page-input { display:inline-flex; align-items:center; gap:.375rem; margin:0 .25rem; }
        .gt-pagesize { display:inline-flex; align-items:center; gap:.375rem; margin-left:.5rem; }

        .btn { border:1px solid #e5e7eb; background:#fff; padding:.375rem .5rem; border-radius:.5rem; cursor:pointer; }
        .btn:hover { background:#f9fafb; }
        .icon-btn { width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #e5e7eb; border-radius:.5rem; background:#fff; }
        .icon-btn:hover { background:#f9fafb; }
        .icon-btn:disabled { opacity:.5; cursor:not-allowed; }

        .pill-green { background:#10b981; color:#fff; padding:.0625rem .375rem; border-radius:999px; }
        .pill-gray  { background:#6b7280; color:#fff; padding:.0625rem .375rem; border-radius:999px; }

        .input.input-sm { height:28px; padding:0 .5rem; border:1px solid #e5e7eb; border-radius:.5rem; width:70px; }
        .select { height:28px; padding:0 .5rem; border:1px solid #e5e7eb; border-radius:.5rem; background:#fff; }

        .muted { color:#6b7280; font-size:.875rem; }
        @media (max-width: 480px) {
          .gt-range { display:none; }
        }
      `}</style>
    </div>
  );
}