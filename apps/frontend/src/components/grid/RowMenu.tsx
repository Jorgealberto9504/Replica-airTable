// apps/frontend/src/components/grid/RowMenu.tsx
import { forwardRef, useEffect, useMemo, useRef } from 'react';

type Props = {
  x: number;
  y: number;
  canDelete: boolean;
  onClose: () => void;
  onOpenComments: () => void;
  onDelete: () => void;
};

const MENU_W = 240;

const RowMenu = forwardRef<HTMLDivElement, Props>(function RowMenu(
  { x, y, canDelete, onClose, onOpenComments, onDelete },
  externalRef
) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    localRef.current = node;
    if (typeof externalRef === 'function') externalRef(node);
    else if (externalRef) (externalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  // Ajuste para no salir del viewport
  const style = useMemo<React.CSSProperties>(() => {
    const left = Math.min(Math.max(8, x), window.innerWidth - MENU_W - 8);
    const top = Math.min(Math.max(8, y), window.innerHeight - 12);
    return { position: 'fixed', left, top, zIndex: 1450, minWidth: MENU_W };
  }, [x, y]);

  // Navegación por teclado
  useEffect(() => {
    const root = localRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mi="1"]'));
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
      <div className="context-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1440 }} />
      <div
        ref={setRefs}
        className="context-panel rmenu"
        style={style}
        role="menu"
        aria-label="Acciones de fila"
      >
        <div className="rmenu-arrow" />

        <div className="rmenu-header">
          <div className="rmenu-title">Acciones de fila</div>
        </div>

        <div className="rmenu-divider" />

        <button
          data-mi="1"
          className="rmenu-item"
          onClick={() => { onOpenComments(); onClose(); }}
          role="menuitem"
        >
          <span className="mi-ic" aria-hidden>💬</span>
          <span>Comentarios</span>
        </button>

        {canDelete && (
          <>
            <div className="rmenu-divider" />
            <button
              data-mi="1"
              className="rmenu-item danger"
              onClick={() => { onDelete(); onClose(); }}
              role="menuitem"
            >
              <span className="mi-ic" aria-hidden>🗑️</span>
              <span>Eliminar fila</span>
            </button>
          </>
        )}
      </div>

      <style>{`
        .rmenu { border:1px solid #e5e7eb; border-radius:12px; background:#fff; box-shadow:0 12px 30px rgba(0,0,0,.10); }
        .rmenu-header { display:flex; align-items:center; justify-content:space-between; padding:.6rem .75rem; }
        .rmenu-title { font-weight:600; color:#111827; }
        .rmenu-divider { height:1px; background:#f1f5f9; }
        .rmenu-item { width:100%; display:flex; align-items:center; gap:.5rem; padding:.55rem .75rem; background:#fff; border:none; cursor:pointer; text-align:left; }
        .rmenu-item:hover { background:#f8fafc; }
        .rmenu-item:focus { outline:2px solid #93c5fd; outline-offset:-2px; }
        .rmenu-item.danger { color:#b91c1c; }
        .rmenu-item.danger:hover { background:#fef2f2; }
        .mi-ic { width:18px; display:inline-flex; align-items:center; justify-content:center; }

        .rmenu-arrow {
          position:absolute; top:-6px; left:16px; width:10px; height:10px;
          background:#fff; border-left:1px solid #e5e7eb; border-top:1px solid #e5e7eb;
          transform:rotate(45deg);
        }
      `}</style>
    </>
  );
});

export default RowMenu;