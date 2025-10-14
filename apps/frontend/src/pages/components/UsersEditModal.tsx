// apps/frontend/src/pages/components/UsersEditModal.tsx
// -----------------------------------------------------------------------------
// Modal de edición de usuario (UX mejorado, sin estilos inline personalizados)
// -----------------------------------------------------------------------------
import { useEffect, useState, useCallback } from 'react';
import {
  getUserAdmin,
  updateUserAdmin,
  resetUserPasswordAdmin,
  type AdminUser,
} from '../../api/users';

type Props = {
  open: boolean;
  userId: number;
  onClose: () => void;
  onSaved: () => void;
};

function looksStrong(pwd: string) {
  return (
    pwd.length >= 8 &&
    /[a-z]/.test(pwd) &&
    /[A-Z]/.test(pwd) &&
    /\d/.test(pwd) &&
    /[^A-Za-z0-9]/.test(pwd)
  );
}

export default function UsersEditModal({ open, userId, onClose, onSaved }: Props) {
  const [u, setU] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  // Submodal: reset password
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [pwdOk, setPwdOk] = useState<string | null>(null);

  // Cargar usuario al abrir
  useEffect(() => {
    if (!open || !userId) {
      setU(null);
      setSaveErr(null);
      setSaveOk(null);
      setPwdOpen(false);
      setPwd('');
      setPwdErr(null);
      setPwdOk(null);
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      setSaveErr(null);
      try {
        const r = await getUserAdmin(userId);
        if (!alive) return;
        setU(r.user);
      } catch (e: any) {
        setSaveErr(e?.message ?? 'No se pudo cargar el usuario');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, userId]);

  // Cerrar con Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pwdOpen) setPwdOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pwdOpen, onClose]);

  if (!open) return null;

  const save = useCallback(async () => {
    if (!u) return;
    setLoading(true);
    setSaveErr(null);
    setSaveOk(null);
    try {
      await updateUserAdmin(u.id, {
        fullName: u.fullName,
        platformRole: u.platformRole,
        isActive: u.isActive,
        canCreateBases: u.canCreateBases,
        mustChangePassword: u.mustChangePassword,
      });
      setSaveOk('Cambios guardados.');
      onSaved();
      onClose();
    } catch (e: any) {
      setSaveErr(e?.message ?? 'No se pudo guardar');
    } finally {
      setLoading(false);
    }
  }, [u, onSaved, onClose]);

  const openResetPwd = useCallback(() => {
    setPwd('');
    setPwdErr(null);
    setPwdOk(null);
    setPwdOpen(true);
  }, []);

  const doResetPwd = useCallback(async () => {
    if (!u) return;
    const value = pwd.trim();
    if (!value) {
      setPwdErr('Ingresa una contraseña.');
      return;
    }
    if (!looksStrong(value)) {
      setPwdErr('Debe tener 8+ caracteres, mayúscula, minúscula, número y símbolo.');
      return;
    }
    setPwdLoading(true);
    setPwdErr(null);
    setPwdOk(null);
    try {
      await resetUserPasswordAdmin(u.id, value);
      setPwdOk('Contraseña actualizada.');
      setPwdOpen(false);
    } catch (e: any) {
      setPwdErr(e?.message ?? 'No se pudo actualizar la contraseña');
    } finally {
      setPwdLoading(false);
    }
  }, [u, pwd]);

  return (
    <div
      className="modal-overlay"
      onClick={() => (loading ? null : onClose())}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-edit-title"
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="user-edit-title" className="m-0">Editar usuario</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Body */}
        {loading || !u ? (
          <div className="modal-body">Cargando…</div>
        ) : (
          <>
            <div className="modal-body grid gap-3 md:grid-cols-2">
              {saveErr && <div className="alert-error md:col-span-2">{saveErr}</div>}
              {saveOk && <div className="alert-info md:col-span-2">{saveOk}</div>}

              <fieldset className="contents" disabled={loading}>
                <label className="field">
                  <span className="muted">Nombre completo</span>
                  <input
                    className="input"
                    value={u.fullName || ''}
                    onChange={(e) => setU({ ...u, fullName: e.target.value })}
                    placeholder="Nombre Apellido"
                  />
                </label>

                <label className="field">
                  <span className="muted">Email (no editable)</span>
                  <input className="input" value={u.email} disabled />
                </label>

                <label className="field">
                  <span className="muted">Rol de plataforma</span>
                  <select
                    className="select"
                    value={u.platformRole}
                    onChange={(e) => setU({ ...u, platformRole: e.target.value as AdminUser['platformRole'] })}
                  >
                    <option value="USER">USER</option>
                    <option value="SYSADMIN">SYSADMIN</option>
                  </select>
                </label>

                <div className="flex items-center gap-4 md:col-span-2">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={!!u.isActive}
                      onChange={(e) => setU({ ...u, isActive: e.target.checked })}
                    /> Activo
                  </label>

                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={!!u.canCreateBases}
                      onChange={(e) => setU({ ...u, canCreateBases: e.target.checked })}
                    /> Puede crear bases
                  </label>

                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={!!u.mustChangePassword}
                      onChange={(e) => setU({ ...u, mustChangePassword: e.target.checked })}
                    /> Forzar cambio de contraseña
                  </label>
                </div>
              </fieldset>
            </div>

            <div className="modal-footer justify-end gap-2">
              <button className="btn" onClick={onClose} disabled={loading}>
                Cancelar
              </button>
              <button className="btn-danger" onClick={openResetPwd} disabled={loading}>
                Resetear contraseña…
              </button>
              <button className="btn-primary" onClick={save} disabled={loading}>
                {loading ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Submodal: Reset password */}
      {pwdOpen && (
        <div className="modal-backdrop" onClick={() => !pwdLoading && setPwdOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="m-0">Resetear contraseña</h3>
              <button className="modal-close" onClick={() => !pwdLoading && setPwdOpen(false)} aria-label="Cerrar">×</button>
            </div>
            <div className="modal-body grid gap-3">
              {pwdErr && <div className="alert-error">{pwdErr}</div>}
              {pwdOk && <div className="alert-info">{pwdOk}</div>}
              <label className="field">
                <span className="muted">Nueva contraseña</span>
                <input
                  className="input"
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="Aa12345!"
                  autoFocus
                />
              </label>
              <div className="muted text-sm">
                Debe tener 8+ caracteres, incluir mayúscula, minúscula, número y símbolo.
              </div>
            </div>
            <div className="modal-footer justify-end gap-2">
              <button className="btn" onClick={() => setPwdOpen(false)} disabled={pwdLoading}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={doResetPwd} disabled={pwdLoading || !pwd.trim()}>
                {pwdLoading ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}