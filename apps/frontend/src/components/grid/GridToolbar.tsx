// apps/frontend/src/components/grid/GridToolbar.tsx
import { useRef } from 'react';

type Props = {
  total: number;
  page: number;
  pageSize: number;
  onChangePage: (page: number) => void;
  onChangePageSize: (n: number) => void;
  onOpenFilters: (anchorEl: HTMLElement) => void;
};

export default function GridToolbar({
  total, page, pageSize, onChangePage, onChangePageSize, onOpenFilters,
}: Props) {
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="grid-toolbar">
      <div className="muted">Registros: {total}</div>

      <div className="ml-2">
        <button
          ref={filterBtnRef}
          className="btn"
          onClick={() => filterBtnRef.current && onOpenFilters(filterBtnRef.current)}
          title="Filtros"
        >
          Filtro ▾
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <select
          className="select"
          value={pageSize}
          onChange={(e) => { onChangePage(1); onChangePageSize(Number(e.target.value)); }}
        >
          {[10,25,50,100].map(n => <option key={n} value={n}>{n}/página</option>)}
        </select>
        <span className="muted">Página {page} / {pages}</span>
        <button className="icon-btn" onClick={() => onChangePage(Math.max(1, page - 1))}>◀</button>
        <button className="icon-btn" onClick={() => onChangePage(Math.min(pages || 1, page + 1))}>▶</button>
      </div>
    </div>
  );
}