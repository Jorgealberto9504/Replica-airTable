import { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type React from 'react';
import type { Field } from '../../api/fields';
import type { SortSpec } from '../../api/records';

type Props = {
  anchorEl: HTMLElement | null;
  open: boolean;
  fields: Field[];
  initial?: SortSpec[];
  onApply: (val: SortSpec[]) => void;
  onClose: () => void;
  scrollContainerRef?: React.RefObject<HTMLElement>;
};

type Dir = 'asc' | 'desc';
type Nulls = 'first' | 'last' | '';

const MIN_W = 320;   // ancho mínimo cómodo
const MAX_W = 720;   // límite superior, deja que el contenido mande dentro de este rango

const ASC_LABEL: Record<string, string> = {
  TEXT: 'A → Z',
  LONG_TEXT: 'A → Z',
  NUMBER: 'Menor → Mayor',
  CURRENCY: 'Menor → Mayor',
  CHECKBOX: 'false → true',
  DATE: 'Más antiguo → más reciente',
  DATETIME: 'Más antiguo → más reciente',
  TIME: '00:00 → 23:59',
  SINGLE_SELECT: 'Primera → última opción',
  MULTI_SELECT: '—',
};
const DESC_LABEL: Record<string, string> = {
  TEXT: 'Z → A',
  LONG_TEXT: 'Z → A',
  NUMBER: 'Mayor → Menor',
  CURRENCY: 'Mayor → Menor',
  CHECKBOX: 'true → false',
  DATE: 'Más reciente → más antiguo',
  DATETIME: 'Más reciente → más antiguo',
  TIME: '23:59 → 00:00',
  SINGLE_SELECT: 'Última → primera opción',
  MULTI_SELECT: '—',
};

function move<T>(arr: T[], from: number, to: number) {
  if (from === to) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export default function GridSorts({
  anchorEl, open, fields, initial, onApply, onClose, scrollContainerRef,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Array<SortSpec>>(initial?.length ? initial.map(s => ({ ...s })) : []);

  // DnD state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Cierre robusto
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorEl && anchorEl.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onScroll = () => onClose();

    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey);
    scrollContainerRef?.current?.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey);
      scrollContainerRef?.current?.removeEventListener('scroll', onScroll, true);
    };
  }, [open, anchorEl, onClose, scrollContainerRef]);

  // Posición/estilo panel (ancho fluido)
  const style = useMemo<React.CSSProperties>(() => {
    if (!anchorEl) return { display: 'none' };
    const r = anchorEl.getBoundingClientRect();
    const margin = 6;

    const maxWidth = Math.min(window.innerWidth - 16, MAX_W);
    const minWidth = Math.min(maxWidth, MIN_W);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - maxWidth - 8);
    const top = Math.min(r.bottom + margin, window.innerHeight - 8);
    const maxHeight = Math.min(window.innerHeight - top - 8, Math.round(window.innerHeight * 0.7));

    return {
      position: 'fixed',
      top,
      left,
      display: 'inline-block',   // ➜ se ajusta al contenido
      minWidth,
      maxWidth,
      maxHeight,
      overflowY: 'auto',
      zIndex: 1450,
    };
  }, [anchorEl]);

  const fieldMap = useMemo(() => new Map(fields.map(f => [f.id, f])), [fields]);

  const addRow = () => {
    const first = fields[0];
    if (!first) return;
    setRows(r => [...r, { kind: 'field', fieldId: first.id, dir: 'asc' }]);
  };

  const updateRow = (idx: number, patch: Partial<SortSpec> & { nulls?: Nulls }) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleApply = () => {
    const cleaned = rows
      .map(r => {
        const f = fieldMap.get(Number(r.fieldId));
        if (!f) return null;
        const spec: SortSpec = {
          kind: 'field',
          fieldId: Number(r.fieldId),
          dir: (r.dir === 'desc' ? 'desc' : 'asc') as Dir,
        };
        const n = (r as any).nulls as Nulls | undefined;
        if (n === 'first' || n === 'last') (spec as any).nulls = n;
        return spec;
      })
      .filter(Boolean) as SortSpec[];
    onApply(cleaned);
    onClose();
  };

  const handleClear = () => { setRows([]); onApply([]); onClose(); };

  // DnD handlers
  function onDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIdx !== idx) setOverIdx(idx);
  }
  function onDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx == null) return;
    setRows(prev => move(prev, dragIdx, idx));
    setDragIdx(null);
    setOverIdx(null);
  }
  function onDragEnd() {
    setDragIdx(null);
    setOverIdx(null);
  }

  if (!open) return null;

  const panel = (
    <div ref={panelRef} className="context-panel" style={style}>
      <div className="p-2">
        <div className="mb-2 flex items-center gap-2">
          <span className="muted">Ordenar por</span>
          <button className="btn ml-auto" onClick={addRow}>+ Regla</button>
        </div>

        {rows.length === 0 ? (
          <div className="muted text-sm py-3">Sin reglas de orden.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, idx) => {
              const f = fieldMap.get(Number(r.fieldId) || 0) ?? fields[0];
              const ascLabel = ASC_LABEL[f.type] ?? 'Ascendente';
              const descLabel = DESC_LABEL[f.type] ?? 'Descendente';
              const nulls = (r as any).nulls as Nulls | undefined;

              const isDragging = dragIdx === idx;
              const isOver = overIdx === idx;

              return (
                <div
                  key={idx}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDrop={(e) => onDrop(e, idx)}
                  className={[
                    'flex items-center gap-2 rounded-md px-2 py-1',
                    isOver ? 'bg-slate-50 border border-cyan-300' : 'border border-transparent',
                    isDragging ? 'opacity-60' : 'opacity-100'
                  ].join(' ')}
                >
                  {/* Handle */}
                  <button
                    className="icon-btn cursor-move"
                    aria-label="Reordenar"
                    draggable
                    onDragStart={(e) => onDragStart(e, idx)}
                    onDragEnd={onDragEnd}
                    title="Arrastra para reordenar"
                  >
                    ⋮⋮
                  </button>

                  <select
                    className="select"
                    value={r.fieldId ?? f.id}
                    onChange={(e) => updateRow(idx, { fieldId: Number(e.target.value) })}
                  >
                    {fields.map(ff => <option key={ff.id} value={ff.id}>{ff.name}</option>)}
                  </select>

                  <select
                    className="select"
                    value={r.dir ?? 'asc'}
                    onChange={(e) => updateRow(idx, { dir: e.target.value as Dir })}
                  >
                    <option value="asc">{ascLabel}</option>
                    <option value="desc">{descLabel}</option>
                  </select>

                  <select
                    className="select"
                    value={nulls ?? ''}
                    onChange={(e) => updateRow(idx, { nulls: e.target.value as Nulls })}
                  >
                    <option value="">— nulos por defecto —</option>
                    <option value="first">Nulos primero</option>
                    <option value="last">Nulos último</option>
                  </select>

                  <button className="icon-btn ml-auto" title="Eliminar" onClick={() => removeRow(idx)}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        <div className="panel-actions">
          <button className="btn-secondary" onClick={handleClear}>Limpiar</button>
          <button className="btn-primary" onClick={handleApply}>Aplicar</button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(panel, document.body);
}