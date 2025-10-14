// apps/frontend/src/components/ForgotPasswordModal.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setErr(null);
    setOk(false);
    setLoading(false);
    timerRef.current = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  const basicEmail = useCallback((v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const v = email.trim();
    if (!basicEmail(v)) { setErr('Ingresa un email válido'); return; }
    setLoading(true);
    try {
      await forgotPassword(v);
      setOk(true);
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo enviar el correo');
    } finally {
      setLoading(false);
    }
  }, [email, basicEmail]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[380px] rounded-xl bg-white shadow-2xl p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="section-title m-0 mb-2">¿Olvidaste tu contraseña?</h2>
        <p className="muted mb-4">Escribe tu email y te enviaremos un enlace para restablecerla.</p>

        {err && <div className="alert-error mb-3" role="alert">{err}</div>}
        {ok && (
          <div className="alert-success mb-3" role="alert">
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
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cerrar
            </button>
            <button type="submit" className="btn-primary" disabled={loading || ok}>
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}