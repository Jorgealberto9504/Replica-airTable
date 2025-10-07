// apps/frontend/src/components/ForgotPasswordModal.tsx
import { useEffect, useRef, useState } from 'react';
import { forgotPassword } from '../../api/auth';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ForgotPasswordModal({ open, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setEmail('');
      setErr(null);
      setOk(false);
      setLoading(false);
      // foco al abrir
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const basicEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!basicEmail(email.trim())) {
      setErr('Ingresa un email válido');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setOk(true);
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo enviar el correo');
    } finally {
      setLoading(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div className="modal-content card w-[380px]">
        <h2 className="section-title m-0 mb-2">¿Olvidaste tu contraseña?</h2>
        <p className="muted mb-4">
          Escribe tu email y te enviaremos un enlace para restablecerla.
        </p>

        {err && <div className="alert-error" role="alert">{err}</div>}
        {ok && (
          <div className="alert-success" role="alert">
            Te enviamos un enlace. Revisa también tu carpeta de spam.
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-3">
          <label className="label" htmlFor="fp-email">Email</label>
          <input
            id="fp-email"
            ref={inputRef}
            className="input"
            type="email"
            placeholder="tucorreo@mbqinc.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading || ok}
            required
          />

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cerrar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || ok}
            >
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}