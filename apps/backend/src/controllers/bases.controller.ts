import type { Request, Response } from 'express';
import { z } from 'zod';
import { getAuthUser } from '../middlewares/auth.middleware.js';
import { prisma } from '../services/db.js';
import {
  // === WORKSPACES → BASES ===
  createBaseInWorkspace,
  listBasesForWorkspace,
  moveBaseToWorkspace,

  // === BASES existentes ===
  listAccessibleBasesForUser,
  listAllBasesForSysadmin,   // (queda para compat / otros usos)
  getBaseById,
  updateBase,
  deleteBase,

  // ===== Papelera (owner) =====
  listTrashedBasesForOwner,
  restoreBase,
  deleteBasePermanently,
  emptyTrashForOwner,
  purgeTrashedBasesOlderThan,   // PURGE (admin)

  // ===== ADMIN GLOBAL =====
  listTrashedBasesForAdmin,

  // ===== NUEVO: búsqueda paginada en DB =====
  searchBasesPaged,
} from '../services/bases.service.js';
import {
  purgeTrashedTablesOlderThan,
  getDefaultTableIdForBase,
  countActiveTablesForBase,
} from '../services/tables.service.js';

// ---------- Schemas ----------
const createBaseSchema = z.object({
  name: z.string().min(1, 'name requerido'),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
});

const updateBaseSchema = z
  .object({
    name: z.string().min(1).optional(),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  })
  .refine((d) => d.name !== undefined || d.visibility !== undefined, {
    message: 'Debes enviar al menos un campo a actualizar',
  });

// ---------- Helpers ----------
function parseBaseId(req: Request): number {
  const baseId = Number(req.params.baseId);
  if (!Number.isInteger(baseId) || baseId <= 0) {
    throw Object.assign(new Error('baseId inválido'), { status: 400 });
  }
  return baseId;
}

function parseWorkspaceId(req: Request): number {
  const workspaceId = Number(req.params.workspaceId);
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    throw Object.assign(new Error('workspaceId inválido'), { status: 400 });
  }
  return workspaceId;
}

/* ======================================================================================
   Derivación de membershipRole + permissions para el viewer actual
   --------------------------------------------------------------------------------------
   NOTA sobre el modelo:
   - Si tu modelo Prisma se llama `BaseMember` usa prisma.baseMember (como está aquí).
   - Si en tu schema se llama `BaseMembership`, cambia la línea por prisma.baseMembership.
   ====================================================================================== */

type MembershipRole = 'VIEWER' | 'COMMENTER' | 'EDITOR';
type DerivedPerms = {
  schemaManage: boolean;
  recordsRead: boolean;
  recordsCreate: boolean;
  recordsUpdate: boolean;
  recordsDelete: boolean;
  commentsCreate: boolean;
};

async function deriveMembershipAndPerms(opts: {
  baseId: number;
  viewerId: number;
  isSysadmin: boolean;
  ownerId?: number | null;
}): Promise<{ membershipRole: MembershipRole | null; permissions: DerivedPerms }> {
  const { baseId, viewerId, isSysadmin, ownerId } = opts;

  const isOwner = ownerId === viewerId;

  // SYSADMIN u Owner: todo permitido
  if (isSysadmin || isOwner) {
    return {
      membershipRole: null, // no es necesario para el FE cuando es owner/admin
      permissions: {
        schemaManage: true,
        recordsRead: true,
        recordsCreate: true,
        recordsUpdate: true,
        recordsDelete: true,
        commentsCreate: true,
      },
    };
  }

  // Buscar la membresía del usuario en esta base (activa)
  const membership = await prisma.baseMember.findFirst({
    where: { baseId, userId: viewerId },
    select: { role: true },
  });

  const role = (membership?.role ?? null) as MembershipRole | null;

  // Derivar permisos mínimos por rol
  const perms: DerivedPerms = {
    schemaManage: false, // solo owner/sysadmin
    recordsRead: true,   // si llegó al endpoint, ya pasó guard('base:view')
    recordsCreate: role === 'EDITOR',
    recordsUpdate: role === 'EDITOR',
    recordsDelete: role === 'EDITOR',
    commentsCreate: role === 'EDITOR' || role === 'COMMENTER',
  };

  return { membershipRole: role, permissions: perms };
}

/* ===========================
   WORKSPACES → BASES (nuevo)
   =========================== */

/**
 * POST /workspaces/:workspaceId/bases
 * CREAR BASE DENTRO DE UN WORKSPACE
 * Requiere: requireAuth + guardGlobal('bases:create') en ruta.
 * - Valida que el workspace exista, no esté en papelera y pertenezca al owner.
 */
export async function createBaseInWorkspaceCtrl(req: Request, res: Response) {
  try {
    const me = getAuthUser<{ id: number }>(req);
    if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const workspaceId = parseWorkspaceId(req);

    const parsed = createBaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Body inválido' });
    }

    const base = await createBaseInWorkspace({
      ownerId: me.id,
      workspaceId,
      name: parsed.data.name,
      visibility: parsed.data.visibility ?? 'PRIVATE',
    });

    return res.status(201).json({ ok: true, base });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json(err.body ?? { ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: 'No se pudo crear la base en el workspace' });
  }
}

/**
 * GET /workspaces/:workspaceId/bases
 * LISTAR BASES ACTIVAS DE UN WORKSPACE
 * Requiere: requireAuth
 * - SYSADMIN ve todas (excluye papelera).
 * - Usuario ve solo las accesibles según reglas (excluye papelera).
 */
export async function listBasesForWorkspaceCtrl(req: Request, res: Response) {
  try {
    const me = getAuthUser<{ id: number; platformRole: 'USER' | 'SYSADMIN' }>(req);
    if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const workspaceId = parseWorkspaceId(req);

    const bases = await listBasesForWorkspace(workspaceId, me.id, {
      isSysadmin: me.platformRole === 'SYSADMIN',
    });

    return res.json({ ok: true, bases });
  } catch (err: any) {
    return res
      .status(err?.status ?? 500)
      .json({ ok: false, error: err?.message ?? 'No se pudieron listar las bases del workspace' });
  }
}

/**
 * PATCH /bases/:baseId/move-to-workspace   { newWorkspaceId }
 * MOVER UNA BASE A OTRO WORKSPACE (MISMO OWNER)
 * Requiere: requireAuth + guard('schema:manage') en ruta.
 * - Permite SYSADMIN o el owner; el workspace destino debe ser del mismo owner y estar activo.
 */
export async function moveBaseToWorkspaceCtrl(req: Request, res: Response) {
  try {
    const me = getAuthUser<{ id: number; platformRole: 'USER' | 'SYSADMIN' }>(req);
    if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const baseId = parseBaseId(req);

    const bodySchema = z.object({ newWorkspaceId: z.number().int().positive() });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'newWorkspaceId inválido' });
    }

    const base = await moveBaseToWorkspace(baseId, parsed.data.newWorkspaceId, {
      userId: me.id,
      isSysadmin: me.platformRole === 'SYSADMIN',
    });

    return res.json({ ok: true, base });
  } catch (err: any) {
    return res.status(err?.status ?? 500).json({ ok: false, error: err?.message ?? 'No se pudo mover la base' });
  }
}

/* ===========================
   CRUD BASES (activas)
   =========================== */

/**
 * GET /bases
 * Lista bases accesibles con soporte de búsqueda/paginación.
 * - SYSADMIN: todas (excluye papelera)
 * - USER: accesibles para el usuario (excluye papelera)
 * Query: page, pageSize, q
 */
export async function listMyBasesCtrl(req: Request, res: Response) {
  const me = getAuthUser<{ id: number; platformRole: 'USER' | 'SYSADMIN' }>(req);
  if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });

  const page = Math.max(1, Number(req.query.page) || 1);
  const rawPageSize = Number(req.query.pageSize) || 12;
  const pageSize = Math.min(100, Math.max(1, rawPageSize));
  const q = String(req.query.q ?? '').trim();

  const { bases, total } = await searchBasesPaged({
    viewerId: me.id,
    isSysadmin: me.platformRole === 'SYSADMIN',
    q,
    page,
    pageSize,
  });

  return res.json({ ok: true, bases, total, page, pageSize });
}

/**
 * GET /bases/:baseId
 * Incluye membershipRole y permissions para el viewer actual.
 */
export async function getBaseCtrl(req: Request, res: Response) {
  const me = getAuthUser<{ id: number; platformRole: 'USER' | 'SYSADMIN' }>(req);
  if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });

  const baseId = parseBaseId(req);
  const base = await getBaseById(baseId); // excluye papelera
  if (!base) return res.status(404).json({ ok: false, error: 'Base no encontrada' });

  const { membershipRole, permissions } = await deriveMembershipAndPerms({
    baseId,
    viewerId: me.id,
    isSysadmin: me.platformRole === 'SYSADMIN',
    ownerId: base.ownerId ?? null,
  });

  return res.json({ ok: true, base, membershipRole, permissions });
}

/**
 * GET /bases/:baseId/resolve
 * Devuelve la base, el id de la tabla por defecto (primera por position) y metadatos para el grid.
 * También incluye membershipRole y permissions para que el FE pueda decidir permisos de edición.
 */
export async function resolveBaseCtrl(req: Request, res: Response) {
  try {
    const me = getAuthUser<{ id: number; platformRole: 'USER' | 'SYSADMIN' }>(req);
    if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const baseId = parseBaseId(req);

    const base = await getBaseById(baseId); // ya excluye papelera
    if (!base) return res.status(404).json({ ok: false, error: 'Base no encontrada' });

    const [defaultTableId, totalTables] = await Promise.all([
      getDefaultTableIdForBase(baseId),        // null si no hay tablas activas
      countActiveTablesForBase(baseId),        // número de tablas activas
    ]);

    const { membershipRole, permissions } = await deriveMembershipAndPerms({
      baseId,
      viewerId: me.id,
      isSysadmin: me.platformRole === 'SYSADMIN',
      ownerId: base.ownerId ?? null,
    });

    return res.json({
      ok: true,
      base,
      defaultTableId, // null si no hay tablas
      gridMeta: {
        totalTables,
        columns: [] as Array<{ id: number; name: string; type: string; width?: number }>,
        primaryColumnId: null as number | null,
        defaultSort: null as null | { columnId: number; direction: 'asc' | 'desc' },
        rowHeight: 'default' as 'default' | 'compact' | 'tall',
        version: 1,
      },
      membershipRole,
      permissions,
    });
  } catch (err: any) {
    return res
      .status(err?.status ?? 500)
      .json({ ok: false, error: err?.message ?? 'No se pudo resolver la base' });
  }
}

export async function updateBaseCtrl(req: Request, res: Response) {
  const baseId = parseBaseId(req);

  const parsed = updateBaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Body inválido' });
  }

  try {
    const base = await updateBase(baseId, parsed.data);
    return res.json({ ok: true, base });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json(err.body ?? { ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: 'No se pudo actualizar la base' });
  }
}

export async function deleteBaseCtrl(req: Request, res: Response) {
  const baseId = parseBaseId(req);
  await deleteBase(baseId); // SOFT DELETE (papelera + cascada a tablas)
  return res.json({ ok: true });
}

/* ===========================
   ===== Papelera (owner) =====
   =========================== */

export async function listMyTrashedBasesCtrl(req: Request, res: Response) {
  const me = getAuthUser<{ id: number }>(req);
  if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });

  const bases = await listTrashedBasesForOwner(me.id);
  return res.json({ ok: true, bases });
}

export async function restoreBaseCtrl(req: Request, res: Response) {
  const me = getAuthUser<{ id: number }>(req);
  if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });

  const baseId = parseBaseId(req);

  try {
    const base = await restoreBase(baseId, me.id);
    return res.json({ ok: true, base });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json(err.body ?? { ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: 'No se pudo restaurar la base' });
  }
}

export async function deleteBasePermanentCtrl(req: Request, res: Response) {
  const me = getAuthUser<{ id: number }>(req);
  if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });

  const baseId = parseBaseId(req);

  try {
    await deleteBasePermanently(baseId, me.id);
    return res.json({ ok: true });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: 'No se pudo eliminar definitivamente la base' });
  }
}

export async function emptyMyTrashCtrl(req: Request, res: Response) {
  const me = getAuthUser<{ id: number }>(req);
  if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });

  await emptyTrashForOwner(me.id);
  return res.json({ ok: true });
}

/* ===========================
   ===== PURGE (admin) =======
   =========================== */

export async function purgeTrashCtrl(req: Request, res: Response) {
  const me = getAuthUser<{ platformRole: 'USER' | 'SYSADMIN' }>(req);
  if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });
  if (me.platformRole !== 'SYSADMIN') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }
  const days = Number(req.query.days ?? 30);
  const safeDays = Number.isFinite(days) && days >= 0 ? days : 30;

  await purgeTrashedTablesOlderThan(safeDays);
  await purgeTrashedBasesOlderThan(safeDays);

  return res.json({ ok: true, purgedAfterDays: safeDays });
}

/* ===========================
   ===== NUEVO ADMIN =========
   =========================== */

export async function listAllTrashedBasesCtrl(req: Request, res: Response) {
  const me = getAuthUser<{ platformRole: 'USER' | 'SYSADMIN' }>(req);
  if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });
  if (me.platformRole !== 'SYSADMIN') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  const ownerId = req.query.ownerId !== undefined ? Number(req.query.ownerId) : undefined;
  if (ownerId !== undefined && (!Number.isInteger(ownerId) || ownerId <= 0)) {
    return res.status(400).json({ ok: false, error: 'ownerId inválido' });
  }

  const bases = await listTrashedBasesForAdmin({ ownerId });
  return res.json({ ok: true, bases });
}

export async function restoreBaseAdminCtrl(req: Request, res: Response) {
  const me = getAuthUser<{ id: number; platformRole: 'USER' | 'SYSADMIN' }>(req);
  if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });
  if (me.platformRole !== 'SYSADMIN') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  const baseId = parseBaseId(req);

  try {
    const base = await restoreBase(baseId, { userId: me.id, isSysadmin: true });
    return res.json({ ok: true, base });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json(err.body ?? { ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: 'No se pudo restaurar la base' });
  }
}

export async function deleteBasePermanentAdminCtrl(req: Request, res: Response) {
  const me = getAuthUser<{ id: number; platformRole: 'USER' | 'SYSADMIN' }>(req);
  if (!me) return res.status(401).json({ ok: false, error: 'No autenticado' });
  if (me.platformRole !== 'SYSADMIN') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  const baseId = parseBaseId(req);

  try {
    await deleteBasePermanently(baseId, { userId: me.id, isSysadmin: true });
    return res.json({ ok: true });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: 'No se pudo eliminar definitivamente la base' });
  }
}