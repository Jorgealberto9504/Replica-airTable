// -----------------------------------------------------------------------------
// Cambiar contraseña (primer login) con validación fuerte y UX mejorada.
// -----------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePasswordFirstLogin } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

type Hints = {
  len: boolean;
  lower: boolean;
  upper: boolean;
  digit: boolean;
  special: boolean;
};

const initialHints: Hints = { len: false, lower: false, upper: false, digit: false, special: false };

function calcHints(v: string): Hints {
  return {
    len: v.length >= 8,
    lower: /[a-z]/.test(v),
    upper: /[A-Z]/.test(v),
    digit: /\d/.test(v),
    special: /[\W_]/.test(v),
  };
}

export default function ChangePassword() {
  const nav = useNavigate();
  const { refresh } = useAuth();

  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hints, setHints] = useState<Hints>(initialHints);
  const [caps, setCaps] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const pwdRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // foco inicial
    const t = setTimeout(() => pwdRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setHints(calcHints(pwd));
  }, [pwd]);

  const isStrong = hints.len && hints.lower && hints.upper && hints.digit && hints.special;
  const matches = confirm.length > 0 ? pwd === confirm : true;
  const canSubmit = !loading && isStrong && pwd.length > 0 && confirm.length > 0 && matches;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);

    if (!pwd || !confirm) { setErr('Completa ambos campos'); return; }
    if (pwd !== confirm) { setErr('Las contraseñas no coinciden'); return; }
    if (!isStrong) {
      setErr('La contraseña no cumple los requisitos mínimos.');
      return;
    }

    setLoading(true);
    try {
      const resp = await changePasswordFirstLogin({ newPassword: pwd, confirm });
      if (resp.ok) {
        setOk(true);
        await refresh();                // mustChangePassword -> false
        nav('/dashboard', { replace: true });
        setTimeout(() => {
          if (location.pathname !== '/dashboard') window.location.assign('/dashboard');
        }, 0);
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  function onKeyCheck(e: React.KeyboardEvent<HTMLInputElement>) {
    setCaps(e.getModifierState?.('CapsLock') ?? false);
  }

  const reqCls = (ok: boolean) =>
    `flex items-center gap-2 text-sm ${ok ? 'text-green-600' : 'text-gray-600'}`;

  return (
    <div className="page-center">
      <div className="card w-[420px]">
        <h2 className="section-title m-0 mb-2">Cambiar contraseña</h2>
        <p className="muted mb-4">Debes actualizar tu contraseña para continuar.</p>

        {/* Requisitos */}
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="text-sm font-medium mb-1">Requisitos de la contraseña</div>
          <ul className="space-y-1">
            <li className={reqCls(hints.len)}>• Al menos 8 caracteres</li>
            <li className={reqCls(hints.upper)}>• Una letra mayúscula</li>
            <li className={reqCls(hints.lower)}>• Una letra minúscula</li>
            <li className={reqCls(hints.digit)}>• Un número</li>
            <li className={reqCls(hints.special)}>• Un carácter especial (!@#$%…)</li>
          </ul>
        </div>

        {caps && <div className="alert-info mb-3">Bloq Mayús está activado.</div>}
        {err && <div className="alert-error mb-3" role="alert">{err}</div>}
        {ok && <div className="alert-success mb-3" role="alert">Contraseña actualizada.</div>}

        <form onSubmit={handleSubmit} className="grid gap-3" autoComplete="off">
          <label className="label" htmlFor="pwd">Nueva contraseña</label>
          <input
            id="pwd"
            ref={pwdRef}
            className="input"
            type="password"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            onKeyUp={onKeyCheck}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={loading}
            required
            aria-invalid={!isStrong && pwd.length > 0}
          />

          <label className="label" htmlFor="confirm">Confirmar contraseña</label>
          <input
            id="confirm"
            className="input"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyUp={onKeyCheck}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={loading}
            required
            aria-invalid={!matches}
          />

          {!matches && confirm.length > 0 && (
            <div className="text-sm text-red-600 -mt-2">Las contraseñas no coinciden.</div>
          )}

          <div className="muted text-sm">
            No puede ser igual a tu contraseña anterior (lo valida el servidor).
          </div>

          <button className="btn-primary" type="submit" disabled={!canSubmit}>
            {loading ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}