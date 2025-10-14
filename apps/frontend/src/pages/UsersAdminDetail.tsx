import { useEffect, useMemo, useState, useCallback } from 'react';
import Header from '../components/Header';
import { useAuth } from '../auth/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { getUserAdmin, updateUserAdmin, resetUserPasswordAdmin } from '../api/users';
import type { AdminUser } from '../api/users';
import { confirmToast } from '../ui/confirmToast';

export default function UsersAdminDetail() {
  const { id } = useParams();
  const userId = Number(id);
  const { user: me, logout } = useAuth();
  const nav = useNavigate();

  const isAdmin = me?.platformRole === 'SYSADMIN';

  const [u, setU] = useState<AdminUser | null>(null);
  const [initial, setInitial] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carga
  useEffect(() => {
    if (!isAdmin || !userId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await getUserAdmin(userId);
        setU(r.user);
        setInitial(r.user);
      } catch (e: any) {
        setError(e?.message ?? 'No se pudo cargar el usuario.');
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, userId]);

  // Dirty check (solo campos editables aquí)
  const isDirty = useMemo(() => {
    if (!u || !initial) return false;
    return (
      (u.fullName || '') !== (initial.fullName || '') ||
      u.platformRole !== initial.platformRole ||
      !!u.isActive !== !!initial.isActive ||
      !!u.canCreateBases !== !!initial.canCreateBases
    );
  }, [u, initial]);

  // Guardar
  const save = useCallback(async () => {
    if (!u || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await updateUserAdmin(u.id, {
        fullName: u.fullName,
        platformRole: u.platformRole,
        isActive: u.isActive,
        canCreateBases: u.canCreateBases,
      });
      setU(r.user);
      setInitial(r.user);
      await confirmToast({
        title: 'Usuario actualizado',
        body: <>Los cambios se guardaron correctamente.</>,
        confirmOnly: true,
        variant: 'success',
        confirmText: 'Entendido',
      });
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }, [u, saving]);

  // Resetear contraseña con confirmación
  const resetPwd = useCallback(async () => {
    if (!u || saving) return;
    const ok = await confirmToast({
      title: 'Resetear contraseña',
      body: <>Se generará una contraseña temporal <b>Aa12345!</b> y se pedirá cambiarla al iniciar sesión. ¿Continuar?</>,
      confirmText: 'Resetear',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!ok) return;

    setSaving(true);
    try {
      await resetUserPasswordAdmin(u.id);
      await confirmToast({
        title: 'Contraseña restablecida',
        body: <>Se generó la contraseña temporal <b>Aa12345!</b>. Se pedirá cambiarla al iniciar sesión.</>,
        confirmOnly: true,
        variant: 'success',
        confirmText: 'Entendido',
      });
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo resetear la contraseña.');
    } finally {
      setSaving(false);
    }
  }, [u, saving]);

  // Confirmar salir si hay cambios sin guardar (botón Volver)
  const goBack = useCallback(async () => {
    if (isDirty) {
      const discard = await confirmToast({
        title: 'Cambios sin guardar',
        body: 'Tienes cambios sin guardar. ¿Deseas descartarlos?',
        confirmText: 'Descartar',
        cancelText: 'Seguir editando',
        danger: true,
      });
      if (!discard) return;
    }
    nav('/admin/users');
  }, [isDirty, nav]);

  // Atajo Ctrl/Cmd+S para guardar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (cmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (isDirty && !saving) void save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDirty, saving, save]);

  // Warn al cerrar/recargar si hay cambios
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  if (!isAdmin) {
    return (
      <>
        <Header user={me ?? undefined} onLogout={logout} />
        <main className="content">
          <div className="card"><b>403:</b> Solo SYSADMIN puede gestionar usuarios.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header user={me ?? undefined} onLogout={logout} />
      <main className="content">
        <div className="list-toolbar mt-5">
          <h2 className="section-title m-0">Detalle de usuario</h2>
          {u && (
            <div className="flex items-center gap-2">
              <span className={`chip ${u.isActive ? '' : 'danger'}`}>{u?.isActive ? 'Activo' : 'Inactivo'}</span>
              <span className="chip">{u?.platformRole}</span>
              {u?.canCreateBases && <span className="chip">Creador</span>}
            </div>
          )}
        </div>

        {loading ? (
          <div className="card">Cargando…</div>
        ) : !u ? (
          <div className="card">Usuario no encontrado.</div>
        ) : (
          <div className="card max-w-3xl mx-auto">
            {error && (
              <div className="alert-error mb-3" role="alert">{error}</div>
            )}

            {!u.isActive && (
              <div className="alert-info mb-3">
                Este usuario está <b>inactivo</b>. No podrá iniciar sesión hasta que lo actives.
              </div>
            )}

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="label">Nombre completo</span>
                <input
                  className="input"
                  value={u.fullName || ''}
                  onChange={e => setU({ ...u, fullName: e.target.value })}
                  disabled={saving}
                />
              </label>

              <label className="grid gap-1.5">
                <span className="label">Email (no editable)</span>
                <input className="input" value={u.email} disabled />
              </label>

              <label className="grid gap-1.5">
                <span className="label">Rol de plataforma</span>
                <select
                  className="select"
                  value={u.platformRole}
                  onChange={e => setU({ ...u, platformRole: e.target.value as any })}
                  disabled={saving}
                >
                  <option value="USER">USER</option>
                  <option value="SYSADMIN">SYSADMIN</option>
                </select>
              </label>

              <div className="flex items-center gap-4 pt-6">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!u.isActive}
                    onChange={e => setU({ ...u, isActive: e.target.checked })}
                    disabled={saving}
                  /> Activo
                </label>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!u.canCreateBases}
                    onChange={e => setU({ ...u, canCreateBases: e.target.checked })}
                    disabled={saving}
                  /> Puede crear bases
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <button className="btn" onClick={goBack} disabled={saving}>Volver</button>
              <button className="btn-primary" onClick={save} disabled={saving || !isDirty}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button className="btn-danger" onClick={resetPwd} disabled={saving}>
                Resetear contraseña…
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}