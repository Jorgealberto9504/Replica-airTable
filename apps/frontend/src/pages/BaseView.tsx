import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Header from '../components/Header';
import MembersModal from './components/MembersModal';
import TabsBar from './components/TabsBar';

import { useAuth } from '../auth/AuthContext';
import {
  getBaseDetail,
  resolveBase,
  type BaseVisibility,
  type GetBaseDetailResp,
  type ResolveBaseResp,
} from '../api/bases';

import {
  listTabs,
  reorderTabs,
  createTable,
  renameTable,
  trashTable,
  type TabItem,
} from '../api/tables';

import { confirmToast } from '../ui/confirmToast';
import TableGrid from '../components/grid/TableGrid';

type RecordPerms = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canComment: boolean;
};

/* =========================
   Helpers para rol/permisos
   ========================= */
function pickRole(payload: any): 'VIEWER' | 'COMMENTER' | 'EDITOR' | null {
  const cand =
    payload?.membershipRole ??
    payload?.memberRole ??
    payload?.role ??
    null;
  if (cand === 'VIEWER' || cand === 'COMMENTER' || cand === 'EDITOR') return cand;
  return null;
}

function pickBoolPerm(obj: any, camel: string, namespaced: string, nestedKey?: string): boolean {
  if (!obj) return false;
  if (obj[camel] === true) return true;                // e.g. recordsUpdate
  if (obj[namespaced] === true) return true;           // e.g. 'records:update'
  if (nestedKey && obj.records && obj.records[nestedKey] === true) return true; // e.g. { records:{ update:true } }
  return false;
}

function deriveAccess({
  meId,
  meIsAdmin,
  resolveResp,
  detailResp,
}: {
  meId?: number;
  meIsAdmin: boolean;
  resolveResp?: ResolveBaseResp;
  detailResp?: GetBaseDetailResp;
}) {
  const base = (resolveResp?.base ?? detailResp?.base)!;
  const ownerId = base.ownerId;
  const ownerName = base.owner?.fullName;

  // rol
  const role =
    pickRole(resolveResp) ??
    pickRole(detailResp) ??
    null;

  // permisos (pueden venir en cualquiera de las dos respuestas)
  const P = (resolveResp as any)?.permissions ?? (detailResp as any)?.permissions ?? {};

  const schemaManage =
    meIsAdmin ||
    (ownerId && meId === ownerId) ||
    pickBoolPerm(P, 'schemaManage', 'schema:manage');

  const canCreate =
    meIsAdmin ||
    (ownerId && meId === ownerId) ||
    role === 'EDITOR' ||
    pickBoolPerm(P, 'recordsCreate', 'records:create', 'create');

  const canUpdate =
    meIsAdmin ||
    (ownerId && meId === ownerId) ||
    role === 'EDITOR' ||
    pickBoolPerm(P, 'recordsUpdate', 'records:update', 'update');

  const canDelete =
    meIsAdmin ||
    (ownerId && meId === ownerId) ||
    role === 'EDITOR' ||
    pickBoolPerm(P, 'recordsDelete', 'records:delete', 'delete');

  const canComment =
    meIsAdmin ||
    (ownerId && meId === ownerId) ||
    role === 'EDITOR' ||
    role === 'COMMENTER' ||
    pickBoolPerm(P, 'commentsCreate', 'comments:create', 'comment');

  // eslint-disable-next-line no-console
  console.debug('[BaseView] raw role/perms:', { role, P });
  // eslint-disable-next-line no-console
  console.debug('[BaseView] derived perms:', { schemaManage, canCreate, canUpdate, canDelete, canComment });

  return {
    baseName: base.name,
    visibility: base.visibility,
    ownerName,
    canManage: schemaManage,
    recordPerms: { canCreate, canUpdate, canDelete, canComment } as RecordPerms,
  };
}

export default function BaseView() {
  const nav = useNavigate();
  const { baseId: baseIdStr, tableId: tableIdStr } = useParams();
  const baseId = Number(baseIdStr);
  const urlTableId = tableIdStr ? Number(tableIdStr) : null;

  const { user: me, logout } = useAuth();
  const meIsAdmin = me?.platformRole === 'SYSADMIN';

  const [baseName, setBaseName] = useState('');
  const [visibility, setVisibility] = useState<BaseVisibility>('PRIVATE');
  const [ownerName, setOwnerName] = useState<string | undefined>(undefined);

  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);

  const [canManage, setCanManage] = useState(false);
  const [recordPerms, setRecordPerms] = useState<RecordPerms>({
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canComment: false,
  });

  const [openMembers, setOpenMembers] = useState(false);

  const [openCreate, setOpenCreate] = useState(false);
  const [openRename, setOpenRename] = useState<{ open: boolean; id?: number }>({ open: false });
  const [formName, setFormName] = useState('');
  const [formErr, setFormErr] = useState<string>('');

  // === Carga de base + permisos ===
  useEffect(() => {
    if (!Number.isFinite(baseId)) return;

    (async () => {
      try {
        let resolveResp: ResolveBaseResp | undefined;
        let detailResp: GetBaseDetailResp | undefined;

        try { resolveResp = await resolveBase(baseId); } catch { /* ignore */ }
        try { detailResp  = await getBaseDetail(baseId); } catch { /* ignore */ }

        if (!resolveResp && !detailResp) throw new Error('No se pudo cargar la base');

        const a = deriveAccess({
          meId: me?.id,
          meIsAdmin: !!meIsAdmin,
          resolveResp,
          detailResp,
        });

        setBaseName(a.baseName);
        setVisibility(a.visibility);
        setOwnerName(a.ownerName);
        setCanManage(a.canManage);
        setRecordPerms(a.recordPerms);
      } catch {
        setCanManage(false);
        setRecordPerms({ canCreate: false, canUpdate: false, canDelete: false, canComment: false });
      }
    })();
  }, [baseId, me?.id, meIsAdmin]);

  async function refreshTabs() {
    setLoadingTabs(true);
    try {
      const r = await listTabs(baseId);
      setTabs(r.tabs);
    } finally {
      setLoadingTabs(false);
    }
  }
  useEffect(() => {
    if (!Number.isFinite(baseId)) return;
    refreshTabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId]);

  const sortedTabs = useMemo(
    () => [...tabs].sort((a, b) => a.position - b.position),
    [tabs]
  );

  useEffect(() => {
    if (!loadingTabs && !urlTableId && sortedTabs.length > 0) {
      nav(`/bases/${baseId}/t/${sortedTabs[0].id}`, { replace: true });
    }
  }, [loadingTabs, urlTableId, sortedTabs, baseId, nav]);

  useEffect(() => {
    if (!loadingTabs && urlTableId && sortedTabs.length) {
      const exists = sortedTabs.some(t => t.id === urlTableId);
      if (!exists) {
        nav(`/bases/${baseId}/t/${sortedTabs[0].id}`, { replace: true });
      }
    }
  }, [loadingTabs, urlTableId, sortedTabs, baseId, nav]);

  function handleSelect(tableId: number) {
    if (tableId !== urlTableId) nav(`/bases/${baseId}/t/${tableId}`);
  }

  function handleOpenCreate() {
    setFormName('');
    setFormErr('');
    setOpenCreate(true);
  }

  function handleOpenRename(tableId: number) {
    const t = tabs.find(x => x.id === tableId);
    setFormName(t?.name ?? '');
    setFormErr('');
    setOpenRename({ open: true, id: tableId });
  }

  async function handleTrash(tableId: number) {
    const t = tabs.find(x => x.id === tableId);
    const ok = await confirmToast({
      title: 'Enviar a papelera',
      body: <>¿Quieres enviar la tabla <b>{t?.name ?? 'sin nombre'}</b> a la papelera?</>,
      confirmText: 'Enviar',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!ok) return;

    try {
      await trashTable(baseId, tableId);
      const r = await listTabs(baseId);
      setTabs(r.tabs);
      const next = r.tabs.slice().sort((a, b) => a.position - b.position);
      if (urlTableId === tableId) {
        if (next.length) nav(`/bases/${baseId}/t/${next[0].id}`, { replace: true });
        else nav(`/bases/${baseId}`, { replace: true });
      }
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo enviar la tabla a la papelera');
    }
  }

  async function handleReorder(orderedIds: number[]) {
    const map = new Map(tabs.map((t) => [t.id, t]));
    const next = orderedIds.map((id, i) => ({ ...(map.get(id)!) , position: i + 1 }));
    setTabs(next);
    try {
      await reorderTabs(baseId, orderedIds);
    } catch {
      await refreshTabs();
    }
  }

  async function submitCreate() {
    if (!formName.trim()) return;
    try {
      setFormErr('');
      const r = await createTable(baseId, formName.trim());
      setOpenCreate(false);
      setFormName('');
      await refreshTabs();
      nav(`/bases/${baseId}/t/${r.table.id}`);
    } catch (e: any) {
      setFormErr(e?.message || 'No se pudo crear la tabla');
    }
  }

  // Renombrar sin recargar lista completa
  async function submitRename() {
    if (!formName.trim() || !openRename.id) return;
    try {
      setFormErr('');
      await renameTable(baseId, openRename.id, formName.trim());
      // Actualización local sin pedir toda la lista:
      setTabs(prev => prev.map(t => t.id === openRename.id ? { ...t, name: formName.trim() } : t));
      setOpenRename({ open: false });
      setFormName('');
    } catch (e: any) {
      setFormErr(e?.message || 'No se pudo renombrar la tabla');
    }
  }

  const headerRight = (
    <div className="flex gap-2">
      {canManage && (
        <button
          className="btn-primary pill btn-sm"
          onClick={() => setOpenMembers(true)}
          title="Gestionar miembros"
        >
          Miembros
        </button>
      )}
    </div>
  );

  const currentTab = urlTableId ? sortedTabs.find(t => t.id === urlTableId) : null;

  return (
    <>
      <Header user={me ?? undefined} onLogout={logout} />
      <main className="content content--wide">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="m-0 text-2xl font-extrabold">{baseName}</h1>
          <span className="badge badge-green">
            {visibility === 'PUBLIC' ? 'Pública' : visibility === 'SHARED' ? 'Compartida' : 'Privada'}
          </span>
          {ownerName ? <span className="muted"> · {ownerName}</span> : null}
          <div className="ml-auto">{headerRight}</div>
        </div>

        <TabsBar
          baseId={baseId}
          tabs={sortedTabs}
          activeId={urlTableId}
          canManage={canManage}
          onSelect={handleSelect}
          onCreate={canManage ? handleOpenCreate : undefined}
          onRename={handleOpenRename}
          onTrash={handleTrash}
          onReorder={canManage ? handleReorder : undefined}
        />

        {loadingTabs ? (
          <div className="card mt-4 text-slate-500">Cargando…</div>
        ) : sortedTabs.length === 0 ? (
          <div className="card mt-4">
            <b>No hay tablas en esta base.</b>
            <div className="muted">El propietario aún no ha creado tablas.</div>
          </div>
        ) : currentTab ? (
          <div className="mt-4">
            <TableGrid
              baseId={baseId}
              tableId={currentTab.id}
              perms={recordPerms}
              canManageFields={canManage}
            />
          </div>
        ) : (
          <div className="card mt-4">Normalizando selección…</div>
        )}
      </main>

      <MembersModal baseId={baseId} open={openMembers} onClose={() => setOpenMembers(false)} />

      {(openCreate || openRename.open) && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="m-0 font-bold">
                {openCreate ? 'Nueva tabla' : 'Renombrar tabla'}
              </h3>
              <button
                className="modal-close"
                onClick={() => {
                  setOpenCreate(false);
                  setOpenRename({ open: false });
                  setFormErr('');
                }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <input
                className="input"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nombre de la tabla"
                autoFocus
              />
              {formErr && <div className="alert-error mt-2">{formErr}</div>}
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                onClick={() => {
                  setOpenCreate(false);
                  setOpenRename({ open: false });
                  setFormErr('');
                }}
              >
                Cancelar
              </button>
              <button className="btn-primary" onClick={openCreate ? submitCreate : submitRename}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}