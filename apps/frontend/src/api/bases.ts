import { getJSON, API_URL } from './http';

export type BaseVisibility = 'PUBLIC' | 'PRIVATE' | 'SHARED';

export type BaseOwner = { id: number; fullName?: string; email?: string };

export type BaseDetail = {
  id: number;
  name: string;
  visibility: BaseVisibility;
  ownerId?: number;
  owner?: BaseOwner;
  workspaceId?: number;
  createdAt?: string;
  updatedAt?: string;
};

/** Permisos: admitimos claves camelCase, namespaced y/o anidadas */
export type BasePermissions = {
  schemaManage?: boolean;          // camel
  recordsRead?: boolean;
  recordsCreate?: boolean;
  recordsUpdate?: boolean;
  recordsDelete?: boolean;
  commentsCreate?: boolean;

  // namespaced planos: 'schema:manage', 'records:update', etc.
  [k: string]: any;
};

export type GetBaseDetailResp = {
  ok: boolean;
  base: BaseDetail;
  membershipRole?: 'VIEWER' | 'COMMENTER' | 'EDITOR' | null;
  // algunos backends pueden usar { memberRole } o { role }; lo tratamos en el FE.
  permissions?: BasePermissions;
};

export type BaseListItem = {
  id: number;
  name: string;
  visibility: BaseVisibility;
  workspaceId?: number;
  workspaceName?: string;
  createdAt?: string;
  updatedAt?: string;
  ownerId?: number;
  owner?: BaseOwner;
  ownerName?: string; // comodidad para el grid
};

/* ========= DETAIL ========= */
export function getBaseDetail(baseId: number) {
  return getJSON<GetBaseDetailResp>(`/bases/${baseId}`);
}

/* ========= RESOLVE ========= */
export type ResolveBaseResp = {
  ok: true;
  base: BaseDetail;
  defaultTableId: number | null;
  gridMeta?: { totalTables?: number; columns?: any[] };
  membershipRole?: 'VIEWER' | 'COMMENTER' | 'EDITOR' | null;
  permissions?: BasePermissions;
};

export function resolveBase(baseId: number) {
  return getJSON<ResolveBaseResp>(`/bases/${baseId}/resolve`);
}

/* ========= LIST ========= */
export async function listBases(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
}) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 12;
  const q = params?.q ?? '';

  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('pageSize', String(pageSize));
  if (q) qs.set('q', q);

  const res = await fetch(`${API_URL}/bases?${qs.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = b.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<{
    ok: boolean;
    bases: BaseListItem[];
    total?: number;
    page?: number;
    pageSize?: number;
  }>;
}

/* ========= UPDATE / DELETE ========= */
export async function renameBase(baseId: number, name: string) {
  const res = await fetch(`${API_URL}/bases/${baseId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = b.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<{ ok: boolean; base: BaseDetail }>;
}

export async function updateBaseVisibility(baseId: number, visibility: BaseVisibility) {
  const res = await fetch(`${API_URL}/bases/${baseId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility }),
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = b.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<{ ok: boolean; base: BaseDetail }>;
}

export async function deleteBase(baseId: number) {
  const res = await fetch(`${API_URL}/bases/${baseId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = b.error;
    } catch {}
    throw new Error(msg);
  }
  return { ok: true } as const;
}