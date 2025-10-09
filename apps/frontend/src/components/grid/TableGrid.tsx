import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  listFields, createField, updateField, deleteField, listOptions,
  type Field, type FieldType,
} from '../../api/fields';
import { queryRecords, createRecord, patchRecord, deleteRecord } from '../../api/records';

// 👇 NUEVO
import CommentsPanel from '../comments/Comments.Panel';
import { countCommentsForRecords } from '../../api/comments';

type RecordPerms = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canComment: boolean;
};

type Props = {
  baseId: number;
  tableId: number;
  /** Permisos de registros (del BaseView, ya resueltos) */
  perms?: RecordPerms;
  /** ¿Puede administrar esquema (owner/admin o permiso explícito)? */
  canManageFields?: boolean;
};

const FIELD_TYPES: FieldType[] = [
  'TEXT','LONG_TEXT','NUMBER','CURRENCY','CHECKBOX','DATE','DATETIME','TIME','SINGLE_SELECT','MULTI_SELECT',
];

const DEFAULT_COL_W = 180; // px
const MIN_COL_W = 120;
const MAX_COL_W = 800;

/** Construye la plantilla de columnas del grid con anchos específicos */
function makeGridTemplate(widths: number[]) {
  const mids = widths.map(w => `${w}px`).join(' ');
  // # + campos + add-col
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

  // === Menú contextual de fila (clic derecho) ===
  const [rowMenu, setRowMenu] = useState<{ recordId: number; x: number; y: number } | null>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);

  // 👇 NUEVO: estado del panel de comentarios y conteos
  const [cmtPanel, setCmtPanel] = useState<{ open: boolean; recordId: number | null }>({ open: false, recordId: null });
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});

  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú de columna al hacer clic fuera / Escape / scroll
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

  // Cerrar menú de fila al hacer clic fuera / Escape / scroll
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

  // Anchos por columna + estado de resize
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

  async function load() {
    setLoading(true);
    try {
      const [f, r] = await Promise.all([
        listFields(baseId, tableId),
        queryRecords(baseId, tableId, { page, pageSize }),
      ]);
      const withOptions = await ensureSelectOptions(baseId, tableId, f.fields);
      setFields(withOptions);
      setRecords(r.records);
      setTotal(r.total);

      // Inicializa anchos para nuevas columnas
      setColWidths((prev) => {
        const next = { ...prev };
        withOptions.forEach(ff => { if (next[ff.id] == null) next[ff.id] = DEFAULT_COL_W; });
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-line */ }, [baseId, tableId, page, pageSize]);

  // 👇 NUEVO: cargar conteos de comentarios para las filas visibles
  useEffect(() => {
    if (!records.length) { setCommentCounts({}); return; }
    let alive = true;
    (async () => {
      try {
        const ids = records.map(r => r.id);
        const map = await countCommentsForRecords(baseId, tableId, ids);
        if (alive) setCommentCounts(map);
      } catch {
        /* ignore */
      }
    })();
    return () => { alive = false; };
  }, [baseId, tableId, records]);

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

  async function commitCell(recordId: number, fieldId: number, next: any) {
    if (!effectivePerms.canUpdate) {
      alert('No tienes permisos para editar registros en esta base.');
      return;
    }
    try {
      setRecords((prev) => prev.map((r) => (r.id === recordId ? { ...r, values: { ...r.values, [String(fieldId)]: next } } : r)));
      await patchRecord(baseId, tableId, recordId, { [String(fieldId)]: next });
    } catch (e: any) {
      alert(e?.message || 'No se pudo guardar'); load();
    }
  }

  async function handleAddRow() {
    if (!effectivePerms.canCreate) {
      alert('No tienes permisos para crear registros.');
      return;
    }
    try {
      const r = await createRecord(baseId, tableId, {});
      setRecords((prev) => [...prev, { id: r.record.id, values: {} }]);
      setTotal((t) => t + 1);
      setTimeout(() => containerRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 50);
    } catch (e: any) { alert(e?.message || 'No se pudo crear la fila'); }
  }

  async function handleDeleteRow(id: number) {
    if (!effectivePerms.canDelete) {
      alert('No tienes permisos para eliminar registros.');
      return;
    }
    if (!confirm('¿Eliminar esta fila?')) return;
    try {
      await deleteRecord(baseId, tableId, id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      // Limpia conteo si existía
      setCommentCounts(prev => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    } catch (e: any) { alert(e?.message || 'No se pudo eliminar'); }
  }

  function openColumnMenu(e: React.MouseEvent, f: Field) {
    if (!canManageFields) return; // solo admins/owner/schemaManage
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setColumnMenu({ field: f, x: rect.left, y: rect.bottom + 4 });
  }

  // ===== Crear columna =====
  async function submitAddColumn() {
    if (!canManageFields) return;
    if (!newColName.trim()) return;

    const isSelect = newColType === 'SINGLE_SELECT' || newColType === 'MULTI_SELECT';
    const cleaned = isSelect
      ? newSelectOpts.map(s => s.trim()).filter(Boolean).map(label => ({ label }))
      : undefined;

    try {
      await createField(baseId, tableId, {
        name: newColName.trim(),
        type: newColType,
        options: isSelect ? (cleaned && cleaned.length ? cleaned : [{ label: 'Opción 1' }, { label: 'Opción 2' }]) : undefined,
      });
      setAddColOpen(false);
      setNewColName('');
      setNewColType('TEXT');
      setNewSelectOpts(['Opción 1', 'Opción 2']);
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

  // ===== Renombrar columna =====
  async function submitRenameColumn() {
    if (!canManageFields) return;
    if (!renameOpen.field || !renameName.trim()) return;
    try {
      const r = await updateField(baseId, tableId, renameOpen.field.id, { name: renameName.trim() });
      setRenameOpen({ open: false });
      setFields((prev) => prev.map((f) => (f.id === r.field.id ? r.field : f)));
    } catch (e: any) { alert(e?.message || 'No se pudo renombrar'); }
  }

  // ===== Cambiar tipo =====
  async function submitChangeType() {
    if (!canManageFields) return;
    if (!typeOpen.field) return;

    const isSelect = typeValue === 'SINGLE_SELECT' || typeValue === 'MULTI_SELECT';
    const cleaned = isSelect
      ? typeSelectOpts.map(s => s.trim()).filter(Boolean).map(label => ({ label }))
      : undefined;

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
    for (const r of records) for (const fid of Object.keys(r.values)) if (r.values[fid] != null) used.set(Number(fid), true);
    return used;
  }, [fields, records]);

  // Anchos actuales por campo
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

  // === abrir menú de fila (click derecho) ===
  function openRowContextMenu(e: React.MouseEvent, recordId: number) {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 140);
    setRowMenu({ recordId, x, y });
  }

  // 👇 NUEVO: helper para actualizar badge del record activo
  function applyDeltaToRecord(recordId: number, delta: number) {
    setCommentCounts(prev => ({
      ...prev,
      [recordId]: Math.max(0, (prev[recordId] ?? 0) + delta),
    }));
  }

  return (
    <div className="grid-card">
      <div className="grid-toolbar">
        <div className="muted">Registros: {total}</div>
        <div className="ml-auto flex items-center gap-2">
          <select className="select" value={pageSize} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}>
            {[10,25,50,100].map(n => <option key={n} value={n}>{n}/página</option>)}
          </select>
          <span className="muted">Página {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
          <button className="icon-btn" onClick={() => setPage(p => Math.max(1, p - 1))}>◀</button>
          <button className="icon-btn" onClick={() => setPage(p => Math.min(Math.ceil(total / pageSize) || 1, p + 1))}>▶</button>
        </div>
      </div>

      <div className="grid-wrap" ref={containerRef}>
        {/* Header */}
        <div className="grid-row grid-header" style={rowStyle}>
          {/* # */}
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

          {/* Add column */}
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
                  {/* Botón de comentarios */}
                  
                
                  {commentCounts[r.id] > 0 && (
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

        {/* Add row bar */}
        {effectivePerms.canCreate && (
          <div className="grid-add-row">
            <button className="grid-add-btn" title="Agregar fila" onClick={handleAddRow}>+</button>
          </div>
        )}
      </div>

      {/* Column context menu */}
      {columnMenu && canManageFields && (
        <>
          <div className="context-overlay" onClick={() => setColumnMenu(null)} />
          <div
            ref={menuRef}
            className="context-panel"
            style={{ position:'fixed', left:columnMenu.x, top:columnMenu.y }}
          >
            <div
              className="menu-item"
              onClick={() => {
                setRenameOpen({ open:true, field:columnMenu.field });
                setRenameName(columnMenu.field.name);
                setColumnMenu(null);
              }}
            >Renombrar…</div>

            <div
              className="menu-item"
              onClick={() => {
                setTypeOpen({ open:true, field:columnMenu.field });
                setTypeValue(columnMenu.field.type);
                if (columnMenu.field.type === 'SINGLE_SELECT' || columnMenu.field.type === 'MULTI_SELECT') {
                  setTypeSelectOpts((columnMenu.field.options ?? []).map(o => o.label));
                } else {
                  setTypeSelectOpts(['Opción 1','Opción 2']);
                }
                setColumnMenu(null);
              }}
            >Cambiar tipo…</div>

            <div
              className="menu-item-danger"
              onClick={() => { handleDeleteColumn(columnMenu.field.id); setColumnMenu(null); }}
            >Enviar a papelera</div>
          </div>
        </>
      )}

      {/* Row context menu */}
      {rowMenu && (
        <>
          <div className="context-overlay" onClick={() => setRowMenu(null)} />
          <div
            ref={rowMenuRef}
            className="context-panel"
            style={{ position:'fixed', left:rowMenu.x, top:rowMenu.y, minWidth:220 }}
          >
            <div
              className="menu-item"
              onClick={() => {
                setRowMenu(null);
                setCmtPanel({ open: true, recordId: rowMenu.recordId });
              }}
            >comentarios</div>

            {effectivePerms.canDelete && (
              <div
                className="menu-item-danger"
                onClick={() => { handleDeleteRow(rowMenu.recordId); setRowMenu(null); }}
              >Eliminar fila</div>
            )}
          </div>
        </>
      )}

      {/* Modals esquema */}
      {addColOpen && canManageFields && (
        <Modal title="Nueva columna" onClose={() => setAddColOpen(false)} onConfirm={submitAddColumn} confirmText="Crear">
          <FieldDefForm name={newColName} type={newColType} onName={setNewColName} onType={(t) => {
            setNewColType(t);
            if ((t === 'SINGLE_SELECT' || t === 'MULTI_SELECT') && newSelectOpts.length === 0) {
              setNewSelectOpts(['Opción 1', 'Opción 2']);
            }
          }} />
          {(newColType === 'SINGLE_SELECT' || newColType === 'MULTI_SELECT') && (
            <>
              <div className="muted mt-2 text-xs">Define las opciones del {newColType === 'SINGLE_SELECT' ? 'Single Select' : 'Multi Select'}.</div>
              <OptionEditor options={newSelectOpts} onChange={setNewSelectOpts} />
            </>
          )}
        </Modal>
      )}

      {renameOpen.open && renameOpen.field && canManageFields && (
        <Modal title="Renombrar columna" onClose={() => setRenameOpen({ open:false })} onConfirm={submitRenameColumn} confirmText="Guardar">
          <div className="field">
            <label className="label">Nombre</label>
            <input className="input" value={renameName} onChange={(e) => setRenameName(e.target.value)} />
          </div>
        </Modal>
      )}

      {typeOpen.open && typeOpen.field && canManageFields && (
        <Modal title="Cambiar tipo" onClose={() => setTypeOpen({ open:false })} onConfirm={submitChangeType} confirmText="Cambiar">
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

      {/* 👇 NUEVO: Drawer de comentarios */}
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

/* =========================
   Cell Editors / Readonly view
   ========================= */
function ReadonlyCell({ field, value }: { field: Field; value: any }) {
  if (value == null) return <span className="muted">—</span>;
  if (field.type === 'SINGLE_SELECT') {
    const hit = field.options?.find((o) => o.id === value);
    return <span>{hit ? hit.label : String(value)}</span>;
  }
  if (field.type === 'MULTI_SELECT' && Array.isArray(value)) {
    return <span>{value.map((id) => field.options?.find((o) => o.id === id)?.label ?? id).join(', ')}</span>;
  }
  if (field.type === 'CHECKBOX') return <span>{value ? '✓' : ''}</span>;
  if (field.type === 'TIME' && typeof value === 'number') return <span>{toHHmm(value)}</span>;
  return <span>{String(value)}</span>;
}

function CellEditor({ field, value, onCommit }: { field: Field; value: any; onCommit: (v: any) => void; }) {
  switch (field.type) {
    case 'TEXT':       return <TextInput value={value ?? ''} onCommit={onCommit} />;
    case 'LONG_TEXT':  return <TextInput value={value ?? ''} onCommit={onCommit} multiline />;
    case 'NUMBER':     return <NumberInput value={value} onCommit={onCommit} allowDecimal />;
    case 'CURRENCY':   return <NumberInput value={value} onCommit={onCommit} allowDecimal />;
    case 'CHECKBOX':   return (<label className="checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(e)=>onCommit(e.target.checked)} /></label>);
    case 'DATE':       return <input className="cell-input" type="date" value={value ? toDateInput(value) : ''} onChange={(e)=>onCommit(e.target.value || null)} />;
    case 'DATETIME':   return <input className="cell-input" type="datetime-local" value={value ? toDateTimeLocal(value) : ''} onChange={(e)=>onCommit(e.target.value || null)} />;
    case 'TIME':       return <input className="cell-input" type="time" value={value == null ? '' : toHHmm(value)} onChange={(e)=>onCommit(parseTimeToMinutes(e.target.value))} />;

    case 'SINGLE_SELECT': {
      const opts = field.options ?? [];
      return (
        <select className="cell-input" value={value ?? ''} onChange={(e)=>onCommit(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">—</option>
          {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      );
    }
    case 'MULTI_SELECT': {
      const opts = field.options ?? []; const arr: number[] = Array.isArray(value) ? value : [];
      return <MultiSelect options={opts.map(o => ({ value:o.id, label:o.label }))} value={arr} onChange={onCommit} />;
    }
    default: return <span className="muted">—</span>;
  }
}

/** Texto/LongText con buffer local + commit en blur/Enter/Escape */
function TextInput({ value, onCommit, multiline=false }: { value: string; onCommit:(v:string|null)=>void; multiline?:boolean; }) {
  const [buf, setBuf] = useState(value ?? ''); const editing = useRef(false); const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing.current) setBuf(value ?? ''); }, [value]);

  function commit(){ editing.current=false; const v = buf === '' ? null : buf; if (v !== (value ?? null)) onCommit(v); }
  function cancel(){ editing.current=false; setBuf(value ?? ''); ref.current?.blur(); }

  const commonProps = {
    className:'cell-input', value:buf,
    onChange:(e:any)=>{ editing.current=true; setBuf(e.target.value); },
    onBlur:commit,
    onKeyDown:(e:any)=>{ if(e.key==='Enter' && !multiline){ e.preventDefault(); commit(); (e.target as HTMLElement).blur(); } else if(e.key==='Escape'){ e.preventDefault(); cancel(); } },
    ref
  };
  return multiline ? <textarea rows={2} {...(commonProps as any)} /> : <input {...(commonProps as any)} />;
}

/** Número/Moneda con buffer string y commit en blur/Enter */
function NumberInput({ value, onCommit, allowDecimal=true }: { value:number|null|undefined; onCommit:(v:number|null)=>void; allowDecimal?:boolean; }) {
  const [buf, setBuf] = useState(value==null ? '' : String(value)); const editing = useRef(false); const ref = useRef<HTMLInputElement>(null);
  useEffect(()=>{ if(!editing.current) setBuf(value==null ? '' : String(value)); }, [value]);
  function parseNumber(s:string){ if(s.trim()==='') return null; const n = allowDecimal ? parseFloat(s) : parseInt(s,10); return Number.isFinite(n) ? n : null; }
  function commit(){ editing.current=false; const parsed = parseNumber(buf); if(parsed !== (value ?? null)) onCommit(parsed); }
  function cancel(){ editing.current=false; setBuf(value==null ? '' : String(value)); ref.current?.blur(); }
  return (
    <input className="cell-input" inputMode={allowDecimal?'decimal':'numeric'} value={buf}
      onChange={(e)=>{ editing.current=true; setBuf(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); commit(); (e.target as HTMLElement).blur(); } else if(e.key==='Escape'){ e.preventDefault(); cancel(); } }}
      ref={ref}
    />
  );
}

/** MULTISELECT con panel flotante en PORTAL (siempre encima) */
function MultiSelect({ options, value, onChange }: { options:Array<{value:number;label:string}>; value:number[]; onChange:(v:number[])=>void; }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{left:number; top:number; width:number}>({ left:0, top:0, width:220 });

  const label = value.length ? `${value.length} seleccionadas` : '—';

  function syncPosition() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4, width: r.width });
  }

  useLayoutEffect(() => {
    if (!open) return;
    syncPosition();
    const onResize = () => syncPosition();
    const onScroll = () => syncPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      const panel = document.getElementById('ms-portal');
      if (panel?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent){ if(e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle(v:number){
    if(value.includes(v)) onChange(value.filter(x=>x!==v));
    else onChange([...value, v]);
  }

  return (
    <div className="ms-wrap">
      <button ref={btnRef} className="ms-input" onClick={() => setOpen(o => !o)} aria-expanded={open}>{label}</button>

      {open && createPortal(
        <div id="ms-portal" className="ms-portal-panel" style={{ left:pos.left, top:pos.top, minWidth:pos.width }}>
          {options.map(o => (
            <label key={o.value} className="ms-row">
              <input type="checkbox" checked={value.includes(o.value)} onChange={()=>toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

/* =========================
   Helpers de formato
   ========================= */
function toDataTypeAttr(t: FieldType) {
  switch (t) {
    case 'NUMBER':
    case 'CURRENCY': return 'number';
    case 'CHECKBOX': return 'checkbox';
    case 'DATE': return 'date';
    case 'DATETIME': return 'datetime';
    case 'TIME': return 'time';
    default: return 'text';
  }
}
function printCellTitle(field: Field, v: any): string {
  if (v == null) return '';
  if (field.type === 'SINGLE_SELECT') {
    const hit = field.options?.find((o) => o.id === v);
    return hit ? hit.label : String(v);
  }
  if (field.type === 'MULTI_SELECT' && Array.isArray(v)) {
    return v.map((id) => field.options?.find((o) => o.id === id)?.label ?? id).join(', ');
  }
  return String(v);
}
function toDateInput(v:any){ const d=new Date(v); if(Number.isNaN(d.getTime())) return ''; const yyyy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; }
function toDateTimeLocal(v:any){ const d=new Date(v); if(Number.isNaN(d.getTime())) return ''; const yyyy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); const hh=String(d.getHours()).padStart(2,'0'); const mi=String(d.getMinutes()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}T${hh}:${mi}`; }
function toHHmm(minutes:number){ const hh=Math.floor(minutes/60); const mm=minutes%60; return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }
function parseTimeToMinutes(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/* =========================
   UI mínimas: Modal + FieldDefForm + OptionEditor
   ========================= */
function Modal({
  title, children, onClose, onConfirm, confirmText='Guardar'
}: { title:string; children:any; onClose:()=>void; onConfirm:()=>void; confirmText?:string; }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
        <div className="modal-header">
          <strong>{title}</strong>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

function FieldDefForm({
  name, type, onName, onType
}: { name:string; type:FieldType; onName:(v:string)=>void; onType:(v:FieldType)=>void; }) {
  return (
    <div className="grid gap-2">
      <div className="field">
        <label className="label">Nombre</label>
        <input className="input" value={name} onChange={(e)=>onName(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Tipo</label>
        <select className="select" value={type} onChange={(e)=>onType(e.target.value as FieldType)}>
          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Editor simple de opciones para SELECT */
function OptionEditor({
  options, onChange,
}: { options: string[]; onChange: (opts: string[]) => void }) {
  function update(i: number, v: string) {
    const next = options.slice();
    next[i] = v;
    onChange(next);
  }
  function add() {
    onChange([...options, `Opción ${options.length + 1}`]);
  }
  function remove(i: number) {
    const next = options.slice();
    next.splice(i, 1);
    onChange(next.length ? next : ['Opción 1']);
  }
  return (
    <div className="mt-2">
      <div className="grid gap-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input className="input" value={opt} onChange={(e) => update(i, e.target.value)} placeholder={`Opción ${i+1}`} />
            <button className="btn" onClick={() => remove(i)} title="Eliminar">–</button>
          </div>
        ))}
      </div>
      <div className="mt-2">
        <button className="btn" onClick={add}>Agregar opción</button>
      </div>
    </div>
  );
}