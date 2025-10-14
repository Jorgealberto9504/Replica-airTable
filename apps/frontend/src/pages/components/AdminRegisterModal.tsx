// apps/frontend/src/pages/components/AdminRegisterModal.tsx
import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { adminRegisterUser } from '../../api/auth';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

function isEmailBasic(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function looksStrong(pwd: string) {
  return (
    pwd.length >= 8 &&
    /[a-z]/.test(pwd) &&
    /[A-Z]/.test(pwd) &&
    /\d/.test(pwd) &&
    /[^A-Za-z0-9]/.test(pwd)
  );
}

// Hint visual (la validación real la hace el backend)
const ALLOWED_HINT = ['mbqinc.com', 'mbqgroup.solutions', 'mbqsolutions.com'];

export default function AdminRegisterModal({ open, onClose, onCreated }: Props) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [platformRole, setPlatformRole] = useState<'USER' | 'SYSADMIN'>('USER');
  const [canCreateBases, setCanCreateBases] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Limpiar estado al cerrar
  useEffect(() => {
    if (!open) {
      setEmail('');
      setFullName('');
      setTempPassword('');
      setPlatformRole('USER');
      setCanCreateBases(false);
      setErr(null);
      setOkMsg(null);
      setLoading(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);

    if (!fullName || !email || !tempPassword) {
      setErr('Todos los campos son obligatorios');
      return;
    }
    if (!isEmailBasic(email)) {
      setErr('Email inválido');
      return;
    }
    if (!looksStrong(tempPassword)) {
      setErr('La contraseña debe tener 8+ caracteres, mayúscula, minúscula, número y símbolo.');
      return;
    }

    setLoading(true);
    try {
      const resp = await adminRegisterUser({
        email,
        fullName,
        tempPassword,
        platformRole,
        canCreateBases,
      });

      if (resp.ok) {
        setOkMsg('✅ Usuario registrado correctamente');
        setEmail('');
        setFullName('');
        setTempPassword('');
        setPlatformRole('USER');
        setCanCreateBases(false);
        onCreated?.();
      } else {
        setErr('❌ No se pudo registrar el usuario');
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Error inesperado al registrar');
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azulMedio focus:border-azulMedio focus:outline-none transition-colors';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registro de usuario"
      // Footer fuera del <form>, lo disparamos con form="admin-register-form"
      footer={
        <>
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="admin-register-form"
            className="px-4 py-2 rounded-lg bg-azulMedio text-white font-medium hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? 'Guardando…' : 'Registrar'}
          </button>
        </>
      }
    >
      <form id="admin-register-form" onSubmit={handleSubmit} className="space-y-4">
        {err && (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 text-sm">
            {err}
          </div>
        )}
        {okMsg && (
          <div className="text-green-700 bg-green-50 border border-green-200 rounded-lg p-2 text-sm">
            {okMsg}
          </div>
        )}

        <div className="flex flex-col">
          <label htmlFor="fullName" className="text-sm font-medium text-gray-700 mb-1">
            Nombre completo
          </label>
          <input
            id="fullName"
            className={inputCls}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nombre Apellido"
            required
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="email" className="text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`nombre@${ALLOWED_HINT[0]}`}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Dominios permitidos: {ALLOWED_HINT.join(', ')}
          </p>
        </div>

        <div className="flex flex-col">
          <label htmlFor="password" className="text-sm font-medium text-gray-700 mb-1">
            Contraseña temporal
          </label>
          <input
            id="password"
            className={inputCls}
            type="password"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            placeholder="Aa12345!"
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            Debe tener al menos 8 caracteres, incluir mayúscula, minúscula, número y símbolo.
          </p>
        </div>

        <div className="flex flex-col">
          <label htmlFor="role" className="text-sm font-medium text-gray-700 mb-1">
            Rol global
          </label>
          <select
            id="role"
            className={inputCls}
            value={platformRole}
            onChange={(e) => setPlatformRole(e.target.value as 'USER' | 'SYSADMIN')}
          >
            <option value="USER">USER</option>
            <option value="SYSADMIN">SYSADMIN</option>
          </select>
        </div>

        <label htmlFor="canCreate" className="inline-flex items-center gap-2 text-sm">
          <input
            id="canCreate"
            type="checkbox"
            checked={canCreateBases}
            onChange={(e) => setCanCreateBases(e.target.checked)}
          />
          Puede crear bases (permiso global)
        </label>
      </form>
    </Modal>
  );
}