// apps/frontend/src/components/grid/GridToolbar.tsx

type Props = {
  total: number;
  page: number;
  pageSize: number;
  onChangePage: (p: number) => void;
  onChangePageSize: (n: number) => void;
  onOpenFilters?: (anchor: HTMLElement) => void;
  onOpenSorts?: (anchor: HTMLElement) => void;
  sortCount?: number;
  filtersCount?: number; // por si quieres mostrar cuántos filtros hay
};

export default function GridToolbar({
  total, page, pageSize, onChangePage, onChangePageSize,
  onOpenFilters, onOpenSorts, sortCount = 0, filtersCount = 0,
}: Props) {

  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const canPrev = page > 1;
  const canNext = page < pages;

  return (
    <div className="grid-toolbar">
      <div className="flex items-center gap-2">
        {/* Botón Filtro */}
        <div className="relative">
          <button
            className="btn"
            onClick={(e) => onOpenFilters?.(e.currentTarget)}
          >
            Filtro ▾
          </button>
          {filtersCount > 0 && (
            <span className="pill-green ml-1 text-[11px]">{filtersCount}</span>
          )}
        </div>

        {/* Botón Ordenar */}
        <div className="relative">
          <button
            className="btn"
            onClick={(e) => onOpenSorts?.(e.currentTarget)}
          >
            Ordenar ▾
          </button>
          {sortCount > 0 && (
            <span className="pill-gray ml-1 text-[11px]">
              {sortCount}
            </span>
          )}
        </div>
      </div>

      <div className="toolbar-right">
        <span className="muted text-sm">Registros: {total}</span>

        <select
          className="select"
          value={pageSize}
          onChange={(e) => onChangePageSize(Number(e.target.value))}
        >
          {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}/página</option>)}
        </select>

        <div className="flex items-center gap-1">
          <button className="icon-btn" disabled={!canPrev} onClick={() => onChangePage(page - 1)}>◀</button>
          <span className="muted text-sm px-1">Página {page} / {pages}</span>
          <button className="icon-btn" disabled={!canNext} onClick={() => onChangePage(page + 1)}>▶</button>
        </div>
      </div>
    </div>
  );
}