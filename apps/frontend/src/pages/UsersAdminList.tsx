import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';
import { listUsersAdmin, updateUserAdmin, resetUserPasswordAdmin } from '../api/users';
import type { AdminUser } from '../api/users';
import { confirmToast } from '../ui/confirmToast';

// Debounce simple
function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function UsersAdminList() {
  const { user: me, logout } = useAuth();
  const isAdmin = me?.platformRole === 'SYSADMIN';

  // Filtros
  const [qInput, setQInput] = useState('');
  const q = useDebounced(qInput, 300);

  // Paginación
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);

  // Datos
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);

  // UI states
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Modal edición
  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [initial, setInitial] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);

  // Recalcular páginas
  const pages = Math.max(1, Math.ceil(total / limit));
  const fromIdx = (page - 1) * limit + 1;
  const toIdx = Math.min(page * limit, total);

  // Cargar lista
  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const r = await listUsersAdmin({ page, limit, q });
      setRows(r.users || []);
      setTotal(r.total || 0);
    } catch (e: any) {
      setLoadErr(e?.message ?? 'No se pudo cargar la lista de usuarios.');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, limit, q]);

  useEffect(() => { load(); }, [load]);

  // Resetear a página 1 si cambia el término de búsqueda (cuando pasa el debounce)
  useEffect(() => { setPage(1); }, [q]);

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

  function openEditFor(u: AdminUser) {
    const copy = { ...u };
    setEditing(copy);
    setInitial(copy);
    setOpenEdit(true);
  }

  const isDirty = useMemo(() => {
    if (!editing || !initial) return false;
    return (
      (editing.fullName || '') !== (initial.fullName || '') ||
      editing.platformRole !== initial.platformRole ||
      !!editing.isActive !== !!initial.isActive ||
      !!editing.canCreateBases !== !!initial.canCreateBases
    );
  }, [editing, initial]);

  async function saveEdit() {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await updateUserAdmin(editing.id, {
        fullName: editing.fullName,
        platformRole: editing.platformRole,
        isActive: editing.isActive,
        canCreateBases: editing.canCreateBases,
      });
      setOpenEdit(false);
      await load();
      await confirmToast({
        title: 'Usuario actualizado',
        body: <>Los cambios se guardaron correctamente.</>,
        confirmOnly: true,
        variant: 'success',
        confirmText: 'Entendido',
      });
    } catch (e: any) {
      await confirmToast({
        title: 'No se pudo guardar',
        body: e?.message ?? 'Intenta nuevamente en unos segundos.',
        confirmOnly: true,
        variant: 'danger', // <- corregido
        confirmText: 'Entendido',
      });
    } finally {
      setSaving(false);
    }
  }

  async function doResetPassword() {
    if (!editing || saving) return;
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
      await resetUserPasswordAdmin(editing.id);
      await confirmToast({
        title: 'Contraseña restablecida',
        body: <>Se generó la contraseña temporal <b>Aa12345!</b>. Se pedirá cambiarla al iniciar sesión.</>,
        confirmOnly: true,
        variant: 'success',
        confirmText: 'Entendido',
      });
    } catch (e: any) {
      await confirmToast({
        title: 'No se pudo resetear',
        body: e?.message ?? 'Intenta nuevamente.',
        confirmOnly: true,
        variant: 'danger', // <- corregido
        confirmText: 'Entendido',
      });
    } finally {
      setSaving(false);
    }
  }

  // Atajos en el modal: Esc cierra, Ctrl/Cmd+S guarda
  const modalRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!openEdit) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpenEdit(false); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (isDirty && !saving) void saveEdit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openEdit, isDirty, saving]);

  return (
    <>
      <Header
        user={me ?? undefined}
        onLogout={logout}
        searchBox={{
          value: qInput,
          onChange: (value: string) => setQInput(value),
          placeholder: 'Buscar usuarios…',
        }}
      />

      <main className="content">
        <div className="list-toolbar mt-5 gap-2">
          <h2 className="section-title m-0 flex-1">Gestionar usuarios</h2>

          <div className="muted mr-2 text-sm hidden md:block">
            {total > 0 ? <>Mostrando <b>{fromIdx}-{toIdx}</b> de <b>{total}</b></> : '—'}
          </div>

          <select
            className="select"
            value={limit}
            onChange={e => { setPage(1); setLimit(Number(e.target.value)); }}
          >
            <option value={8}>8</option>
            <option value={12}>12</option>
            <option value={24}>24</option>
          </select>
        </div>

        {loadErr && <div className="card alert-error mb-3">{loadErr}</div>}

        {loading ? (
          <div className="card">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="card">No hay usuarios para mostrar.</div>
        ) : (
          <div className="bases-grid">
            {rows.map(u => (
              <div key={u.id} className="base-card">
                <div className="base-card-head">
                  <div className="base-card-title flex items-center gap-2">
                    {u.fullName || 'Usuario'}
                    <span className={`chip ${u.isActive ? '' : 'danger'}`}>
                      {u.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                    <span className="chip">{u.platformRole}</span>
                    {u.canCreateBases && <span className="chip">Creador</span>}
                  </div>
                </div>
                <div className="base-card-meta">
                  {u.email}
                </div>
                <div className="flex gap-2 mt-2">
                  <button className="btn" onClick={() => openEditFor(u)}>Editar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pagination mt-3">
          <button
            className="btn"
            disabled={page<=1}
            onClick={() => setPage(p => Math.max(1, p-1))}
          >
            Anterior
          </button>
          <span className="px-2">Página {page} de {pages}</span>
          <button
            className="btn"
            disabled={page>=pages}
            onClick={() => setPage(p => Math.min(pages, p+1))}
          >
            Siguiente
          </button>
        </div>
      </main>

      <Modal open={openEdit} onClose={() => setOpenEdit(false)} title="Editar usuario">
        {!editing ? null : (
          <div ref={modalRef}>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="label">Nombre completo</span>
                <input
                  className="input"
                  value={editing.fullName || ''}
                  onChange={e => setEditing({ ...editing, fullName: e.target.value })}
                  disabled={saving}
                />
              </label>

              <label className="grid gap-1.5">
                <span className="label">Email (no editable)</span>
                <input className="input" value={editing.email} disabled />
              </label>

              <label className="grid gap-1.5">
                <span className="label">Rol de plataforma</span>
                <select
                  className="select"
                  value={editing.platformRole}
                  onChange={e => setEditing({ ...editing, platformRole: e.target.value as any })}
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
                    checked={!!editing.isActive}
                    onChange={e => setEditing({ ...editing, isActive: e.target.checked })}
                    disabled={saving}
                  /> Activo
                </label>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!editing.canCreateBases}
                    onChange={e => setEditing({ ...editing, canCreateBases: e.target.checked })}
                    disabled={saving}
                  /> Puede crear bases
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <button className="btn" onClick={() => setOpenEdit(false)} disabled={saving}>Cancelar</button>
              <button className="btn-danger" onClick={doResetPassword} disabled={saving}>Resetear contraseña…</button>
              <button className="btn-primary" onClick={saveEdit} disabled={saving || !isDirty}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}