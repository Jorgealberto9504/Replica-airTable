// apps/frontend/src/components/grid/CellEditors.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Field, FieldType } from '../../api/fields';

/* =========================
   Estilos base
   ========================= */
const inputBaseCls =
  'w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500';

/* =========================
   Expuestos al grid
   ========================= */
export function ReadonlyCell({ field, value }: { field: Field; value: any }) {
  if (value == null) return <span className="text-gray-400">—</span>;

  if (field.type === 'SINGLE_SELECT') {
    const hit = field.options?.find((o) => o.id === value);
    const label = hit ? hit.label : String(value);
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        {label}
      </span>
    );
  }

  if (field.type === 'MULTI_SELECT' && Array.isArray(value)) {
    const labels = value.map(
      (id) => field.options?.find((o) => o.id === id)?.label ?? id
    );
    if (labels.length === 0) return <span className="text-gray-400">—</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {labels.map((lbl, i) => (
          <span
            key={`${lbl}-${i}`}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
          >
            {lbl}
          </span>
        ))}
      </span>
    );
  }

  if (field.type === 'CHECKBOX') {
    return (
      <span className="inline-flex items-center justify-center">
        {value ? '✓' : ''}
      </span>
    );
  }

  if (field.type === 'TIME' && typeof value === 'number') {
    return <span className="text-gray-800">{toHHmm(value)}</span>;
  }

  return <span className="text-gray-800">{String(value)}</span>;
}

export function CellEditor({
  field,
  value,
  onCommit,
}: {
  field: Field;
  value: any;
  onCommit: (v: any) => void;
}) {
  switch (field.type) {
    case 'TEXT':
      return <TextInput value={value ?? ''} onCommit={onCommit} />;
    case 'LONG_TEXT':
      return <TextInput value={value ?? ''} onCommit={onCommit} multiline />;
    case 'NUMBER':
      return <NumberInput value={value} onCommit={onCommit} allowDecimal />;
    case 'CURRENCY':
      return <NumberInput value={value} onCommit={onCommit} allowDecimal />;
    case 'CHECKBOX':
      return (
        <label className="inline-flex items-center justify-center w-full">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onCommit(e.target.checked)}
            className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
          />
        </label>
      );
    case 'DATE':
      return (
        <input
          className={inputBaseCls}
          type="date"
          value={value ? toDateInput(value) : ''}
          onChange={(e) => onCommit(e.target.value || null)}
        />
      );
    case 'DATETIME':
      return (
        <input
          className={inputBaseCls}
          type="datetime-local"
          value={value ? toDateTimeLocal(value) : ''}
          onChange={(e) => onCommit(e.target.value || null)}
        />
      );
    case 'TIME':
      return (
        <input
          className={inputBaseCls}
          type="time"
          value={value == null ? '' : toHHmm(value)}
          onChange={(e) => onCommit(parseTimeToMinutes(e.target.value))}
        />
      );
    case 'SINGLE_SELECT': {
      const opts = field.options ?? [];
      return (
        <select
          className={inputBaseCls}
          value={value ?? ''}
          onChange={(e) =>
            onCommit(e.target.value === '' ? null : Number(e.target.value))
          }
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case 'MULTI_SELECT': {
      const opts = field.options ?? [];
      const arr: number[] = Array.isArray(value) ? value : [];
      return (
        <MultiSelect
          options={opts.map((o) => ({ value: o.id, label: o.label }))}
          value={arr}
          onChange={onCommit}
        />
      );
    }
    default:
      return <span className="text-gray-400">—</span>;
  }
}

/** Helpers que usa TableGrid para título del tooltip y data-attr */
export function toDataTypeAttr(t: FieldType) {
  switch (t) {
    case 'NUMBER':
    case 'CURRENCY':
      return 'number';
    case 'CHECKBOX':
      return 'checkbox';
    case 'DATE':
      return 'date';
    case 'DATETIME':
      return 'datetime';
    case 'TIME':
      return 'time';
    default:
      return 'text';
  }
}

export function printCellTitle(field: Field, v: any): string {
  if (v == null) return '';
  if (field.type === 'SINGLE_SELECT') {
    const hit = field.options?.find((o) => o.id === v);
    return hit ? hit.label : String(v);
  }
  if (field.type === 'MULTI_SELECT' && Array.isArray(v)) {
    return v
      .map((id) => field.options?.find((o) => o.id === id)?.label ?? id)
      .join(', ');
  }
  return String(v);
}

/* =========================
   Controles internos
   ========================= */
function TextInput({
  value,
  onCommit,
  multiline = false,
}: {
  value: string;
  onCommit: (v: string | null) => void;
  multiline?: boolean;
}) {
  const [buf, setBuf] = useState(value ?? '');
  const editing = useRef(false);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing.current) setBuf(value ?? '');
  }, [value]);

  function commit() {
    editing.current = false;
    const v = buf === '' ? null : buf;
    if (v !== (value ?? null)) onCommit(v);
  }
  function cancel() {
    editing.current = false;
    setBuf(value ?? '');
    ref.current?.blur();
  }

  const commonProps = {
    className: inputBaseCls,
    value: buf,
    onChange: (e: any) => {
      editing.current = true;
      setBuf(e.target.value);
    },
    onBlur: commit,
    onKeyDown: (e: any) => {
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        commit();
        (e.target as HTMLElement).blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    },
    ref,
  };

  return multiline ? (
    <textarea rows={2} {...(commonProps as any)} />
  ) : (
    <input {...(commonProps as any)} />
  );
}

function NumberInput({
  value,
  onCommit,
  allowDecimal = true,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  allowDecimal?: boolean;
}) {
  const [buf, setBuf] = useState(value == null ? '' : String(value));
  const editing = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing.current) setBuf(value == null ? '' : String(value));
  }, [value]);

  function parseNumber(s: string) {
    if (s.trim() === '') return null;
    const n = allowDecimal ? parseFloat(s) : parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }
  function commit() {
    editing.current = false;
    const parsed = parseNumber(buf);
    if (parsed !== (value ?? null)) onCommit(parsed);
  }
  function cancel() {
    editing.current = false;
    setBuf(value == null ? '' : String(value));
    ref.current?.blur();
  }

  return (
    <input
      className={inputBaseCls}
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={buf}
      onChange={(e) => {
        editing.current = true;
        setBuf(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.target as HTMLElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      ref={ref}
    />
  );
}

function MultiSelect({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: number; label: string }>;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number }>({
    left: 0,
    top: 0,
    width: 220,
  });

  const label =
    value.length === 0
      ? '—'
      : `${value.length} ${value.length === 1 ? 'seleccionada' : 'seleccionadas'}`;

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
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(v: number) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        className={`${inputBaseCls} text-left truncate`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {label}
      </button>

      {open &&
        createPortal(
          <div
            id="ms-portal"
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-1"
            style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
          >
            <div className="max-h-60 overflow-auto p-1">
              {options.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(o.value)}
                    onChange={() => toggle(o.value)}
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-gray-800">{o.label}</span>
                </label>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/* =========================
   Helpers internos de formato
   ========================= */
function toDateInput(v: any) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function toDateTimeLocal(v: any) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function toHHmm(minutes: number) {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function parseTimeToMinutes(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}