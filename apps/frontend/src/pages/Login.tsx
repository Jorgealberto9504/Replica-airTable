// apps/frontend/src/pages/Login.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postJSON } from '../api/http';
import logo from '../assets/mbq-logo.png';
import ForgotPasswordModal from '../pages/components/ForgotPasswordModal';

type LoginResp = {
  ok: boolean;
  user?: {
    id: number;
    email: string;
    fullName: string;
    platformRole: 'USER' | 'SYSADMIN';
    mustChangePassword: boolean;
    canCreateBases?: boolean;
  };
};

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Modal "Olvidé mi contraseña"
  const [showForgot, setShowForgot] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const resp = await postJSON<LoginResp>('/auth/login', {
        email: email.trim(),
        password: password.trim(),
      });

      if (resp.ok && resp.user) {
        try {
          await fetch(
            `${import.meta.env.VITE_API_URL ?? 'http://localhost:8080'}/auth/me`,
            { credentials: 'include' }
          );
        } catch {}
        if (resp.user.mustChangePassword) {
          nav('/change-password', { replace: true });
          return;
        }
        window.location.href = '/dashboard';
        return;
      }
      setErr('Credenciales inválidas');
    } catch (e: any) {
      setErr(e?.message ?? 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <aside className="auth-illustration">
          <img src={logo} alt="MBQ" className="auth-logo" />
          <div className="auth-illu-copy">
            <h2>Bienvenido a MBQ</h2>
            <p>Organiza, colabora y acelera tu trabajo.</p>
          </div>
        </aside>

        <section className="auth-form">
          <h1 className="auth-title">Iniciar sesión</h1>

          {err && (
            <div className="alert-error" role="alert">
              {err}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-3">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tucorreo@mbqinc.com"
              autoComplete="username"
              spellCheck={false}
              required
              disabled={loading}
            />

            <label className="label" htmlFor="password">Contraseña</label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={loading}
            />

            <div className="flex items-center justify-between text-sm">
              <span />
              <button
                type="button"
                className="link"
                onClick={() => setShowForgot(true)}
                disabled={loading}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button className="btn-primary pill" type="submit" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </section>
      </div>

      {/* Modal de "Olvidé mi contraseña" */}
      <ForgotPasswordModal
        open={showForgot}
        onClose={() => setShowForgot(false)}
      />
    </div>
  );
}