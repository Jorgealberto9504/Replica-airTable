// apps/frontend/src/pages/components/CreateOrRenameTableModal.tsx
// -----------------------------------------------------------------------------
// Modal reutilizable para crear/renombrar tabla. Sin estilos inline.
// -----------------------------------------------------------------------------
import { useState, useEffect, useRef, useCallback } from 'react';

type Props = {
  open: boolean;
  title: string;
  placeholder: string;
  initialValue?: string;
  loading?: boolean; // controlado por el padre
  onClose: () => void;
  onSubmit: (name: string) => Promise<void> | void;
};

export default function CreateOrRenameTableModal({
  open,
  title,
  placeholder,
  initialValue,
  onClose,
  onSubmit,
  loading,
}: Props) {
  const [name, setName] = useState(initialValue ?? '');
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset estado y foco al abrir
  useEffect(() => {
    if (!open) return;
    setName(initialValue ?? '');
    setErr(null);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, initialValue]);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose, loading]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && !loading) onClose();
    },
    [onClose, loading]
  );

  if (!open) return null;

  const isBusy = !!loading;
  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !isBusy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!trimmed) {
      setErr('Ingresa un nombre válido.');
      return;
    }
    try {
      await onSubmit(trimmed);
      // El cierre lo decide el padre; aquí sólo limpiamos errores.
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo guardar');
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crt-title"
      onClick={handleBackdropClick}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="crt-title" className="m-0">{title}</h3>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={isBusy}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {err && <div className="alert-error mb-2" role="alert">{err}</div>}

            <label className="label" htmlFor="crt-name">Nombre</label>
            <input
              id="crt-name"
              ref={inputRef}
              className="input"
              placeholder={placeholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isBusy}
              aria-invalid={trimmed.length === 0 && name.length > 0}
            />
          </div>

          <div className="modal-footer justify-end">
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={isBusy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!canSubmit}
            >
              {isBusy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}