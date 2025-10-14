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
  const [rememberMe, setRememberMe] = useState(false); // UI opcional, no se envía
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Tu modal “Olvidé mi contraseña”
  const [showForgot, setShowForgot] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      // ⚠️ Usamos TU payload original (sin rememberMe)
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
    <div className="min-h-screen flex items-center justify-center bg-fondo px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex overflow-hidden hover:shadow-xl transition-shadow duration-300">

        {/* Izquierda: logo con degradado */}
<div className="hidden md:flex w-1/2 bg-azulOscuro items-center justify-center">
  <img src={logo} alt="MBQ" className="max-w-xs animate-logoSpin" />
</div>

        {/* Derecha: formulario (estructura de tu compañera) */}
        <div className="w-full md:w-1/2 p-10 flex flex-col justify-center">
          <h2 className="text-3xl font-bold text-azulOscuro mb-2">Bienvenido a MBQ</h2>
          <p className="text-gray-600 mb-8 text-sm">Ingresa tus credenciales.</p>

          {err && (
            <div className="text-red-600 bg-red-100 border border-red-300 rounded-lg p-2 text-sm mb-4" role="alert">
              {err}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Correo corporativo</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tucorreo@mbqinc.com"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-azulMedio focus:border-azulMedio"
                autoComplete="username"
                spellCheck={false}
                required
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Contraseña</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-azulMedio focus:border-azulMedio"
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            {/* Recuérdame + Olvidé mi contraseña (tu modal) */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 accent-azulMedio rounded"
                />
                Recuérdame
              </label>
              <button
                type="button"
                className="text-azulMedio hover:underline text-sm font-medium"
                onClick={() => setShowForgot(true)}
                disabled={loading}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {/* Botón de login (tu comportamiento) */}
            <button
              type="submit"
              className="w-full bg-verde hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          {/* Link a Solicitud (ajustado a tu ruta) */}
          <div className="mt-4 text-center text-sm">
            ¿No tienes cuenta?{' '}
            <button
              type="button"
              className="text-azulMedio font-medium hover:underline"
              onClick={() => nav('/solicitud')}
            >
              Solicita tu acceso
            </button>
          </div>
        </div>
      </div>

      {/* Tu modal reutilizable */}
      <ForgotPasswordModal
        open={showForgot}
        onClose={() => setShowForgot(false)}
      />
    </div>
  );
}