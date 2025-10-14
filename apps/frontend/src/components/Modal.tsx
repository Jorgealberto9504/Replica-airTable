// apps/frontend/src/components/Modal.tsx
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  title?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';        // opcional
  closeOnBackdrop?: boolean;               // default: true
  closeOnEsc?: boolean;                    // default: true
};

const sizeToMaxW: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'lg',
  closeOnBackdrop = true,
  closeOnEsc = true,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Cerrar con ESC
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeOnEsc, onClose]);

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      aria-modal="true"
      role="dialog"
      aria-labelledby={title ? 'modal-title' : undefined}
      onMouseDown={closeOnBackdrop ? onClose : undefined}
    >
      {/* Backdrop con blur */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Card */}
      <div
        ref={cardRef}
        onMouseDown={(e) => e.stopPropagation()} // evita cerrar al click dentro
        className={`relative w-full ${sizeToMaxW[size]} bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden`}
      >
        {/* Header */}
        {(title || true) && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white/80">
            <h3 id="modal-title" className="text-lg font-semibold text-gray-900">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-5 py-3 border-t border-gray-200 bg-white">
            <div className="flex items-center justify-end gap-3">
              {footer}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Portal para evitar problemas de z-index
  const root = document.body;
  return createPortal(content, root);
}