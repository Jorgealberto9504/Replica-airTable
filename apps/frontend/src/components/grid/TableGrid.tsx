// apps/frontend/src/components/grid/TableGrid.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';

import {
  listFields, createField, updateField, deleteField, listOptions,
  type Field, type FieldType,
} from '../../api/fields';
import { createRecord, patchRecord, deleteRecord, type SortSpec } from '../../api/records';
import { bootstrapGrid } from '../../api/grid';

import CommentsPanel from '../comments/Comments.Panel';

import Modal from './Modal';
import FieldDefForm from './FieldDefForm';
import OptionEditor from './OptionEditor';

import { CellEditor, ReadonlyCell, toDataTypeAttr, printCellTitle } from './CellEditors';

// Eliminamos GridToolbar porque integramos su UI al header
// import GridToolbar from './GridToolbar';
import ColumnMenu from './ColumnMenu';
import RowMenu from './RowMenu';

import GridFilters, { type FiltersValue } from './GridFilters';
import GridSorts from './GridSorts';
import { measureAsync } from '../../utils/metrics';

/* ===== lastChange (como lo envía tu backend) ===== */
type LastChange =
  | {
      kind: 'CELL';
      fieldId: number | null;
      fieldName: string | null;
      user: { id: number; fullName: string } | null;
      at: string; // ISO
    }
  | {
      kind: 'COMMENT';
      commentId: number;
      body: string;
      user: { id: number; fullName: string } | null;
      at: string; // ISO
    };

type UIRecord = {
  id: number;
  values: Record<string, any>;
  lastChange?: LastChange;
};

type RecordPerms = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canComment: boolean;
};

type Props = {
  baseId: number;
  tableId: number;
  perms?: RecordPerms;
  canManageFields?: boolean;
};

const FIELD_TYPES: FieldType[] = [
  'TEXT','LONG_TEXT','NUMBER','CURRENCY','CHECKBOX','DATE','DATETIME','TIME','SINGLE_SELECT','MULTI_SELECT',
];

const DEFAULT_COL_W = 180;
const MIN_COL_W = 120;
const MAX_COL_W = 800;

/* Ancho por defecto para “Última actividad” */
const DEFAULT_LAST_W = 260;

function timeAgoFromISO(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'hace unos segundos';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const dys = Math.floor(h / 24);
  if (dys < 30) return `hace ${dys} d`;
  return d.toLocaleString();
}
function lastChangeInline(lc?: LastChange) {
  if (!lc) return '—';
  const who = lc.user?.fullName ? ` · ${lc.user.fullName}` : '';
  const whenStr = timeAgoFromISO(lc.at);
  const when = whenStr ? ` · ${whenStr}` : '';
  if (lc.kind === 'COMMENT') {
    const body = lc.body?.trim() ? `“${lc.body.trim().slice(0, 60)}${lc.body.length > 60 ? '…' : ''}”` : 'comentario';
    return `Comentario: ${body}${who}${when}`;
  }
  const field = lc.fieldName ?? 'Celda';
  return `${field}${who}${when}`;
}
function lastChangeTitle(lc?: LastChange) {
  if (!lc) return 'Sin actividad';
  const base =
    lc.kind === 'COMMENT'
      ? `Comentario${lc.user?.fullName ? ' de ' + lc.user.fullName : ''}`
      : `Edición en ${lc.fieldName ?? 'celda'}`;
  const at = new Date(lc.at);
  return `${base} · ${at.toLocaleString()}`;
}

function typeBadgeClasses(t: FieldType) {
  switch (t) {
    case 'TEXT':
    case 'LONG_TEXT': return 'bg-gray-100 text-gray-700';
    case 'NUMBER':
    case 'CURRENCY': return 'bg-green-100 text-green-700';
    case 'CHECKBOX': return 'bg-purple-100 text-purple-700';
    case 'DATE':
    case 'DATETIME':
    case 'TIME': return 'bg-yellow-100 text-yellow-700';
    case 'SINGLE_SELECT': return 'bg-blue-100 text-blue-700';
    case 'MULTI_SELECT': return 'bg-indigo-100 text-indigo-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

export default function TableGrid({ baseId, tableId, perms, canManageFields }: Props) {
  const effectivePerms: RecordPerms = {
    canCreate: !!perms?.canCreate,
    canUpdate: !!perms?.canUpdate,
    canDelete: !!perms?.canDelete,
    canComment: !!perms?.canComment,
  };

  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [fields, setFields] = useState<Field[]>([]);
  const [records, setRecords] = useState<UIRecord[]>([]);
  const [total, setTotal] = useState(0);

  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [columnMenu, setColumnMenu] = useState<{ field: Field; x: number; y: number } | null>(null);

  const [addColOpen, setAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<FieldType>('TEXT');
  const [newSelectOpts, setNewSelectOpts] = useState<string[]>(['Opción 1', 'Opción 2']);

  const [renameOpen, setRenameOpen] = useState<{ open: boolean; field?: Field }>({ open: false });
  const [renameName, setRenameName] = useState('');
  const [typeOpen, setTypeOpen] = useState<{ open: boolean; field?: Field }>({ open: false });
  const [typeValue, setTypeValue] = useState<FieldType>('TEXT');
  const [typeSelectOpts, setTypeSelectOpts] = useState<string[]>(['Opción 1', 'Opción 2']);

  const [rowMenu, setRowMenu] = useState<{ recordId: number; x: number; y: number } | null>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);

  const [cmtPanel, setCmtPanel] = useState<{ open: boolean; recordId: number | null }>({ open: false, recordId: null });
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});

  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ===== Filtros / sort
  const [filters, setFilters] = useState<FiltersValue>({ logic: 'AND', filters: [] });
  const [sort, setSort] = useState<SortSpec[]>([]);
  const [filtersUI, setFiltersUI] = useState<{ open: boolean; anchor: HTMLElement | null }>({ open: false, anchor: null });
  const [sortUI, setSortUI] = useState<{ open: boolean; anchor: HTMLElement | null }>({ open: false, anchor: null });

  // ===== Cerrar menú de columna
  useEffect(() => {
    if (!columnMenu) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      const t = e.target as Node;
      if (!menuRef.current.contains(t)) setColumnMenu(null);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setColumnMenu(null); }
    function onScroll() { setColumnMenu(null); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    containerRef.current?.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      containerRef.current?.removeEventListener('scroll', onScroll, true);
    };
  }, [columnMenu]);

  // ===== Cerrar menú de fila
  useEffect(() => {
    if (!rowMenu) return;
    function onDoc(e: MouseEvent) {
      if (!rowMenuRef.current) return;
      const t = e.target as Node;
      if (!rowMenuRef.current.contains(t)) setRowMenu(null);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setRowMenu(null); }
    function onScroll() { setRowMenu(null); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    containerRef.current?.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      containerRef.current?.removeEventListener('scroll', onScroll, true);
    };
  }, [rowMenu]);

  // ===== Anchos por columna + resize
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [lastColW, setLastColW] = useState<number>(DEFAULT_LAST_W);

  type Resizing =
    | { kind: 'field'; id: number; startX: number; startW: number }
    | { kind: 'last'; startX: number; startW: number }
    | null;
  const [resizing, setResizing] = useState<Resizing>(null);

  useEffect(() => {
    function onMove(ev: MouseEvent) {
      if (!resizing) return;
      const dx = ev.clientX - resizing.startX;
      const next = Math.max(MIN_COL_W, Math.min(MAX_COL_W, resizing.startW + dx));
      if (resizing.kind === 'field') {
        setColWidths((prev) => ({ ...prev, [resizing.id]: next }));
      } else {
        setLastColW(next);
      }
    }
    function onUp() { setResizing(null); }
    if (resizing) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  function startResizeField(fid: number, e: React.MouseEvent) {
    e.preventDefault();
    if (!canManageFields) return;
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const startW = th.getBoundingClientRect().width;
    setResizing({ kind: 'field', id: fid, startX: e.clientX, startW });
  }
  function startResizeLast(e: React.MouseEvent) {
    e.preventDefault();
    if (!canManageFields) return;
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const startW = th.getBoundingClientRect().width;
    setResizing({ kind: 'last', startX: e.clientX, startW });
  }

  // ===== Helpers
  async function ensureSelectOptions(baseId: number, tableId: number, fs: Field[]) {
    const selectIds = fs.filter(x => x.type === 'SINGLE_SELECT' || x.type === 'MULTI_SELECT').map(x => x.id);
    if (!selectIds.length) return fs;
    const copy = [...fs];
    await Promise.all(selectIds.map(async (fid) => {
      const idx = copy.findIndex(x => x.id === fid);
      if (idx >= 0) {
        const r = await listOptions(baseId, tableId, fid);
        copy[idx] = { ...copy[idx], options: r.options };
      }
    }));
    return copy;
  }
  function fieldById(id: number) { return fields.find((f) => f.id === id)!; }

  // ===== Carga inicial: 1 sola petición (bootstrapGrid)
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const b = await measureAsync('grid.bootstrap', () =>
          bootstrapGrid(
            baseId,
            tableId,
            {
              page, pageSize,
              logic: filters.logic,
              filters: filters.filters,
              sort,
            },
            ac.signal
          )
        );
        if (!alive) return;

        // Ya vienen options embebidas
        setFields(b.fields as unknown as Field[]);
        setRecords(b.records as UIRecord[]);
        setTotal(b.total);
        setCommentCounts(b.commentCounts ?? {});

        // Inicializa anchos para nuevas columnas
        setColWidths((prev) => {
          const next = { ...prev };
          (b.fields || []).forEach((ff: any) => { if (next[ff.id] == null) next[ff.id] = DEFAULT_COL_W; });
          return next;
        });
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (!alive) return;
        setError(e?.message || 'No se pudo cargar');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [baseId, tableId, page, pageSize, filters, sort]);

  // ===== CRUD / estados optimistas
  function setLastChange(recordId: number, lc: LastChange) {
    setRecords(prev => prev.map(r => (r.id === recordId ? { ...r, lastChange: lc } : r)));
  }

  async function commitCell(recordId: number, fieldId: number, next: any) {
    if (!effectivePerms.canUpdate) { alert('No tienes permisos para editar registros en esta base.'); return; }
    const field = fieldById(fieldId);

    // Optimista: valor y última actividad
    const nowISO = new Date().toISOString();
    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId
          ? {
              ...r,
              values: { ...r.values, [String(fieldId)]: next },
              lastChange: {
                kind: 'CELL',
                fieldId,
                fieldName: field?.name ?? null,
                user: null,
                at: nowISO,
              },
            }
          : r
      )
    );

    try {
      await measureAsync('record.patchCell', () =>
        patchRecord(baseId, tableId, recordId, { [String(fieldId)]: next })
      );
    } catch (e: any) {
      alert(e?.message || 'No se pudo guardar');
      setPage(p => p); // fuerza re-render en la siguiente carga
    }
  }

  async function handleAddRow() {
    if (!effectivePerms.canCreate) { alert('No tienes permisos para crear registros.'); return; }
    try {
      const r = await measureAsync('record.create', () => createRecord(baseId, tableId, {}));
      setRecords((prev) => [...prev, { id: r.record.id, values: {} }]);
      setTotal((t) => t + 1);
      setTimeout(() => containerRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 50);
    } catch (e: any) { alert(e?.message || 'No se pudo crear la fila'); }
  }

  async function handleDeleteRow(id: number) {
    if (!effectivePerms.canDelete) { alert('No tienes permisos para eliminar registros.'); return; }
    if (!confirm('¿Eliminar esta fila?')) return;
    try {
      await measureAsync('record.delete', () => deleteRecord(baseId, tableId, id));
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setCommentCounts(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e: any) { alert(e?.message || 'No se pudo eliminar'); }
  }

  function openColumnMenu(e: React.MouseEvent, f: Field) {
    if (!canManageFields) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    // Mantener el panel SIEMPRE visible dentro del viewport
    const MENU_W = 240;
    const margin = 8;
    const x = Math.min(
      Math.max(margin, rect.right - MENU_W),
      window.innerWidth - MENU_W - margin
    );
    const y = Math.min(rect.bottom + 8, window.innerHeight - margin);

    setColumnMenu({ field: f, x, y });
  }

  // ===== Crear / renombrar / tipo / borrar columna
  async function submitAddColumn() {
    if (!canManageFields) return;
    if (!newColName.trim()) return;
    const isSelect = newColType === 'SINGLE_SELECT' || newColType === 'MULTI_SELECT';
    const cleaned = isSelect ? newSelectOpts.map(s => s.trim()).filter(Boolean).map(label => ({ label })) : undefined;
    try {
      await createField(baseId, tableId, {
        name: newColName.trim(),
        type: newColType,
        options: isSelect ? (cleaned && cleaned.length ? cleaned : [{ label: 'Opción 1' }, { label: 'Opción 2' }]) : undefined,
      });
      setAddColOpen(false);
      setNewColName(''); setNewColType('TEXT'); setNewSelectOpts(['Opción 1', 'Opción 2']);

      // refrescamos campos (post-mutate)
      const f = await listFields(baseId, tableId);
      const withOptions = await ensureSelectOptions(baseId, tableId, f.fields);
      setFields(withOptions);
      setColWidths((prev) => {
        const next = { ...prev };
        withOptions.forEach(ff => { if (next[ff.id] == null) next[ff.id] = DEFAULT_COL_W; });
        return next;
      });
    } catch (e: any) { alert(e?.message || 'No se pudo crear la columna'); }
  }

  async function submitRenameColumn() {
    if (!canManageFields) return;
    if (!renameOpen.field || !renameName.trim()) return;
    try {
      const r = await updateField(baseId, tableId, renameOpen.field.id, { name: renameName.trim() });
      setRenameOpen({ open: false });
      setFields((prev) => prev.map((f) => (f.id === r.field.id ? r.field : f)));
    } catch (e: any) { alert(e?.message || 'No se pudo renombrar'); }
  }

  async function submitChangeType() {
    if (!canManageFields) return;
    if (!typeOpen.field) return;
    const isSelect = typeValue === 'SINGLE_SELECT' || typeValue === 'MULTI_SELECT';
    const cleaned = isSelect ? typeSelectOpts.map(s => s.trim()).filter(Boolean).map(label => ({ label })) : undefined;
    try {
      await updateField(baseId, tableId, typeOpen.field.id, {
        type: typeValue,
        options: isSelect ? (cleaned && cleaned.length ? cleaned : [{ label: 'Opción 1' }, { label: 'Opción 2' }]) : undefined,
      });
      setTypeOpen({ open: false });
      const f = await listFields(baseId, tableId);
      setFields(await ensureSelectOptions(baseId, tableId, f.fields));
    } catch (e: any) {
      alert(e?.message || 'No se pudo cambiar el tipo.\nSi la columna ya tiene datos, el backend lo bloquea.');
    }
  }

  async function handleDeleteColumn(fieldId: number) {
    if (!canManageFields) return;
    if (!confirm('¿Enviar columna a papelera?')) return;
    try {
      await deleteField(baseId, tableId, fieldId);
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
    } catch (e: any) { alert(e?.message || 'No se pudo eliminar'); }
  }

  const usageByField = useMemo(() => {
    const used = new Map<number, boolean>();
    for (const f of fields) used.set(f.id, false);
    for (const r of records)
      for (const fid of Object.keys(r.values))
        if (r.values[fid] != null) used.set(Number(fid), true);
    return used;
  }, [fields, records]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeFrom = total ? (page - 1) * pageSize + 1 : 0;
  const rangeTo = total ? Math.min(page * pageSize, total) : 0;

  function openRowContextMenu(e: React.MouseEvent, recordId: number) {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 140);
    setRowMenu({ recordId, x, y });
  }

  function applyDeltaToRecord(recordId: number, delta: number) {
    setCommentCounts(prev => ({
      ...prev,
      [recordId]: Math.max(0, (prev[recordId] ?? 0) + delta),
    }));
    if (delta > 0) {
      setLastChange(recordId, {
        kind: 'COMMENT',
        commentId: -1,
        body: 'Nuevo comentario',
        user: null,
        at: new Date().toISOString(),
      });
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header estilo Luisa */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Registros</h2>
          <p className="text-sm text-gray-500">
            {total} {total === 1 ? 'fila' : 'filas'} • {fields.length} {fields.length === 1 ? 'columna' : 'columnas'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filtros */}
          <button
            onClick={(e) => setFiltersUI({ open: true, anchor: e.currentTarget as unknown as HTMLElement })}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium flex items-center gap-2"
            title="Filtros"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-1.447.894l-4-2A1 1 0 019 17v-4.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filtros
            {filters.filters.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {filters.filters.length}
              </span>
            )}
          </button>

          {/* Orden */}
          <button
            onClick={(e) => setSortUI({ open: true, anchor: e.currentTarget as unknown as HTMLElement })}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium flex items-center gap-2"
            title="Ordenar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h11M3 6h7M3 14h15M3 18h15" />
            </svg>
            Orden
            {sort.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {sort.length}
              </span>
            )}
          </button>

          <span className="w-px h-6 bg-gray-200 mx-1" />

          {canManageFields && (
            <button
              onClick={() => {
                setAddColOpen(true);
                setNewColType('TEXT');
                setNewColName('');
                setNewSelectOpts(['Opción 1', 'Opción 2']);
              }}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium"
            >
              Nueva columna
            </button>
          )}

          {effectivePerms.canCreate && (
            <button
              onClick={handleAddRow}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Agregar fila
            </button>
          )}
        </div>
      </div>

      {/* Mini barra de paginación */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50 text-sm text-gray-700">
        <div>
          {total > 0 ? (
            <span>Mostrando {rangeFrom}–{rangeTo} de {total}</span>
          ) : (
            <span>Sin resultados</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}
            className="px-2 py-1 border border-gray-300 rounded-md bg-white"
            title="Tamaño de página"
          >
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}/pág</option>)}
          </select>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2 py-1 border border-gray-300 rounded disabled:opacity-50 bg-white hover:bg-gray-50"
              title="Anterior"
            >
              ‹
            </button>
            <span className="px-2">Página {page} de {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2 py-1 border border-gray-300 rounded disabled:opacity-50 bg-white hover:bg-gray-50"
              title="Siguiente"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Panel Filtros */}
      <GridFilters
        open={filtersUI.open}
        anchorEl={filtersUI.anchor}
        fields={fields}
        initial={filters}
        scrollContainerRef={containerRef}
        onApply={(f) => { setFilters(f); setPage(1); }}
        onClose={() => setFiltersUI({ open: false, anchor: null })}
      />

      {/* Panel Ordenar */}
      <GridSorts
        open={sortUI.open}
        anchorEl={sortUI.anchor}
        fields={fields}
        initial={sort}
        scrollContainerRef={containerRef}
        onApply={(s) => { setSort(s); setPage(1); }}
        onClose={() => setSortUI({ open: false, anchor: null })}
      />

      {/* Tabla */}
      <div className="overflow-x-auto" ref={containerRef}>
        <table className="w-full table-fixed">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {/* Columna # */}
              <th className="w-16 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                #
              </th>

              {/* Columnas dinámicas */}
              {fields.map((f) => (
                <th
                  key={f.id}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r border-gray-200 relative group pr-10"
                  title={`${f.name} (${f.type})`}
                  style={{ width: (colWidths[f.id] ?? DEFAULT_COL_W), minWidth: (colWidths[f.id] ?? DEFAULT_COL_W) }}
                  onMouseEnter={() => setHoverCol(f.id)}
                  onMouseLeave={() => setHoverCol((c) => (c === f.id ? null : c))}
                >
                  {/* Botón del menú de columna (centrado y separado del resizer) */}
                  {canManageFields && (
                    <button
                      className="absolute top-1/2 -translate-y-1/2 right-6 z-[5]
                                 w-7 h-7 grid place-items-center rounded-md
                                 bg-white/80 text-gray-500 hover:text-gray-800 hover:bg-white shadow-sm
                                 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                      onClick={(e) => openColumnMenu(e, f)}
                      aria-label="Abrir menú de columna"
                      title="Menú"
                    >
                      ⋯
                    </button>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800 truncate">{f.name}</span>
                    <span className={`ml-2 inline-flex px-2 py-1 rounded text-[10px] font-medium ${typeBadgeClasses(f.type)}`}>
                      {f.type}
                    </span>
                  </div>

                  {/* Grip de resize */}
                  {canManageFields && (
                    <span
                      className="absolute top-0 right-0 h-full w-1 cursor-col-resize"
                      onMouseDown={(e) => startResizeField(f.id, e)}
                    />
                  )}
                </th>
              ))}

              {/* Última actividad (redimensionable) */}
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r border-gray-200 relative"
                style={{ width: lastColW, minWidth: lastColW }}
                title="Última actividad"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800">Última actividad</span>
                </div>
                {canManageFields && (
                  <span
                    className="absolute top-0 right-0 h-full w-1 cursor-col-resize"
                    onMouseDown={startResizeLast}
                  />
                )}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={fields.length + 2} className="px-4 py-6 text-center text-gray-500">
                  Cargando…
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={fields.length + 2} className="px-4 py-10 bg-gray-50">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-gray-600">No hay registros.</p>
                    {effectivePerms.canCreate && (
                      <button
                        onClick={handleAddRow}
                        className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      >
                        Agregar primera fila
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              records.map((r, idx) => {
                const rowNumber = (page - 1) * pageSize + idx + 1;
                return (
                  <tr
                    key={r.id}
                    className="hover:bg-gray-50 transition-colors"
                    onContextMenu={(e) => openRowContextMenu(e, r.id)}
                  >
                    {/* # y comentarios */}
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono border-r border-gray-200 bg-gray-50">
                      <div className="flex items-center">
                        <span>{rowNumber}</span>
                        {(commentCounts[r.id] ?? 0) > 0 && (
                          <button
                            className="ml-2 text-gray-600 hover:text-gray-800"
                            title={`Comentarios (${commentCounts[r.id]})`}
                            onClick={() => setCmtPanel({ open: true, recordId: r.id })}
                          >
                            💬
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Celdas de datos */}
                    {fields.map((f) => (
                      <td
                        key={`${r.id}-${f.id}`}
                        className="px-4 py-3 border-r border-gray-200 align-top"
                        data-type={toDataTypeAttr(f.type)}
                        title={printCellTitle(fieldById(f.id), r.values[String(f.id)])}
                        style={{ width: (colWidths[f.id] ?? DEFAULT_COL_W), minWidth: (colWidths[f.id] ?? DEFAULT_COL_W) }}
                      >
                        {effectivePerms.canUpdate ? (
                          <CellEditor
                            field={f}
                            value={r.values[String(f.id)] ?? null}
                            onCommit={(val) => commitCell(r.id, f.id, val)}
                          />
                        ) : (
                          <ReadonlyCell field={f} value={r.values[String(f.id)] ?? null} />
                        )}
                      </td>
                    ))}

                    {/* Última actividad */}
                    <td
                      className="px-4 py-3 text-sm text-gray-700"
                      title={lastChangeTitle(r.lastChange)}
                      style={{ width: lastColW, minWidth: lastColW }}
                    >
                      {lastChangeInline(r.lastChange)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Row menu */}
      {rowMenu && (
        <RowMenu
          ref={rowMenuRef}
          x={rowMenu.x}
          y={rowMenu.y}
          canDelete={effectivePerms.canDelete}
          onClose={() => setRowMenu(null)}
          onOpenComments={() => {
            const rid = rowMenu.recordId;
            setRowMenu(null);
            setCmtPanel({ open: true, recordId: rid });
          }}
          onDelete={() => {
            const rid = rowMenu.recordId;
            handleDeleteRow(rid);
            setRowMenu(null);
          }}
        />
      )}

      {/* Column menu */}
      {columnMenu && canManageFields && (
        <ColumnMenu
          ref={menuRef}
          field={columnMenu.field}
          x={columnMenu.x}
          y={columnMenu.y}
          onClose={() => setColumnMenu(null)}
          onRename={() => {
            setRenameOpen({ open: true, field: columnMenu.field });
            setRenameName(columnMenu.field.name);
          }}
          onChangeType={() => {
            setTypeOpen({ open: true, field: columnMenu.field });
            setTypeValue(columnMenu.field.type);
            if (columnMenu.field.type === 'SINGLE_SELECT' || columnMenu.field.type === 'MULTI_SELECT') {
              setTypeSelectOpts((columnMenu.field.options ?? []).map(o => o.label));
            } else {
              setTypeSelectOpts(['Opción 1', 'Opción 2']);
            }
          }}
          onDelete={() => handleDeleteColumn(columnMenu.field.id)}
        />
      )}

      {/* Modals */}
      {addColOpen && canManageFields && (
        <Modal
          title="Nueva columna"
          onClose={() => setAddColOpen(false)}
          onConfirm={submitAddColumn}
          confirmText="Crear"
        >
          <FieldDefForm
            name={newColName}
            type={newColType}
            onName={setNewColName}
            onType={(t) => {
              setNewColType(t);
              if ((t === 'SINGLE_SELECT' || t === 'MULTI_SELECT') && newSelectOpts.length === 0) {
                setNewSelectOpts(['Opción 1', 'Opción 2']);
              }
            }}
          />
          {(newColType === 'SINGLE_SELECT' || newColType === 'MULTI_SELECT') && (
            <>
              <div className="muted mt-2 text-xs">
                Define las opciones del {newColType === 'SINGLE_SELECT' ? 'Single Select' : 'Multi Select'}.
              </div>
              <OptionEditor options={newSelectOpts} onChange={setNewSelectOpts} />
            </>
          )}
        </Modal>
      )}

      {renameOpen.open && renameOpen.field && canManageFields && (
        <Modal
          title="Renombrar columna"
          onClose={() => setRenameOpen({ open:false })}
          onConfirm={submitRenameColumn}
          confirmText="Guardar"
        >
          <div className="field">
            <label className="label">Nombre</label>
            <input className="input" value={renameName} onChange={(e) => setRenameName(e.target.value)} />
          </div>
        </Modal>
      )}

      {typeOpen.open && typeOpen.field && canManageFields && (
        <Modal
          title="Cambiar tipo"
          onClose={() => setTypeOpen({ open:false })}
          onConfirm={submitChangeType}
          confirmText="Cambiar"
        >
          {usageByField.get(typeOpen.field.id!) ? (
            <div className="alert-error">Esta columna tiene datos. Si el backend lo impide, verás un error al guardar.</div>
          ) : null}
          <div className="field">
            <label className="label">Tipo</label>
            <select className="select" value={typeValue} onChange={(e) => setTypeValue(e.target.value as FieldType)}>
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {(typeValue === 'SINGLE_SELECT' || typeValue === 'MULTI_SELECT') && (
            <>
              <div className="muted mt-2 text-xs">Define las opciones para el nuevo tipo.</div>
              <OptionEditor options={typeSelectOpts} onChange={setTypeSelectOpts} />
            </>
          )}
        </Modal>
      )}

      {/* Panel de comentarios */}
      {cmtPanel.open && cmtPanel.recordId != null && (
        <CommentsPanel
          baseId={baseId}
          tableId={tableId}
          recordId={cmtPanel.recordId}
          canComment={effectivePerms.canComment}
          onClose={() => setCmtPanel({ open: false, recordId: null })}
          onDeltaCount={(delta) => applyDeltaToRecord(cmtPanel.recordId!, delta)}
        />
      )}

      {error && <div className="alert-error mt-3">{error}</div>}
    </div>
  );
}