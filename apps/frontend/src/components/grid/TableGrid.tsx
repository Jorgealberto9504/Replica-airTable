// apps/frontend/src/components/grid/TableGrid.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';

import {
  listFields, createField, updateField, deleteField, listOptions,
  type Field, type FieldType,
} from '../../api/fields';
import { queryRecords, createRecord, patchRecord, deleteRecord, type SortSpec } from '../../api/records';

import CommentsPanel from '../comments/Comments.Panel';
import { countCommentsForRecords } from '../../api/comments';

import Modal from './Modal';
import FieldDefForm from './FieldDefForm';
import OptionEditor from './OptionEditor';

import { CellEditor, ReadonlyCell, toDataTypeAttr, printCellTitle } from './CellEditors';

import GridToolbar from './GridToolbar';
import ColumnMenu from './ColumnMenu';
import RowMenu from './RowMenu';

import GridFilters, { type FiltersValue } from './GridFilters';

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

function makeGridTemplate(widths: number[]) {
  const mids = widths.map(w => `${w}px`).join(' ');
  return `var(--grid-id-w) ${mids} var(--grid-addcol-w)`;
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
  const [records, setRecords] = useState<Array<{ id: number; values: Record<string, any> }>>([]);
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

  // Filtros / sort
  const [filters, setFilters] = useState<FiltersValue>({ logic: 'AND', filters: [] });
  const [sort, setSort] = useState<SortSpec[]>([]);
  const [filtersUI, setFiltersUI] = useState<{ open: boolean; anchor: HTMLElement | null }>({ open: false, anchor: null });

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

  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [resizing, setResizing] = useState<{ id: number; startX: number; startW: number } | null>(null);

  useEffect(() => {
    function onMove(ev: MouseEvent) {
      if (!resizing) return;
      const dx = ev.clientX - resizing.startX;
      const next = Math.max(MIN_COL_W, Math.min(MAX_COL_W, resizing.startW + dx));
      setColWidths((prev) => ({ ...prev, [resizing.id]: next }));
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

  // Carga con AbortController (ágil al mover filtros/paginación)
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [f, r] = await Promise.all([
          listFields(baseId, tableId),
          queryRecords(baseId, tableId, {
            page, pageSize,
            logic: filters.logic,
            filters: filters.filters,
            sort,
            signal: ac.signal,
          }),
        ]);
        if (!alive) return;
        const withOptions = await ensureSelectOptions(baseId, tableId, f.fields);
        if (!alive) return;

        setFields(withOptions);
        setRecords(r.records);
        setTotal(r.total);

        setColWidths((prev) => {
          const next = { ...prev };
          withOptions.forEach(ff => { if (next[ff.id] == null) next[ff.id] = DEFAULT_COL_W; });
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

  useEffect(() => {
    if (!records.length) { setCommentCounts({}); return; }
    let alive = true;
    (async () => {
      try {
        const ids = records.map(r => r.id);
        const map = await countCommentsForRecords(baseId, tableId, ids);
        if (alive) setCommentCounts(map);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [baseId, tableId, records]);

  async function commitCell(recordId: number, fieldId: number, next: any) {
    if (!effectivePerms.canUpdate) { alert('No tienes permisos para editar registros en esta base.'); return; }
    try {
      setRecords((prev) => prev.map((r) =>
        r.id === recordId ? { ...r, values: { ...r.values, [String(fieldId)]: next } } : r
      ));
      await patchRecord(baseId, tableId, recordId, { [String(fieldId)]: next });
    } catch (e: any) {
      alert(e?.message || 'No se pudo guardar'); setPage(p => p);
    }
  }

  async function handleAddRow() {
    if (!effectivePerms.canCreate) { alert('No tienes permisos para crear registros.'); return; }
    try {
      const r = await createRecord(baseId, tableId, {});
      setRecords((prev) => [...prev, { id: r.record.id, values: {} }]);
      setTotal((t) => t + 1);
      setTimeout(() => containerRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 50);
    } catch (e: any) { alert(e?.message || 'No se pudo crear la fila'); }
  }

  async function handleDeleteRow(id: number) {
    if (!effectivePerms.canDelete) { alert('No tienes permisos para eliminar registros.'); return; }
    if (!confirm('¿Eliminar esta fila?')) return;
    try {
      await deleteRecord(baseId, tableId, id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setCommentCounts(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e: any) { alert(e?.message || 'No se pudo eliminar'); }
  }

  function openColumnMenu(e: React.MouseEvent, f: Field) {
    if (!canManageFields) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setColumnMenu({ field: f, x: rect.left, y: rect.bottom + 4 });
  }

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

  const widths = fields.map(f => colWidths[f.id] ?? DEFAULT_COL_W);
  const gridTemplate = makeGridTemplate(widths);
  const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: gridTemplate };

  function startResize(fid: number, e: React.MouseEvent) {
    e.preventDefault();
    if (!canManageFields) return;
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const startW = th.getBoundingClientRect().width;
    setResizing({ id: fid, startX: e.clientX, startW });
  }

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
  }

  return (
    <div className="grid-card">
      <GridToolbar
        total={total}
        page={page}
        pageSize={pageSize}
        onChangePage={setPage}
        onChangePageSize={(n) => { setPage(1); setPageSize(n); }}
        onOpenFilters={(anchor) => setFiltersUI({ open: true, anchor })}
      />

      <GridFilters
        open={filtersUI.open}
        anchorEl={filtersUI.anchor}
        fields={fields}
        initial={filters}
        scrollContainerRef={containerRef}
        onApply={(f) => { setFilters(f); setPage(1); }}
        onClose={() => setFiltersUI({ open: false, anchor: null })}
      />

      <div className="grid-wrap" ref={containerRef}>
        {/* Header */}
        <div className="grid-row grid-header" style={rowStyle}>
          <div className="grid-th id-col">#</div>

          {fields.map((f) => (
            <div
              key={f.id}
              className="grid-th"
              title={`${f.name} (${f.type})`}
              onMouseEnter={() => setHoverCol(f.id)}
              onMouseLeave={() => setHoverCol((c) => (c === f.id ? null : c))}
            >
              {canManageFields && (
                <button
                  className="th-menu-btn"
                  style={{ opacity: hoverCol === f.id ? 1 : 0 }}
                  onClick={(e) => openColumnMenu(e, f)}
                  aria-label="Abrir menú de columna"
                >▾</button>
              )}

              <div className="th-inner">
                <span className="th-title">{f.name}</span>
              </div>

              {canManageFields && (
                <span className="col-resizer" onMouseDown={(e) => startResize(f.id, e)} />
              )}
            </div>
          ))}

          <div className="grid-th add-col">
            {canManageFields && (
              <button
                className="add-col-btn"
                title="Agregar columna"
                onClick={() => {
                  setAddColOpen(true);
                  setNewColType('TEXT');
                  setNewColName('');
                  setNewSelectOpts(['Opción 1', 'Opción 2']);
                }}
              >+</button>
            )}
          </div>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="grid-empty">Cargando…</div>
        ) : records.length === 0 ? (
          <div className="grid-empty">No hay registros.</div>
        ) : (
          records.map((r, idx) => {
            const rowNumber = (page - 1) * pageSize + idx + 1;
            return (
              <div
                key={r.id}
                className="grid-row"
                style={rowStyle}
                onContextMenu={(e) => openRowContextMenu(e, r.id)}
              >
                <div className="grid-td id-col">
                  <span>{rowNumber}</span>

                  {(commentCounts[r.id] ?? 0) > 0 && (
                    <button
                      className="icon-btn ml-1"
                      title={`Comentarios (${commentCounts[r.id]})`}
                      onClick={() => setCmtPanel({ open: true, recordId: r.id })}
                    >
                      💬
                    </button>
                  )}
                </div>

                {fields.map((f) => (
                  <div
                    key={`${r.id}-${f.id}`}
                    className="grid-td"
                    data-type={toDataTypeAttr(f.type)}
                    title={printCellTitle(fieldById(f.id), r.values[String(f.id)])}
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
                  </div>
                ))}
              </div>
            );
          })
        )}

        {effectivePerms.canCreate && (
          <div className="grid-add-row">
            <button className="grid-add-btn" title="Agregar fila" onClick={handleAddRow}>+</button>
          </div>
        )}
      </div>

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