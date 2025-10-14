// apps/frontend/src/components/grid/ColumnMenu.tsx
import { forwardRef, useEffect, useMemo, useRef } from 'react';
import type React from 'react';
import type { Field } from '../../api/fields';

type Props = {
  field: Field;
  x: number;
  y: number;
  onClose: () => void;
  onRename: () => void;
  onChangeType: () => void;
  onDelete: () => void;
};

const MENU_W = 260;

const ColumnMenu = forwardRef<HTMLDivElement, Props>(function ColumnMenu(
  { field, x, y, onClose, onRename, onChangeType, onDelete },
  externalRef
) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    localRef.current = node;
    if (typeof externalRef === 'function') externalRef(node);
    else if (externalRef) (externalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  // Ajuste básico para no salir del viewport
  const style = useMemo<React.CSSProperties>(() => {
    const left = Math.min(Math.max(8, x), window.innerWidth - MENU_W - 8);
    const maxTop = window.innerHeight - 12;
    const top = Math.min(Math.max(8, y), maxTop);
    return { position: 'fixed', left, top, zIndex: 1450, minWidth: MENU_W };
  }, [x, y]);

  // Accesibilidad por teclado: ↑/↓ para navegar, Enter para activar, Esc para cerrar
  useEffect(() => {
    const root = localRef.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mi="1"]'));
    // foco inicial
    (items[0] ?? root).focus();

    function onKey(e: KeyboardEvent) {
      if (!root.contains(document.activeElement)) return;

      const idx = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[(idx + 1 + items.length) % items.length];
        next?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[(idx - 1 + items.length) % items.length];
        prev?.focus();
      } else if (e.key === 'Enter' && idx >= 0) {
        e.preventDefault();
        items[idx].click();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* overlay para cerrar al click afuera */}
      <div className="context-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1440 }} />

      <div ref={setRefs} className="context-panel cmenu" style={style} role="menu" aria-label="Menú de columna">
        {/* Flechita */}
        <div className="cmenu-arrow" />

        {/* Header */}
        <div className="cmenu-header">
          <div className="cmenu-title" title={field.name}>{field.name}</div>
          <span className="cmenu-pill" title={`Tipo: ${field.type}`}>{field.type}</span>
        </div>

        <div className="cmenu-divider" />

        {/* Items */}
        <button
          data-mi="1"
          className="cmenu-item"
          onClick={() => { onRename(); onClose(); }}
          role="menuitem"
        >
          <span className="mi-ic" aria-hidden>✏️</span>
          <span>Renombrar…</span>
        </button>

        <button
          data-mi="1"
          className="cmenu-item"
          onClick={() => { onChangeType(); onClose(); }}
          role="menuitem"
        >
          <span className="mi-ic" aria-hidden>🧩</span>
          <span>Cambiar tipo…</span>
        </button>

        <div className="cmenu-divider" />

        <button
          data-mi="1"
          className="cmenu-item danger"
          onClick={() => { onDelete(); onClose(); }}
          role="menuitem"
        >
          <span className="mi-ic" aria-hidden>🗑️</span>
          <span>Enviar a papelera</span>
        </button>
      </div>

      {/* Estilos locales (alineados al estilo de Luisa) */}
      <style>{`
        .cmenu { border:1px solid #e5e7eb; border-radius:12px; background:#fff; box-shadow:0 12px 30px rgba(0,0,0,.10); }
        .cmenu-header { display:flex; align-items:center; justify-content:space-between; padding:.6rem .75rem; }
        .cmenu-title { font-weight:600; color:#111827; max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cmenu-pill { font-size:.7rem; line-height:1; padding:.25rem .5rem; border-radius:999px; background:#eef2ff; color:#3730a3; border:1px solid #e0e7ff; }
        .cmenu-divider { height:1px; background:#f1f5f9; }

        .cmenu-item { width:100%; display:flex; align-items:center; gap:.5rem; padding:.55rem .75rem; background:#fff; border:none; cursor:pointer; text-align:left; }
        .cmenu-item:hover { background:#f8fafc; }
        .cmenu-item:focus { outline:2px solid #93c5fd; outline-offset:-2px; }
        .cmenu-item.danger { color:#b91c1c; }
        .cmenu-item.danger:hover { background:#fef2f2; }
        .mi-ic { width:18px; display:inline-flex; align-items:center; justify-content:center; }

        .cmenu-arrow {
          position:absolute; top:-6px; left:16px; width:10px; height:10px;
          background:#fff; border-left:1px solid #e5e7eb; border-top:1px solid #e5e7eb;
          transform:rotate(45deg);
        }
      `}</style>
    </>
  );
});

export default ColumnMenu;