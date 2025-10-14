import { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type React from 'react';
import type { Field } from '../../api/fields';

type LogicOp = 'AND' | 'OR';

export type FilterCond = {
  kind: 'cond';
  fieldId: number;
  op: string;
  value?: any;
  values?: any[];
};

export type FiltersValue = {
  logic: LogicOp;
  filters: FilterCond[];
};

type Props = {
  anchorEl: HTMLElement | null;
  open: boolean;
  fields: Field[];
  initial?: FiltersValue;
  onApply: (val: FiltersValue) => void;
  onClose: () => void;
  scrollContainerRef?: React.RefObject<HTMLElement>;
};

function toMinutesMaybe(v: string | number) {
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [hh, mm] = s.split(':').map(Number);
    return hh * 60 + mm;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function move<T>(arr: T[], from: number, to: number) {
  if (from === to) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

const MIN_W = 320;
const MAX_W = 720;

export default function GridFilters({
  anchorEl,
  open,
  fields,
  initial,
  onApply,
  onClose,
  scrollContainerRef,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [logic, setLogic] = useState<LogicOp>(initial?.logic ?? 'AND');
  const [rows, setRows] = useState<Array<Partial<FilterCond>>>(
    initial?.filters?.length ? initial!.filters!.map(f => ({ ...f })) : []
  );

  // Sincroniza al abrir (por si cambiaron filtros desde fuera)
  useEffect(() => {
    if (!open) return;
    setLogic(initial?.logic ?? 'AND');
    setRows(initial?.filters?.length ? initial!.filters!.map(f => ({ ...f })) : []);
  }, [open, initial]);

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

  // Posición (viewport) + límites (ancho fluido)
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
      display: 'inline-block', // ➜ se ajusta al contenido
      minWidth,
      maxWidth,
      maxHeight,
      overflowY: 'auto',
      zIndex: 1450,
    };
  }, [anchorEl]);

  const fieldMap = useMemo(() => new Map(fields.map(f => [f.id, f])), [fields]);

  const opsByType: Record<string, Array<{ value: string; label: string }>> = {
    TEXT: [
      { value: 'contains', label: 'contiene' },
      { value: 'notcontains', label: 'no contiene' },
      { value: 'eq', label: 'es exactamente' },
      { value: 'neq', label: 'es distinto a' },
      { value: 'isempty', label: 'está vacío' },
      { value: 'notempty', label: 'no está vacío' },
    ],
    LONG_TEXT: [
      { value: 'contains', label: 'contiene' },
      { value: 'notcontains', label: 'no contiene' },
      { value: 'eq', label: 'es exactamente' },
      { value: 'neq', label: 'es distinto a' },
      { value: 'isempty', label: 'está vacío' },
      { value: 'notempty', label: 'no está vacío' },
    ],
    NUMBER: [
      { value: 'eq', label: 'igual a' },
      { value: 'neq', label: 'distinto a' },
      { value: 'gt', label: '>' },
      { value: 'gte', label: '>=' },
      { value: 'lt', label: '<' },
      { value: 'lte', label: '<=' },
      { value: 'between', label: 'entre' },
      { value: 'isempty', label: 'está vacío' },
      { value: 'notempty', label: 'no está vacío' },
    ],
    CURRENCY: [
      { value: 'eq', label: 'igual a' },
      { value: 'neq', label: 'distinto a' },
      { value: 'gt', label: '>' },
      { value: 'gte', label: '>=' },
      { value: 'lt', label: '<' },
      { value: 'lte', label: '<=' },
      { value: 'between', label: 'entre' },
      { value: 'isempty', label: 'está vacío' },
      { value: 'notempty', label: 'no está vacío' },
    ],
    CHECKBOX: [
      { value: 'istrue', label: 'es verdadero' },
      { value: 'isfalse', label: 'es falso' },
      { value: 'isempty', label: 'está vacío' },
      { value: 'notempty', label: 'no está vacío' },
    ],
    DATE: [
      { value: 'on', label: 'el día' },
      { value: 'before', label: 'antes de' },
      { value: 'after', label: 'después de' },
      { value: 'between', label: 'entre días' },
      { value: 'isempty', label: 'está vacío' },
      { value: 'notempty', label: 'no está vacío' },
    ],
    DATETIME: [
      { value: 'on', label: 'el día (local)' },
      { value: 'before', label: 'antes de' },
      { value: 'after', label: 'después de' },
      { value: 'between', label: 'entre días' },
      { value: 'isempty', label: 'está vacío' },
      { value: 'notempty', label: 'no está vacío' },
    ],
    TIME: [
      { value: 'eq', label: 'igual a' },
      { value: 'gt', label: 'mayor que' },
      { value: 'gte', label: 'mayor/igual' },
      { value: 'lt', label: 'menor que' },
      { value: 'lte', label: 'menor/igual' },
      { value: 'between', label: 'entre' },
      { value: 'isempty', label: 'está vacío' },
      { value: 'notempty', label: 'no está vacío' },
    ],
    SINGLE_SELECT: [
      { value: 'eq', label: 'es' },
      { value: 'neq', label: 'no es' },
      { value: 'isempty', label: 'sin selección' },
      { value: 'notempty', label: 'con selección' },
    ],
    MULTI_SELECT: [
      { value: 'includes_any', label: 'incluye alguna de' },
      { value: 'includes_all', label: 'incluye todas' },
      { value: 'excludes_any', label: 'excluye alguna' },
      { value: 'isempty', label: 'sin selección' },
      { value: 'notempty', label: 'con selección' },
    ],
  };

  const addRow = () => {
    const first = fields[0];
    if (!first) return;
    setRows(r => [...r, { kind: 'cond', fieldId: first.id, op: opsByType[first.type][0].value }]);
  };

  const updateRow = (idx: number, patch: Partial<FilterCond>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  // ===== Drag & Drop (reordenar condiciones) =====
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function onDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx)); // requerido por Firefox
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

  const handleApply = () => {
    const filters: FilterCond[] = rows
      .map(r => {
        const fieldId = Number(r.fieldId);
        const field = fieldMap.get(fieldId);
        if (!field) return null;
        const op = String(r.op ?? '').trim();
        if (!op) return null;

        if (field.type === 'TIME') {
          if (op === 'between') {
            const [a, b] = Array.isArray(r.values) ? r.values : [];
            const A = toMinutesMaybe(a as any);
            const B = toMinutesMaybe(b as any);
            if (A == null || B == null) return null;
            return { kind: 'cond', fieldId, op, values: [A, B] };
          }
          const m = toMinutesMaybe(r.value as any);
          return m == null ? null : { kind: 'cond', fieldId, op, value: m };
        }

        if (field.type === 'NUMBER' || field.type === 'CURRENCY') {
          if (op === 'between') {
            const [a, b] = Array.isArray(r.values) ? r.values : [];
            if (a == null || b == null) return null;
            return { kind: 'cond', fieldId, op, values: [Number(a), Number(b)] };
          }
          if (r.value == null || r.value === '') return null;
          return { kind: 'cond', fieldId, op, value: Number(r.value) };
        }

        if (field.type === 'DATE' || field.type === 'DATETIME') {
          if (op === 'between') {
            const [a, b] = Array.isArray(r.values) ? r.values : [];
            if (!a || !b) return null;
            return { kind: 'cond', fieldId, op, value: [String(a), String(b)] };
          }
          if (op === 'isempty' || op === 'notempty') return { kind: 'cond', fieldId, op };
          if (!r.value) return null;
          return { kind: 'cond', fieldId, op, value: String(r.value) };
        }

        if (field.type === 'SINGLE_SELECT') {
          if (op === 'isempty' || op === 'notempty') return { kind: 'cond', fieldId, op };
          if (r.value == null || r.value === '') return null;
          return { kind: 'cond', fieldId, op, value: Number(r.value) };
        }

        if (field.type === 'MULTI_SELECT') {
          if (op === 'isempty' || op === 'notempty') return { kind: 'cond', fieldId, op };
          const arr = Array.isArray(r.values) ? r.values.map(Number).filter(Number.isFinite) : [];
          if (!arr.length) return null;
          return { kind: 'cond', fieldId, op, values: arr };
        }

        if (field.type === 'CHECKBOX') {
          return { kind: 'cond', fieldId, op };
        }

        if (op === 'isempty' || op === 'notempty') return { kind: 'cond', fieldId, op };
        if (r.value == null) return null;
        return { kind: 'cond', fieldId, op, value: String(r.value) };
      })
      .filter(Boolean) as FilterCond[];

    onApply({ logic, filters });
    onClose();
  };

  const handleClear = () => {
    setRows([]);
    onApply({ logic: 'AND', filters: [] });
    onClose();
  };

  if (!open) return null;

  const panel = (
    <div ref={panelRef} className="context-panel" style={style}>
      <div className="p-2">
        <div className="mb-2 flex items-center gap-2">
          <span className="muted">Coinciden</span>
          <select className="select" value={logic} onChange={(e) => setLogic(e.target.value as LogicOp)}>
            <option value="AND">todas las condiciones</option>
            <option value="OR">alguna condición</option>
          </select>
          <button className="btn ml-auto" onClick={addRow}>+ Añadir condición</button>
        </div>

        {rows.length === 0 ? (
          <div className="muted text-sm py-3">Sin condiciones.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, idx) => {
              const f = fieldMap.get(Number(r.fieldId) || 0) ?? fields[0];
              const ops = opsByType[f.type];

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
                  {/* handle de arrastre */}
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
                    onChange={(e) => {
                      const fid = Number(e.target.value);
                      const nf = fieldMap.get(fid)!;
                      const firstOp = opsByType[nf.type][0].value;
                      updateRow(idx, { fieldId: fid, op: firstOp, value: undefined, values: undefined });
                    }}
                  >
                    {fields.map(ff => <option key={ff.id} value={ff.id}>{ff.name}</option>)}
                  </select>

                  <select
                    className="select"
                    value={r.op ?? ops[0].value}
                    onChange={(e) => updateRow(idx, { op: e.target.value })}
                  >
                    {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>

                  {/* Inputs contextuales */}
                  {(() => {
                    const op = String(r.op ?? ops[0].value);
                    if (f.type === 'CHECKBOX' || op === 'isempty' || op === 'notempty') return null;

                    if (f.type === 'NUMBER' || f.type === 'CURRENCY') {
                      if (op === 'between') {
                        const [a, b] = Array.isArray(r.values) ? r.values : [];
                        return (
                          <>
                            <input className="input w-24" type="number" value={a ?? ''} onChange={(e) =>
                              updateRow(idx, { values: [e.target.value, b] })
                            } />
                            <span className="muted">y</span>
                            <input className="input w-24" type="number" value={b ?? ''} onChange={(e) =>
                              updateRow(idx, { values: [a, e.target.value] })
                            } />
                          </>
                        );
                      }
                      return (
                        <input className="input w-32" type="number" value={r.value ?? ''} onChange={(e) =>
                          updateRow(idx, { value: e.target.value })
                        } />
                      );
                    }

                    if (f.type === 'DATE' || f.type === 'DATETIME') {
                      if (op === 'between') {
                        const [a, b] = Array.isArray(r.values) ? r.values : [];
                        return (
                          <>
                            <input className="input w-36" type="date" value={a ?? ''} onChange={(e) =>
                              updateRow(idx, { values: [e.target.value, b] })
                            } />
                            <span className="muted">y</span>
                            <input className="input w-36" type="date" value={b ?? ''} onChange={(e) =>
                              updateRow(idx, { values: [a, e.target.value] })
                            } />
                          </>
                        );
                      }
                      return (
                        <input className="input w-36" type="date" value={r.value ?? ''} onChange={(e) =>
                          updateRow(idx, { value: e.target.value })
                        } />
                      );
                    }

                    if (f.type === 'TIME') {
                      if (op === 'between') {
                        const [a, b] = Array.isArray(r.values) ? r.values : [];
                        return (
                          <>
                            <input className="input w-24" placeholder="HH:mm o min" value={a ?? ''} onChange={(e) =>
                              updateRow(idx, { values: [e.target.value, b] })
                            } />
                            <span className="muted">y</span>
                            <input className="input w-24" placeholder="HH:mm o min" value={b ?? ''} onChange={(e) =>
                              updateRow(idx, { values: [a, e.target.value] })
                            } />
                          </>
                        );
                      }
                      return (
                        <input className="input w-28" placeholder="HH:mm o min" value={r.value ?? ''} onChange={(e) =>
                          updateRow(idx, { value: e.target.value })
                        } />
                      );
                    }

                    if (f.type === 'SINGLE_SELECT') {
                      return (
                        <select className="select" value={r.value ?? ''} onChange={(e) => updateRow(idx, { value: e.target.value })}>
                          <option value="">— Seleccionar —</option>
                          {(f.options ?? []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                      );
                    }

                    if (f.type === 'MULTI_SELECT') {
                      const sel = Array.isArray(r.values) ? r.values.map(String) : [];
                      return (
                        <select
                          className="select"
                          multiple
                          value={sel}
                          onChange={(e) => {
                            const list = Array.from(e.target.selectedOptions).map(o => o.value);
                            updateRow(idx, { values: list });
                          }}
                          style={{ minWidth: 180, height: 80 }}
                        >
                          {(f.options ?? []).map(o => <option key={o.id} value={String(o.id)}>{o.label}</option>)}
                        </select>
                      );
                    }

                    return (
                      <input className="input w-44" value={r.value ?? ''} onChange={(e) =>
                        updateRow(idx, { value: e.target.value })
                      } />
                    );
                  })()}

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