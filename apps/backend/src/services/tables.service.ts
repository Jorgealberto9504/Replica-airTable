// apps/backend/src/services/tables.service.ts
import { prisma, prismaDirect } from './db.js';
import { Prisma } from '@prisma/client';
import type { Prisma as P, TableDef } from '@prisma/client';

type TableDTO = Pick<
  TableDef,
  'id' | 'baseId' | 'name' | 'position' | 'createdAt' | 'updatedAt' | 'isTrashed' | 'trashedAt'
>;

/** Helper para detectar violación de unique (baseId, name, isTrashed=false) */
export function isDuplicateTableNameError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

// Mapear duplicados a HTTP 409 (y tipar como `never` para que TS sepa que SIEMPRE lanza)
function rethrowConflictIfDuplicateTable(e: unknown): never {
  if (isDuplicateTableNameError(e)) {
    const err: any = new Error('Unique constraint violation');
    err.status = 409;
    err.body = {
      error: 'CONFLICT',
      detail: 'Duplicate table name within this base',
      code: 'P2002',
      meta: (e as Prisma.PrismaClientKnownRequestError).meta,
    };
    throw err;
  }
  // No fue P2002 → relanzamos el original
  throw e as any;
}

/* ======================================================
   Bloquear CRUD si la BASE está en papelera
   ====================================================== */
async function ensureBaseActive(baseId: number): Promise<void> {
  const base = await prisma.base.findUnique({
    where: { id: baseId },
    select: { isTrashed: true },
  });
  if (!base) {
    const err: any = new Error('Base no encontrada');
    err.status = 404;
    throw err;
  }
  if (base.isTrashed) {
    const err: any = new Error('La base está en la papelera. Restaúrala primero.');
    err.status = 409;
    throw err;
  }
}

/* ==========================================
   util para calcular siguiente posición
   ========================================== */
async function getNextPosition(baseId: number): Promise<number> {
  const agg = await prisma.tableDef.aggregate({
    where: { baseId, isTrashed: false },
    _max: { position: true },
  });
  const maxPos = agg._max.position ?? 0;
  return maxPos + 1;
}

/* ==========================================
   T6.9: helpers de resolución/metadata
   ========================================== */
/** Micro-caché (in-memory) 5s para resolver defaultTableId y total de tablas */
const _defaultTableCache = new Map<number, { id: number | null; at: number }>();
const _tableCountCache   = new Map<number, { n: number; at: number }>();
const TTL_MS = 5000;

function clearBaseCache(baseId: number, opts?: { defaultId?: boolean; count?: boolean }) {
  const applyDefault = opts?.defaultId ?? true;
  const applyCount   = opts?.count ?? true;
  if (applyDefault) _defaultTableCache.delete(baseId);
  if (applyCount)   _tableCountCache.delete(baseId);
}

export async function getDefaultTableIdForBase(baseId: number): Promise<number | null> {
  await ensureBaseActive(baseId);
  const now = Date.now();
  const c = _defaultTableCache.get(baseId);
  if (c && now - c.at < TTL_MS) return c.id;

  const row = await prisma.tableDef.findFirst({
    where: { baseId, isTrashed: false },
    select: { id: true },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  const id = row?.id ?? null;
  _defaultTableCache.set(baseId, { id, at: now });
  return id;
}

export async function countActiveTablesForBase(baseId: number): Promise<number> {
  await ensureBaseActive(baseId);
  const now = Date.now();
  const c = _tableCountCache.get(baseId);
  if (c && now - c.at < TTL_MS) return c.n;

  const n = await prisma.tableDef.count({ where: { baseId, isTrashed: false } });
  _tableCountCache.set(baseId, { n, at: now });
  return n;
}



/* ==========================================
   CRUD de tablas
   ========================================== */
export async function createTable(baseId: number, name: string): Promise<TableDTO> {
  await ensureBaseActive(baseId);
  try {
    const position = await getNextPosition(baseId);
    const created = await prisma.tableDef.create({
      data: { baseId, name, position },
      select: {
        id: true, baseId: true, name: true, position: true,
        createdAt: true, updatedAt: true, isTrashed: true, trashedAt: true,
      },
    });
    clearBaseCache(baseId); // cambia cantidad y podría afectar default table
    return created;
  } catch (e) {
    rethrowConflictIfDuplicateTable(e); // never
  }
}

export async function listTablesForBase(baseId: number): Promise<TableDTO[]> {
  await ensureBaseActive(baseId);
  return prisma.tableDef.findMany({
    where: { baseId, isTrashed: false },
    select: {
      id: true, baseId: true, name: true, position: true,
      createdAt: true, updatedAt: true, isTrashed: true, trashedAt: true,
    },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
}

/** listado ligero para barra */
export async function listTablesNavForBase(baseId: number) {
  await ensureBaseActive(baseId);
  return prisma.tableDef.findMany({
    where: { baseId, isTrashed: false },
    select: { id: true, name: true, position: true },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
}

export async function getTableById(baseId: number, tableId: number): Promise<TableDTO | null> {
  await ensureBaseActive(baseId);
  const tbl = await prisma.tableDef.findUnique({
    where: { id: tableId },
    select: {
      id: true, baseId: true, name: true, position: true,
      createdAt: true, updatedAt: true, isTrashed: true, trashedAt: true,
    },
  });
  return (tbl && tbl.baseId === baseId && !tbl.isTrashed) ? tbl : null;
}

export async function updateTable(
  baseId: number,
  tableId: number,
  patch: { name?: string }
): Promise<TableDTO> {
  await ensureBaseActive(baseId);
  const existing = await prisma.tableDef.findUnique({
    where: { id: tableId },
    select: { id: true, baseId: true, isTrashed: true },
  });
  if (!existing || existing.baseId !== baseId) {
    const err: any = new Error('Tabla no encontrada');
    (err as any).code = 'P2025';
    err.status = 404;
    throw err;
  }
  if (existing.isTrashed) {
    const err: any = new Error('No puedes actualizar una tabla en la papelera. Restaúrala primero.');
    err.status = 409;
    throw err;
  }

  try {
    return await prisma.tableDef.update({
      where: { id: tableId },
      data: { ...(patch.name !== undefined ? { name: patch.name } : {}) },
      select: {
        id: true, baseId: true, name: true, position: true,
        createdAt: true, updatedAt: true, isTrashed: true, trashedAt: true,
      },
    });
  } catch (e) {
    rethrowConflictIfDuplicateTable(e); // never
  }
}

/* Reordenamiento (drag & drop) */
export async function reorderTables(baseId: number, orderedIds: number[]) {
  await ensureBaseActive(baseId);

  const current = await prisma.tableDef.findMany({
    where: { baseId, isTrashed: false },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const currentIds = current.map((t) => t.id);
  const uniqueOrdered = Array.from(new Set(orderedIds));

  if (uniqueOrdered.length !== orderedIds.length) {
    const err: any = new Error('orderedIds contiene ids repetidos'); err.status = 400; throw err;
  }
  if (uniqueOrdered.length !== currentIds.length) {
    const err: any = new Error('orderedIds no coincide con la cantidad de tablas activas'); err.status = 400; throw err;
  }
  const currentSet = new Set(currentIds);
  for (const id of uniqueOrdered) {
    if (!currentSet.has(id)) {
      const err: any = new Error(`La tabla ${id} no pertenece a esta base o no está activa`); err.status = 400; throw err;
    }
  }

  await prisma.$transaction(
    uniqueOrdered.map((id, idx) =>
      prisma.tableDef.update({ where: { id }, data: { position: idx + 1 } })
    )
  );

  // Cambiar posiciones puede cambiar la "default table"
  clearBaseCache(baseId, { defaultId: true, count: false });

  return { ok: true };
}

/* SOFT DELETE */
export async function deleteTable(baseId: number, tableId: number): Promise<void> {
  const base = await prisma.base.findUnique({
    where: { id: baseId },
    select: { isTrashed: true },
  });
  if (!base) { const err: any = new Error('Base no encontrada'); err.status = 404; throw err; }
  if (base.isTrashed) return;

  const existing = await prisma.tableDef.findUnique({
    where: { id: tableId },
    select: { id: true, baseId: true, isTrashed: true, position: true },
  });
  if (!existing || existing.baseId !== baseId) {
    const err: any = new Error('Tabla no encontrada'); (err as any).code = 'P2025'; err.status = 404; throw err;
  }
  if (existing.isTrashed) return;

  await prisma.tableDef.update({
    where: { id: tableId },
    data: { isTrashed: true, trashedAt: new Date() },
  });

  // Soft delete reduce el total y podría cambiar la default
  clearBaseCache(baseId);
}

/* ===========================
   Papelera (OWNER)
   =========================== */
export async function listTrashedTablesForBase(baseId: number): Promise<TableDTO[]> {
  await ensureBaseActive(baseId);
  return prisma.tableDef.findMany({
    where: { baseId, isTrashed: true },
    select: {
      id: true, baseId: true, name: true, position: true,
      createdAt: true, updatedAt: true, isTrashed: true, trashedAt: true,
    },
    orderBy: { trashedAt: 'desc' },
  });
}

/* ===========================
   Papelera (ADMIN / GLOBAL)
   =========================== */
export async function listTrashedTablesForAdmin(params?: { ownerId?: number; baseId?: number }) {
  return prisma.tableDef.findMany({
    where: {
      isTrashed: true,
      ...(params?.baseId ? { baseId: params.baseId } : {}),
      base: {
        is: {
          isTrashed: false,
          ...(params?.ownerId ? { ownerId: params.ownerId } : {}),
        },
      },
    },
    select: {
      id: true,
      baseId: true,
      name: true,
      position: true,
      createdAt: true,
      updatedAt: true,
      isTrashed: true,
      trashedAt: true,
      base: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          owner: { select: { id: true, fullName: true, email: true } },
        },
      },
    },
    orderBy: [{ baseId: 'asc' }, { trashedAt: 'desc' }],
  });
}

/** Restaurar una tabla específica desde papelera */
export async function restoreTable(baseId: number, tableId: number): Promise<TableDTO> {
  const tbl = await prisma.tableDef.findUnique({
    where: { id: tableId },
    select: { id: true, baseId: true, isTrashed: true },
  });
  if (!tbl || tbl.baseId !== baseId) {
    const err: any = new Error('Tabla no encontrada'); err.status = 404; throw err;
  }
  if (!tbl.isTrashed) {
    const err: any = new Error('La tabla no está en la papelera.'); err.status = 400; throw err;
  }

  try {
    const newPos = await getNextPosition(baseId);
    const restored = await prisma.tableDef.update({
      where: { id: tableId },
      data: { isTrashed: false, trashedAt: null, position: newPos },
      select: {
        id: true, baseId: true, name: true, position: true,
        createdAt: true, updatedAt: true, isTrashed: true, trashedAt: true,
      },
    });
    // Restaurar cambia total y puede afectar default
    clearBaseCache(baseId);
    return restored;
  } catch (e) {
    rethrowConflictIfDuplicateTable(e); // never
  }
}

/** Borrado definitivo de una tabla (solo si está en papelera) */
export async function deleteTablePermanently(baseId: number, tableId: number): Promise<void> {
  const tbl = await prisma.tableDef.findUnique({
    where: { id: tableId },
    select: { id: true, baseId: true, isTrashed: true },
  });
  if (!tbl || tbl.baseId !== baseId) { const err: any = new Error('Tabla no encontrada'); err.status = 404; throw err; }
  if (!tbl.isTrashed) { const err: any = new Error('La tabla no está en la papelera.'); err.status = 400; throw err; }
  await prisma.tableDef.delete({ where: { id: tableId } });

  // Cambia total pero no default (si ya estaba en papelera); aún así limpiar por seguridad
  clearBaseCache(baseId, { count: true, defaultId: false });
}

/** Vaciar papelera de una base (borrado definitivo) */
export async function emptyTrashForBase(baseId: number): Promise<void> {
  await prisma.tableDef.deleteMany({ where: { baseId, isTrashed: true } });
  clearBaseCache(baseId, { count: true, defaultId: false });
}

/** Purga automática (≥ N días) */
export async function purgeTrashedTablesOlderThan(days: number = 30): Promise<void> {
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  await prisma.tableDef.deleteMany({
    where: { isTrashed: true, trashedAt: { lte: threshold } },
  });
  // No toca tablas activas → no hace falta limpiar cachés.
}

/* ===== Helpers para rename de tablas al restaurar ===== */
async function makeUniqueTableName(
  tx: P.TransactionClient,
  baseId: number,
  original: string
): Promise<string> {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let candidate = `${original} (restored ${stamp})`;
  let n = 1;
  while (true) {
    const exists = await tx.tableDef.findFirst({
      where: { baseId, name: candidate, isTrashed: false },
      select: { id: true },
    });
    if (!exists) return candidate;
    candidate = `${original} (restored ${stamp} #${n++})`;
  }
}

/* ======================================================
   Restaurar TODAS las tablas al restaurar la base (TRANSACCIONAL)
   ====================================================== */
export async function restoreAllTablesForBaseInTx(
  tx: P.TransactionClient,
  baseId: number
) {
  // 1) calcular próxima posición libre
  const agg = await tx.tableDef.aggregate({
    where: { baseId, isTrashed: false },
    _max: { position: true },
  });
  let nextPos = (agg._max.position ?? 0) + 1;

  // 2) traer todas las tablas en papelera (orden estable)
  const trashed = await tx.tableDef.findMany({
    where: { baseId, isTrashed: true },
    select: { id: true, name: true },
    orderBy: [{ trashedAt: 'asc' }, { id: 'asc' }],
  });

  // 3) restaurar una por una, resolviendo conflictos de nombre si aparecen
  for (const t of trashed) {
    try {
      await tx.tableDef.update({
        where: { id: t.id },
        data: { isTrashed: false, trashedAt: null, position: nextPos++ },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const newName = await makeUniqueTableName(tx, baseId, t.name);
        await tx.tableDef.update({
          where: { id: t.id },
          data: { name: newName, isTrashed: false, trashedAt: null, position: nextPos++ },
        });
      } else {
        throw e;
      }
    }
  }

  // 4) normalizar posiciones finales (1..n)
  const final = await tx.tableDef.findMany({
    where: { baseId, isTrashed: false },
    select: { id: true },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });

  let i = 0;
  for (const t of final) {
    i += 1;
    await tx.tableDef.update({ where: { id: t.id }, data: { position: i } });
  }

  // limpiar cachés relacionadas
  clearBaseCache(baseId);
}

/** Versión helper con transacción propia (si no estás ya dentro de una tx) */
export async function restoreAllTablesForBase(baseId: number) {
  await prismaDirect.$transaction(async (tx) => {
    await restoreAllTablesForBaseInTx(tx, baseId);
  });
  clearBaseCache(baseId);
}