// apps/frontend/src/pages/components/BaseGrid.tsx
// Grid de Bases con búsqueda/paginación y menú contextual (sin estilos inline fijos)
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { BaseItem } from '../../api/workspaces';
import { listBasesForWorkspace } from '../../api/workspaces';
import {
  listBases,
  renameBase,
  deleteBase,
  updateBaseVisibility,
  type BaseVisibility,
} from '../../api/bases';

import { useAuth } from '../../auth/AuthContext';
import { confirmToast } from '../../ui/confirmToast';

type GridItem = BaseItem & { ownerName?: string };

type Props = {
  workspaceId: number | null;
  onCreateBase?: () => void;
  canCreate?: boolean;
  query?: string;
  showInlineSearch?: boolean;
  reloadKey?: number;
};

export default function BaseGrid({
  workspaceId,
  onCreateBase,
  canCreate,
  query,
  showInlineSearch = true,
  reloadKey,
}: Props) {
  const nav = useNavigate();
  const { user: me } = useAuth();
  const isAdmin = me?.platformRole === 'SYSADMIN';

  const [items, setItems] = useState<GridItem[]>([]);
  const [loading, setLoading] = useState(false);

  // búsqueda local (si se muestra input interno)
  const [qLocal, setQLocal] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(qLocal.trim()), 300);
    return () => clearTimeout(t);
  }, [qLocal]);

  const searchQ = (showInlineSearch ? qDebounced : (query ?? '')).trim();

  // paginación
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [total, setTotal] = useState<number | null>(null);
  const totalPages = Math.max(1, Math.ceil(((total ?? items.length) || 1) / pageSize));

  useEffect(() => { setPage(1); }, [workspaceId, searchQ, pageSize]);

  function canManageBase(b: GridItem): boolean {
    return Boolean(isAdmin || (me?.id && b.ownerId && me.id === b.ownerId));
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        if (workspaceId === 0) {
          const r = await listBases({ page, pageSize, q: searchQ });
          if (!alive) return;
          const rows: GridItem[] = r.bases.map((b: any) => ({
            id: b.id,
            name: b.name,
            visibility: b.visibility,
            workspaceId: b.workspaceId ?? 0,
            ownerId: (b as any).ownerId ?? 0,
            createdAt: b.createdAt ?? '',
            ownerName: (b as any).owner?.fullName ?? undefined,
          }));
          setItems(rows);
          setTotal(r.total ?? null);
        } else if (workspaceId) {
          const r = await listBasesForWorkspace(workspaceId);
          if (!alive) return;
          let rows: GridItem[] = (r.bases as any[]).map((b: any) => ({
            ...b,
            ownerId: b.ownerId ?? 0,
            ownerName: b.owner?.fullName,
          }));
          if (searchQ) {
            const ql = searchQ.toLowerCase();
            rows = rows.filter(b => (b.name ?? '').toLowerCase().includes(ql));
          }
          setTotal(rows.length);
          const start = (page - 1) * pageSize;
          setItems(rows.slice(start, start + pageSize));
        } else {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [workspaceId, page, pageSize, searchQ, reloadKey]);

  const canCreateHere = Boolean(canCreate && workspaceId && workspaceId !== 0);

  function openBase(id: number) {
    nav(`/bases/${id}`);
  }

  // menú contextual (posición dinámica)
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0, left: 0 });

  function openMenu(e: React.MouseEvent, baseId: number) {
    e.stopPropagation();
    const b = items.find(x => x.id === baseId);
    if (!b || !canManageBase(b)) return;
    setMenuFor(baseId);
    const btn = e.currentTarget as HTMLButtonElement;
    const r = btn.getBoundingClientRect();
    const gap = 6;
    const desiredLeft = r.left;
    const fitsRight = desiredLeft + 220 < window.innerWidth - 8;
    setMenuPos({ top: r.bottom + gap, ...(fitsRight ? { left: desiredLeft } : { right: window.innerWidth - r.right }) });
  }
  function closeMenu() { setMenuFor(null); }

  // modales simples
  const [renameOpen, setRenameOpen] = useState<{ open: boolean; id?: number; name: string }>({ open: false, name: '' });
  const [privacyOpen, setPrivacyOpen] = useState<{ open: boolean; id?: number; v: BaseVisibility }>({ open: false, v: 'PRIVATE' });

  async function submitRename() {
    if (!renameOpen.id) return;
    const b = items.find(x => x.id === renameOpen.id);
    if (!b || !canManageBase(b)) { setRenameOpen({ open: false, name: '' }); return; }

    const name = renameOpen.name.trim();
    if (!name) return;
    try {
      await renameBase(renameOpen.id, name);
    } catch (e: any) {
      if (String(e?.message || '').toUpperCase().includes('FORBIDDEN')) {
        alert('No tienes permisos para renombrar esta base.');
      } else {
        alert(e?.message || 'No se pudo renombrar la base');
      }
    }
    setRenameOpen({ open: false, name: '' });

    // refrescar manteniendo página
    if (workspaceId === 0) {
      const r = await listBases({ page, pageSize, q: searchQ });
      const rows: GridItem[] = r.bases.map((b: any) => ({
        id: b.id, name: b.name, visibility: b.visibility, workspaceId: b.workspaceId ?? 0,
        ownerId: (b as any).ownerId ?? 0, createdAt: b.createdAt ?? '', ownerName: (b as any).owner?.fullName ?? undefined,
      }));
      setItems(rows); setTotal(r.total ?? null);
    } else if (workspaceId) {
      const r = await listBasesForWorkspace(workspaceId);
      let rows: GridItem[] = (r.bases as any[]).map((b: any) => ({ ...b, ownerId: b.ownerId ?? 0, ownerName: b.owner?.fullName }));
      if (searchQ) rows = rows.filter(b => (b.name ?? '').toLowerCase().includes(searchQ.toLowerCase()));
      setTotal(rows.length); const start = (page - 1) * pageSize; setItems(rows.slice(start, start + pageSize));
    }
  }

  async function submitPrivacy() {
    if (!privacyOpen.id) return;
    const b = items.find(x => x.id === privacyOpen.id);
    if (!b || !canManageBase(b)) { setPrivacyOpen({ open: false, v: 'PRIVATE' }); return; }

    try {
      await updateBaseVisibility(privacyOpen.id, privacyOpen.v);
    } catch (e: any) {
      if (String(e?.message || '').toUpperCase().includes('FORBIDDEN')) {
        alert('No tienes permisos para cambiar la privacidad de esta base.');
      } else {
        alert(e?.message || 'No se pudo actualizar la privacidad');
      }
    }
    setPrivacyOpen({ open: false, v: 'PRIVATE' });

    // refrescar
    if (workspaceId === 0) {
      const r = await listBases({ page, pageSize, q: searchQ });
      const rows: GridItem[] = r.bases.map((b: any) => ({
        id: b.id, name: b.name, visibility: b.visibility, workspaceId: b.workspaceId ?? 0,
        ownerId: (b as any).ownerId ?? 0, createdAt: b.createdAt ?? '', ownerName: (b as any).owner?.fullName ?? undefined,
      }));
      setItems(rows); setTotal(r.total ?? null);
    } else if (workspaceId) {
      const r = await listBasesForWorkspace(workspaceId);
      let rows: GridItem[] = (r.bases as any[]).map((b: any) => ({ ...b, ownerId: b.ownerId ?? 0, ownerName: b.owner?.fullName }));
      if (searchQ) rows = rows.filter(b => (b.name ?? '').toLowerCase().includes(searchQ.toLowerCase()));
      setTotal(rows.length); const start = (page - 1) * pageSize; setItems(rows.slice(start, start + pageSize));
    }
  }

  async function sendToTrash(id: number) {
    closeMenu();
    const b = items.find(x => x.id === id);
    if (!b || !canManageBase(b)) return;

    const ok = await confirmToast({
      title: 'Enviar a papelera',
      body: <>¿Enviar la base <b>{b.name}</b> a la papelera?</>,
      confirmText: 'Enviar',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteBase(id);
    } catch (e: any) {
      if (String(e?.message || '').toUpperCase().includes('FORBIDDEN')) {
        alert('No tienes permisos para enviar esta base a la papelera.');
      } else {
        alert(e?.message || 'No se pudo enviar a la papelera');
      }
      return;
    }

    const nextCount = (total ?? items.length) - 1;
    const nextTotalPages = Math.max(1, Math.ceil(nextCount / pageSize));
    if (page > nextTotalPages) setPage(nextTotalPages);

    // refrescar
    if (workspaceId === 0) {
      const r = await listBases({ page, pageSize, q: searchQ });
      const rows: GridItem[] = r.bases.map((b: any) => ({
        id: b.id, name: b.name, visibility: b.visibility, workspaceId: b.workspaceId ?? 0,
        ownerId: (b as any).ownerId ?? 0, createdAt: b.createdAt ?? '', ownerName: (b as any).owner?.fullName ?? undefined,
      }));
      setItems(rows); setTotal(r.total ?? null);
    } else if (workspaceId) {
      const r = await listBasesForWorkspace(workspaceId);
      let rows: GridItem[] = (r.bases as any[]).map((b: any) => ({ ...b, ownerId: b.ownerId ?? 0, ownerName: b.owner?.fullName }));
      if (searchQ) rows = rows.filter(b => (b.name ?? '').toLowerCase().includes(searchQ.toLowerCase()));
      setTotal(rows.length); const start = (page - 1) * pageSize; setItems(rows.slice(start, start + pageSize));
    }
  }

  const toolbarRight = useMemo(() => {
    const totalKnown = total ?? items.length;
    return `${totalKnown} resultado${totalKnown === 1 ? '' : 's'}`;
  }, [total, items]);

  return (
    <section className="flex-1 p-4">
      <div className="list-toolbar">
  <h2 className="section-title m-0">
    {workspaceId === 0 ? 'Explorar bases' : 'Bases'}
  </h2>

        <div className="toolbar-right">
          {!showInlineSearch ? null : (
            <input
              className="input search"
              placeholder="Buscar bases…"
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
            />
          )}
          <span className="muted">{toolbarRight}</span>

          {canCreateHere && (
            <button onClick={onCreateBase} className="btn-primary">Nueva base</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-slate-400">No hay bases</div>
      ) : (
        <>
          <div className="bases-grid">
            {items.map((b) => {
              const showMenu = canManageBase(b);
              return (
                <div
                  key={b.id}
                  role="group"
                  tabIndex={0}
                  className="base-card cursor-pointer"
                  onClick={() => openBase(b.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openBase(b.id); }}
                  title={`Abrir ${b.name}`}
                >
                  <div className="base-card-head">
                    <button
                      className="base-card-title"
                      onClick={(e) => { e.stopPropagation(); openBase(b.id); }}
                    >
                      {b.name}
                    </button>

                    {showMenu && (
                      <div className="base-card-actions">
                        <button
                          className="icon-btn"
                          aria-label={`Acciones para ${b.name}`}
                          onClick={(e) => openMenu(e, b.id)}
                        >
                          ⋯
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="base-card-meta">
                    {b.visibility === 'PUBLIC' ? 'Pública' : 'Privada'}
                    {b.ownerName ? <> · {b.ownerName}</> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pagination">
            <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button className="btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente</button>

            <span className="ml-3">Ver</span>
            <select
              className="select"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={12}>12</option>
              <option value={24}>24</option>
              <option value={48}>48</option>
            </select>
            <span>por página</span>
          </div>
        </>
      )}

      {menuFor != null && (
        <>
          <div className="context-overlay" onClick={closeMenu} />
          <div
            role="menu"
            className="context-panel"
            style={{
              position: 'fixed',
              top: menuPos.top,
              ...(menuPos.left != null ? { left: menuPos.left } : { right: menuPos.right }),
            }}
          >
            {(() => {
              const b = items.find(x => x.id === menuFor);
              const currentName = b?.name ?? '';
              const currentVis = (b?.visibility ?? 'PRIVATE') as BaseVisibility;
              return (
                <>
                  <button
                    className="menu-item"
                    onClick={() => setRenameOpen({ open: true, id: menuFor!, name: currentName })}
                  >
                    Cambiar nombre
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => setPrivacyOpen({ open: true, id: menuFor!, v: currentVis })}
                  >
                    Cambiar privacidad
                  </button>
                  <button className="menu-item-danger" onClick={() => sendToTrash(menuFor!)}>
                    Eliminar
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}

      {renameOpen.open && (
        <div className="modal-overlay" onClick={() => setRenameOpen({ open: false, name: '' })}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="m-0 font-bold">Cambiar nombre</h3>
              <button className="modal-close" onClick={() => setRenameOpen({ open: false, name: '' })}>✕</button>
            </div>
            <div className="modal-body">
              <input
                className="input"
                value={renameOpen.name}
                onChange={(e) => setRenameOpen((s) => ({ ...s, name: e.target.value }))}
                placeholder="Nuevo nombre"
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRenameOpen({ open: false, name: '' })}>Cancelar</button>
              <button className="btn-primary" onClick={submitRename} disabled={!renameOpen.name.trim()}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {privacyOpen.open && (
        <div className="modal-overlay" onClick={() => setPrivacyOpen({ open: false, v: 'PRIVATE' })}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="m-0 font-bold">Cambiar privacidad</h3>
              <button className="modal-close" onClick={() => setPrivacyOpen({ open: false, v: 'PRIVATE' })}>✕</button>
            </div>
            <div className="modal-body">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="vis"
                  checked={privacyOpen.v === 'PRIVATE'}
                  onChange={() => setPrivacyOpen((s) => ({ ...s, v: 'PRIVATE' }))}
                />
                Privada123
              </label>
              <label className="inline-flex items-center gap-2 mt-2">
                <input
                  type="radio"
                  name="vis"
                  checked={privacyOpen.v === 'PUBLIC'}
                  onChange={() => setPrivacyOpen((s) => ({ ...s, v: 'PUBLIC' }))}
                />
                Pública
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPrivacyOpen({ open: false, v: 'PRIVATE' })}>Cancelar</button>
              <button className="btn-primary" onClick={submitPrivacy}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}