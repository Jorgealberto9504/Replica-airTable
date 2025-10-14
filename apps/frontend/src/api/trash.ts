// apps/frontend/src/api/trash.ts
import { getJSON, postJSON, delJSON, HTTPError } from './http';

/* ======= Tipos ======= */
export type BaseVisibility = 'PUBLIC' | 'PRIVATE';

export type TrashedBase = {
  id: number;
  name: string;
  visibility: BaseVisibility;
  ownerId: number;
  workspaceId: number;
  trashedAt?: string;
};

export type TrashedTableOwner = {
  id: number;
  name: string;
  trashedAt?: string;
};

export type TrashedTableAdmin = {
  id: number;
  name: string;
  trashedAt?: string;
  base: {
    id: number;
    name: string;
    owner?: { id: number; fullName?: string; email?: string } | null;
  };
};

export type TrashedWorkspace = {
  id: number;
  name: string;
  trashedAt?: string;
};

/* ======= Helpers de normalización ======= */
function pickOwnerName(x: any): string | undefined {
  // Soporta distintas variantes que a veces devuelve el backend
  return (
    x?.owner?.fullName ||
    x?.ownerFullName ||
    x?.ownerName ||
    x?.owner?.email ||
    undefined
  );
}

/* ======= BASES (owner) ======= */
// GET /bases/trash
export async function listMyTrashedBases() {
  // tolerante a {bases} o {items}
  const r = await getJSON<{ ok?: boolean; bases?: TrashedBase[]; items?: TrashedBase[] }>('/bases/trash');
  return { ok: r.ok ?? true, bases: r.bases ?? r.items ?? [] };
}

// POST /bases/trash/empty
export function emptyMyBaseTrash() {
  return postJSON<{ ok: boolean }>('/bases/trash/empty', {});
}

// POST /bases/:baseId/restore
export function restoreBase(baseId: number) {
  return postJSON<{ ok: boolean; base: any }>(`/bases/${baseId}/restore`, {});
}

// DELETE /bases/:baseId/permanent
export function deleteBasePermanent(baseId: number) {
  return delJSON<{ ok: boolean }>(`/bases/${baseId}/permanent`);
}

/* ======= TABLAS (owner) ======= */
// GET /bases/:baseId/tables/trash
export async function listTrashedTablesForBase(baseId: number) {
  const r = await getJSON<{ ok?: boolean; tables?: TrashedTableOwner[]; items?: TrashedTableOwner[] }>(
    `/bases/${baseId}/tables/trash`
  );
  return { ok: r.ok ?? true, tables: r.tables ?? r.items ?? [] };
}

// POST /bases/:baseId/tables/trash/empty
export function emptyTableTrash(baseId: number) {
  return postJSON<{ ok: boolean }>(`/bases/${baseId}/tables/trash/empty`, {});
}

// POST /bases/:baseId/tables/:tableId/restore
export function restoreTable(baseId: number, tableId: number) {
  return postJSON<{ ok: boolean; table: any }>(`/bases/${baseId}/tables/${tableId}/restore`, {});
}

// DELETE /bases/:baseId/tables/:tableId/permanent
export function deleteTablePermanent(baseId: number, tableId: number) {
  return delJSON<{ ok: boolean }>(`/bases/${baseId}/tables/${tableId}/permanent`);
}

/* ======= TABLAS (ADMIN – global) ======= */
// GET /bases/admin/tables/trash?ownerId=&baseId=
export async function listAllTrashedTablesAdmin(params?: { ownerId?: number; baseId?: number }) {
  const qs = new URLSearchParams();
  if (params?.ownerId) qs.set('ownerId', String(params.ownerId));
  if (params?.baseId) qs.set('baseId', String(params.baseId));
  const url = qs.toString()
    ? `/bases/admin/tables/trash?${qs.toString()}`
    : '/bases/admin/tables/trash';

  const r = await getJSON<{ ok?: boolean; tables?: TrashedTableAdmin[]; items?: TrashedTableAdmin[] }>(url);
  // Normalizamos ownerName si el backend te lo devuelve en otra forma
  const tables = (r.tables ?? r.items ?? []).map(t => ({
    ...t,
    base: {
      ...t.base,
      owner: t.base?.owner ?? null,
    },
    // dejamos que el consumidor elija cómo mostrar el dueño, pero ya soportamos varias llaves
    ownerName: pickOwnerName(t.base),
  }));
  return { ok: r.ok ?? true, tables };
}

// POST /bases/admin/:baseId/tables/:tableId/restore
export function restoreTableAdmin(baseId: number, tableId: number) {
  return postJSON<{ ok: boolean; table: any }>(
    `/bases/admin/${baseId}/tables/${tableId}/restore`,
    {}
  );
}

// DELETE /bases/admin/:baseId/tables/:tableId/permanent
export function deleteTablePermanentAdmin(baseId: number, tableId: number) {
  return delJSON<{ ok: boolean }>(`/bases/admin/${baseId}/tables/${tableId}/permanent`);
}

/* ======= WORKSPACES (owner) — opcional ======= */
export async function listMyTrashedWorkspacesSafe() {
  try {
    const r = await getJSON<{ ok?: boolean; workspaces?: TrashedWorkspace[]; items?: TrashedWorkspace[] }>(
      '/workspaces/trash'
    );
    return { ok: r.ok ?? true, workspaces: r.workspaces ?? r.items ?? [] };
  } catch (e: any) {
    if (e instanceof HTTPError && e.status === 404) {
      // backend sin feature de workspaces
      return { ok: false, workspaces: [] as TrashedWorkspace[] };
    }
    throw e;
  }
}
export function restoreWorkspace(workspaceId: number) {
  return postJSON<{ ok: boolean; workspace: any }>(`/workspaces/${workspaceId}/restore`, {});
}
export function deleteWorkspacePermanent(workspaceId: number) {
  return delJSON<{ ok: boolean }>(`/workspaces/${workspaceId}/permanent`);
}
export function emptyWorkspaceTrash() {
  return postJSON<{ ok: boolean }>('/workspaces/trash/empty', {});
}