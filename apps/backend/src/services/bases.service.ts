import { prisma } from './db.js';
import type { BaseVisibility } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { restoreAllTablesForBaseInTx } from './tables.service.js';

// Helper: mapear duplicados a HTTP 409
function rethrowConflictIfDuplicateBase(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const err: any = new Error('Unique constraint violation');
    err.status = 409;
    err.body = {
      error: 'CONFLICT',
      detail: 'Duplicate base name for this owner', // (ownerId, name, isTrashed=false)
      code: 'P2002',
      meta: e.meta,
    };
    throw err;
  }
  throw e;
}

/* ==================================================================
   === WORKSPACES: helpers internos para validar workspace         ===
   ================================================================== */

async function assertWorkspaceActiveAndOwned(workspaceId: number, ownerId: number) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true, isTrashed: true },
  });
  if (!ws || ws.isTrashed) {
    const err: any = new Error('Workspace no encontrado');
    err.status = 404;
    throw err;
  }
  if (ws.ownerId !== ownerId) {
    const err: any = new Error('FORBIDDEN: El workspace pertenece a otro owner');
    err.status = 403;
    throw err;
  }
  return ws;
}

/* ===========================
   CREAR BASE (general)
   =========================== */
export async function createBase(input: {
  ownerId: number;
  name: string;
  visibility: BaseVisibility;
}) {
  try {
    return await prisma.base.create({
      data: {
        ownerId: input.ownerId,
        name: input.name,
        visibility: input.visibility,
      },
      select: {
        id: true,
        name: true,
        visibility: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        isTrashed: true,
        trashedAt: true,
      },
    });
  } catch (e) {
    rethrowConflictIfDuplicateBase(e);
  }
}

/* ================================================================
   === WORKSPACES: crear base dentro de un workspace dado        ===
   ================================================================ */
export async function createBaseInWorkspace(input: {
  ownerId: number;
  workspaceId: number;
  name: string;
  visibility: BaseVisibility;
}) {
  await assertWorkspaceActiveAndOwned(input.workspaceId, input.ownerId);

  try {
    return await prisma.base.create({
      data: {
        ownerId: input.ownerId,
        workspaceId: input.workspaceId,
        name: input.name,
        visibility: input.visibility,
      },
      select: {
        id: true,
        name: true,
        visibility: true,
        ownerId: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
        isTrashed: true,
        trashedAt: true,
      },
    });
  } catch (e) {
    rethrowConflictIfDuplicateBase(e);
  }
}

/**
 * Lista bases accesibles para un usuario (excluye papelera).
 */
export async function listAccessibleBasesForUser(userId: number) {
  const bases = await prisma.base.findMany({
    where: {
      isTrashed: false,
      OR: [
        { visibility: 'PUBLIC' },
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    },
    select: {
      id: true,
      name: true,
      visibility: true,
      ownerId: true,
      workspaceId: true,
      createdAt: true,
      updatedAt: true,
      isTrashed: true,
      trashedAt: true,
      owner: { select: { id: true, fullName: true, email: true } },
      members: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
    orderBy: { id: 'asc' },
  });

  return bases.map((b) => ({
    ...b,
    membershipRole: b.members[0]?.role ?? null,
    members: undefined as any,
  }));
}

/* ===========================================================================
   === WORKSPACES: listar bases activas por workspace (con permisos)       ===
   =========================================================================== */
export async function listBasesForWorkspace(
  workspaceId: number,
  viewerUserId: number,
  opts?: { isSysadmin?: boolean }
) {
  const isSysadmin = !!opts?.isSysadmin;

  const where: Prisma.BaseWhereInput = isSysadmin
    ? { workspaceId, isTrashed: false }
    : {
        workspaceId,
        isTrashed: false,
        OR: [
          { visibility: 'PUBLIC' },
          { ownerId: viewerUserId },
          { members: { some: { userId: viewerUserId } } },
        ],
      };

  return prisma.base.findMany({
    where,
    select: {
      id: true,
      name: true,
      visibility: true,
      ownerId: true,
      workspaceId: true,
      createdAt: true,
      updatedAt: true,
      isTrashed: true,
      trashedAt: true,
      owner: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { id: 'asc' },
  });
}

/**
 * SYSADMIN: lista TODAS las bases (excluye papelera).
 */
export async function listAllBasesForSysadmin(viewerUserId: number) {
  const bases = await prisma.base.findMany({
    where: { isTrashed: false },
    select: {
      id: true,
      name: true,
      visibility: true,
      ownerId: true,
      workspaceId: true,
      createdAt: true,
      updatedAt: true,
      isTrashed: true,
      trashedAt: true,
      owner: { select: { id: true, fullName: true, email: true } },
      members: {
        where: { userId: viewerUserId },
        select: { role: true },
        take: 1,
      },
    },
    orderBy: { id: 'asc' },
  });

  return bases.map((b) => ({
    ...b,
    membershipRole: b.members[0]?.role ?? null,
    members: undefined as any,
  }));
}

export async function getBaseById(baseId: number) {
  return prisma.base.findFirst({
    where: { id: baseId, isTrashed: false },
    select: {
      id: true,
      name: true,
      visibility: true,
      ownerId: true,
      workspaceId: true,
      createdAt: true,
      updatedAt: true,
      isTrashed: true,
      trashedAt: true,
      owner: { select: { id: true, fullName: true, email: true } },
    },
  });
}

export async function updateBase(
  baseId: number,
  patch: { name?: string; visibility?: BaseVisibility }
) {
  const current = await prisma.base.findUnique({
    where: { id: baseId },
    select: { isTrashed: true },
  });
  if (!current) {
    const err: any = new Error('Base no encontrada');
    err.status = 404;
    throw err;
  }
  if (current.isTrashed) {
    const err: any = new Error('No puedes actualizar una base en la papelera. Restaúrala primero.');
    err.status = 409;
    throw err;
  }

  try {
    return await prisma.base.update({
      where: { id: baseId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
      },
      select: {
        id: true,
        name: true,
        visibility: true,
        ownerId: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
        isTrashed: true,
        trashedAt: true,
      },
    });
  } catch (e) {
    rethrowConflictIfDuplicateBase(e);
  }
}

export async function moveBaseToWorkspace(
  baseId: number,
  newWorkspaceId: number,
  actor: { userId: number; isSysadmin: boolean }
) {
  const base = await prisma.base.findUnique({
    where: { id: baseId },
    select: { id: true, ownerId: true, isTrashed: true },
  });
  if (!base) {
    const err: any = new Error('Base no encontrada');
    err.status = 404;
    throw err;
  }
  if (base.isTrashed) {
    const err: any = new Error('No puedes mover una base en la papelera. Restaúrala primero.');
    err.status = 409;
    throw err;
  }

  const ws = await prisma.workspace.findUnique({
    where: { id: newWorkspaceId },
    select: { id: true, ownerId: true, isTrashed: true },
  });
  if (!ws || ws.isTrashed) {
    const err: any = new Error('Workspace destino no encontrado');
    err.status = 404;
    throw err;
  }

  if (ws.ownerId !== base.ownerId) {
    const err: any = new Error('No puedes mover la base a un workspace de otro owner');
    err.status = 409;
    throw err;
  }

  if (!actor.isSysadmin && actor.userId !== base.ownerId) {
    const err: any = new Error('FORBIDDEN');
    err.status = 403;
    throw err;
  }

  return prisma.base.update({
    where: { id: baseId },
    data: { workspaceId: newWorkspaceId },
    select: {
      id: true,
      name: true,
      visibility: true,
      ownerId: true,
      workspaceId: true,
      createdAt: true,
      updatedAt: true,
      isTrashed: true,
      trashedAt: true,
    },
  });
}

/* ===========================
   Enviar base a papelera
   =========================== */
export async function deleteBase(baseId: number) {
  // Transacción: mandar base a papelera y, después, sus tablas activas
  await prisma.$transaction(async (tx) => {
    // 1) Base → papelera
    try {
      await tx.base.update({
        where: { id: baseId },
        data: { isTrashed: true, trashedAt: new Date() },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const current = await tx.base.findUnique({ where: { id: baseId }, select: { name: true } });
        const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
        await tx.base.update({
          where: { id: baseId },
          data: { name: `${current?.name ?? 'Base'} (deleted ${stamp})`, isTrashed: true, trashedAt: new Date() },
        });
      } else {
        throw e;
      }
    }

    // 2) Todas las tablas activas de esa base → papelera
    await tx.tableDef.updateMany({
      where: { baseId, isTrashed: false },
      data: { isTrashed: true, trashedAt: new Date() },
    });
  });
}

/* ===========================
   Listados de papelera
   =========================== */

export async function listTrashedBasesForOwner(ownerId: number) {
  return prisma.base.findMany({
    where: {
      ownerId,
      isTrashed: true,
      // ⬇️ no mostrar bases cuyo workspace aún está en papelera
      OR: [{ workspaceId: null }, { workspace: { isTrashed: false } }],
    },
    select: {
      id: true,
      name: true,
      visibility: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      isTrashed: true,
      trashedAt: true,
    },
    orderBy: { trashedAt: 'desc' },
  });
}

export async function listTrashedBasesForAdmin(params?: { ownerId?: number }) {
  return prisma.base.findMany({
    where: { isTrashed: true, ...(params?.ownerId ? { ownerId: params.ownerId } : {}) },
    select: {
      id: true,
      name: true,
      visibility: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      isTrashed: true,
      trashedAt: true,
      owner: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: [{ ownerId: 'asc' }, { trashedAt: 'desc' }],
  });
}

/* ===========================
   Restaurar base (+ todas sus tablas)
   =========================== */
export async function restoreBase(
  baseId: number,
  ownerIdOrActor: number | { userId: number; isSysadmin: boolean }
) {
  // Verificación de pertenencia/permiso previa
  const base = await prisma.base.findUnique({
    where: { id: baseId },
    select: { id: true, ownerId: true, name: true, isTrashed: true },
  });
  if (!base || !base.isTrashed) {
    const err: any = new Error('Base no encontrada o no está en papelera');
    err.status = 404;
    throw err;
  }

  const isAllowed =
    typeof ownerIdOrActor === 'number'
      ? base.ownerId === ownerIdOrActor
      : ownerIdOrActor.isSysadmin || base.ownerId === ownerIdOrActor.userId;

  if (!isAllowed) {
    const err: any = new Error('FORBIDDEN');
    err.status = 403;
    throw err;
  }

  try {
    // Transacción: restaurar base y TODAS sus tablas
    const restored = await prisma.$transaction(async (tx) => {
      // 1) Restaurar base
      const baseRestored = await tx.base.update({
        where: { id: baseId },
        data: { isTrashed: false, trashedAt: null },
        select: {
          id: true,
          name: true,
          visibility: true,
          ownerId: true,
          workspaceId: true,
          createdAt: true,
          updatedAt: true,
          isTrashed: true,
          trashedAt: true,
        },
      });

      // 2) Restaurar TODAS las tablas de esa base (asigna posiciones nuevas al final)
      await restoreAllTablesForBaseInTx(tx, baseId);

      return baseRestored;
    });

    return restored;
  } catch (e) {
    rethrowConflictIfDuplicateBase(e);
  }
}

/* ===========================
   Borrado definitivo
   =========================== */
export async function deleteBasePermanently(
  baseId: number,
  ownerIdOrActor: number | { userId: number; isSysadmin: boolean }
) {
  const base = await prisma.base.findUnique({
    where: { id: baseId },
    select: { ownerId: true, isTrashed: true },
  });
  if (!base) {
    const err: any = new Error('Base no encontrada');
    err.status = 404;
    throw err;
  }
  if (!base.isTrashed) {
    const err: any = new Error('La base no está en la papelera.');
    err.status = 400;
    throw err;
  }

  const isAllowed =
    typeof ownerIdOrActor === 'number'
      ? base.ownerId === ownerIdOrActor
      : ownerIdOrActor.isSysadmin || base.ownerId === ownerIdOrActor.userId;

  if (!isAllowed) {
    const err: any = new Error('FORBIDDEN');
    err.status = 403;
    throw err;
  }

  // Transacción: eliminar tablas y luego la base para evitar FK/orfandad
  await prisma.$transaction(async (tx) => {
    await tx.tableDef.deleteMany({ where: { baseId } });
    await tx.base.delete({ where: { id: baseId } });
  });

  return { ok: true };
}

/* ===========================
   Vaciar papelera (owner)
   =========================== */
export async function emptyTrashForOwner(ownerId: number) {
  // Traer ids de bases en papelera del owner
  const bases = await prisma.base.findMany({
    where: { ownerId, isTrashed: true },
    select: { id: true },
  });
  const ids = bases.map((b) => b.id);
  if (ids.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.tableDef.deleteMany({ where: { baseId: { in: ids } } });
    await tx.base.deleteMany({ where: { id: { in: ids } } });
  });
}

/* ===========================
   Purga automática de papelera
   =========================== */
export async function purgeTrashedBasesOlderThan(days: number = 30) {
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Buscar ids a purgar
  const bases = await prisma.base.findMany({
    where: { isTrashed: true, trashedAt: { lte: threshold } },
    select: { id: true },
  });
  const ids = bases.map((b) => b.id);
  if (ids.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.tableDef.deleteMany({ where: { baseId: { in: ids } } });
    await tx.base.deleteMany({ where: { id: { in: ids } } });
  });
}

/* ===========================
   NUEVO: Búsqueda paginada (sin migraciones)
   =========================== */
export async function searchBasesPaged(params: {
  viewerId: number;
  isSysadmin: boolean;
  q?: string;
  page: number;      // 1-based
  pageSize: number;  // <= 100
}) {
  const { viewerId, isSysadmin, q, page, pageSize } = params;
  const skip = (page - 1) * pageSize;

  const where: Prisma.BaseWhereInput = {
    isTrashed: false,
    ...(isSysadmin
      ? {}
      : {
          OR: [
            { visibility: 'PUBLIC' },
            { ownerId: viewerId },
            { members: { some: { userId: viewerId } } },
          ],
        }),
    ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.base.count({ where }),
    prisma.base.findMany({
      where,
      orderBy: [{ id: 'asc' }],
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        visibility: true,
        ownerId: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
        isTrashed: true,
        trashedAt: true,
        owner: { select: { id: true, fullName: true, email: true } },
        ...(isSysadmin
          ? {}
          : {
              members: {
                where: { userId: viewerId },
                select: { role: true },
                take: 1,
              },
            }),
      },
    }),
  ]);

  const bases = rows.map((b: any) => ({
    ...b,
    membershipRole: isSysadmin ? null : b.members?.[0]?.role ?? null,
    ...(isSysadmin ? {} : { members: undefined as any }),
  }));

  return { bases, total };
}