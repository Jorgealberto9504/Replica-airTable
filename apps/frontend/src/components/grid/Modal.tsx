// apps/frontend/src/components/grid/Modal.tsx
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({
  title,
  children,
  onClose,
  onConfirm,
  confirmText = 'Guardar',
}: {
  title: string;
  children: any;
  onClose: () => void;
  onConfirm: () => void;
  confirmText?: string;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useMemo(() => `mdl-title-${Math.random().toString(36).slice(2, 8)}`, []);

  // Bloquear scroll del documento mientras el modal esté abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Cerrar con Escape + trampa de foco (Tab/Shift+Tab)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const root = cardRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Foco inicial
  useEffect(() => {
    // Prioriza un control enfocable dentro del contenido; si no, botón cerrar
    const root = cardRef.current;
    const firstFocusable =
      root?.querySelector<HTMLElement>(
        'input, select, textarea, button:not([data-close]), [href], [tabindex]:not([tabindex="-1"])'
      ) || closeBtnRef.current;
    firstFocusable?.focus();
  }, []);

  const overlay = (
    <div
      className="mdl-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className="mdl-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mdl-header">
          <h2 id={titleId} className="mdl-title">{title}</h2>
          <button
            ref={closeBtnRef}
            data-close
            className="mdl-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mdl-body">
          {children}
        </div>

        <div className="mdl-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>

      {/* Estilos locales — alineados al look & feel que venimos usando */}
      <style>{`
        .mdl-overlay {
          position: fixed;
          inset: 0;
          background: rgba(17, 24, 39, 0.45); /* overlay oscuro con transparencia */
          backdrop-filter: saturate(120%) blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1500;
          padding: 24px;
          animation: mdl-fade-in .12s ease-out;
        }

        .mdl-card {
          width: 100%;
          max-width: 720px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          box-shadow:
            0 20px 25px -5px rgba(0,0,0,0.10),
            0 8px 10px -6px rgba(0,0,0,0.10);
          overflow: hidden;
          transform: scale(0.985);
          animation: mdl-pop-in .14s ease-out forwards;
        }

        .mdl-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          background: #fff;
        }

        .mdl-title {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }

        .mdl-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          font-size: 14px;
          color: #6b7280;
        }
        .mdl-close:hover { background: #f8fafc; color: #111827; }
        .mdl-close:focus { outline: 2px solid #93c5fd; outline-offset: 2px; }

        .mdl-body {
          padding: 16px;
          max-height: min(70vh, 680px);
          overflow-y: auto;
        }

        .mdl-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid #f1f5f9;
          background: #fafafa;
        }

        @keyframes mdl-pop-in {
          to { transform: scale(1); }
        }
        @keyframes mdl-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}