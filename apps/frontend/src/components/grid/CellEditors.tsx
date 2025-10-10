// apps/frontend/src/components/grid/CellEditors.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Field, FieldType } from '../../api/fields';

/* =========================
   Expuestos al grid
   ========================= */
export function ReadonlyCell({ field, value }: { field: Field; value: any }) {
  if (value == null) return <span className="muted">—</span>;
  if (field.type === 'SINGLE_SELECT') {
    const hit = field.options?.find((o) => o.id === value);
    return <span>{hit ? hit.label : String(value)}</span>;
  }
  if (field.type === 'MULTI_SELECT' && Array.isArray(value)) {
    return (
      <span>
        {value
          .map((id) => field.options?.find((o) => o.id === id)?.label ?? id)
          .join(', ')}
      </span>
    );
  }
  if (field.type === 'CHECKBOX') return <span>{value ? '✓' : ''}</span>;
  if (field.type === 'TIME' && typeof value === 'number') return <span>{toHHmm(value)}</span>;
  return <span>{String(value)}</span>;
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
        <label className="checkbox">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onCommit(e.target.checked)}
          />
        </label>
      );
    case 'DATE':
      return (
        <input
          className="cell-input"
          type="date"
          value={value ? toDateInput(value) : ''}
          onChange={(e) => onCommit(e.target.value || null)}
        />
      );
    case 'DATETIME':
      return (
        <input
          className="cell-input"
          type="datetime-local"
          value={value ? toDateTimeLocal(value) : ''}
          onChange={(e) => onCommit(e.target.value || null)}
        />
      );
    case 'TIME':
      return (
        <input
          className="cell-input"
          type="time"
          value={value == null ? '' : toHHmm(value)}
          onChange={(e) => onCommit(parseTimeToMinutes(e.target.value))}
        />
      );
    case 'SINGLE_SELECT': {
      const opts = field.options ?? [];
      return (
        <select
          className="cell-input"
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
      return <span className="muted">—</span>;
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
    className: 'cell-input',
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
      className="cell-input"
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
    <div className="ms-wrap">
      <button
        ref={btnRef}
        className="ms-input"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {label}
      </button>

      {open &&
        createPortal(
          <div
            id="ms-portal"
            className="ms-portal-panel"
            style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
          >
            {options.map((o) => (
              <label key={o.value} className="ms-row">
                <input
                  type="checkbox"
                  checked={value.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
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