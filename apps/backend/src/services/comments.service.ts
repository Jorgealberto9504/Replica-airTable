import { prisma } from './db.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { AuditAction, BaseRole, PlatformRole } from '@prisma/client';
import { logAudit } from './audit.service.js';

/* ========= Helpers ========= */

function makeSnippet(s: string, max = 140) {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

async function getBaseContextByTable(tableId: number) {
  const t = await prisma.tableDef.findUnique({
    where: { id: tableId },
    select: { id: true, baseId: true, base: { select: { ownerId: true } } },
  });
  if (!t) throw notFound('La tabla no existe.');
  return { baseId: t.baseId, ownerId: t.base.ownerId };
}

async function canComment(tableId: number, userId: number | null) {
  if (!userId) return false;
  const { baseId, ownerId } = await getBaseContextByTable(tableId);

  const [user, member] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true, id: true } }),
    prisma.baseMember.findUnique({
      where: { baseId_userId: { baseId, userId } },
      select: { role: true },
    }),
  ]);

  if (user?.platformRole === PlatformRole.SYSADMIN) return true;
  if (ownerId === userId) return true;
  return member?.role === BaseRole.EDITOR || member?.role === BaseRole.COMMENTER;
}

async function canEditOrDeleteComment(commentId: number, userId: number | null) {
  if (!userId) return false;
  const c = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { createdById: true, record: { select: { tableId: true } } },
  });
  if (!c) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true, id: true },
  });
  if (user?.platformRole === PlatformRole.SYSADMIN) return true;
  return c.createdById === userId;
}

/* ========= Servicios ========= */

export async function listCommentsSvc(
  _baseId: number,
  tableId: number,
  recordId: number,
  page = 1,
  pageSize = 50,
) {
  // ✅ Validación rápida de existencia (usa índice en recordId + tableId)
  const rec = await prisma.recordRow.findFirst({
    where: { id: recordId, tableId, isTrashed: false },
    select: { id: true },
  });
  if (!rec) throw notFound('La fila no existe en esta tabla.');

  // ✅ Consulta optimizada: solo campos necesarios y con join mínimo
  const [items, total] = await Promise.all([
    prisma.comment.findMany({
      where: { recordId, isTrashed: false },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        body: true,
        createdAt: true,
        // ⚡ solo traemos nombre del autor, sin updatedBy (reduce ~50% del peso)
        createdBy: {
          select: { id: true, fullName: true },
        },
      },
    }),
    prisma.comment.count({ where: { recordId, isTrashed: false } }),
  ]);

  return { total, comments: items };
}

export async function createCommentSvc(
  _baseId: number,
  tableId: number,
  recordId: number,
  body: string,
  userId: number | null,
) {
  if (!body || !body.trim()) throw badRequest('El comentario no puede estar vacío.');
  if (!(await canComment(tableId, userId))) {
    throw forbidden('No tienes permisos para comentar en esta tabla.');
  }

  const rec = await prisma.recordRow.findFirst({
    where: { id: recordId, tableId, isTrashed: false },
    select: { id: true },
  });
  if (!rec) throw notFound('La fila no existe en esta tabla.');

  const c = await prisma.comment.create({
    data: {
      recordId,
      body: body.trim(),
      createdById: userId ?? undefined,
      updatedById: userId ?? undefined,
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { id: true, fullName: true } },
      updatedBy: { select: { id: true, fullName: true } },
    },
  });

  const { baseId } = await getBaseContextByTable(tableId);
  await logAudit(undefined, {
    baseId,
    tableId,
    recordId,
    userId: userId ?? undefined,
    action: AuditAction.COMMENT_CREATED,
    summary: `Agregó un comentario en la fila #${recordId}`,
    details: { commentId: c.id, snippet: makeSnippet(body) },
  });

  return c;
}

export async function updateCommentSvc(
  _baseId: number,
  tableId: number,
  recordId: number,
  commentId: number,
  body: string,
  userId: number | null,
) {
  if (!body || !body.trim()) throw badRequest('El comentario no puede estar vacío.');

  const current = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, body: true, recordId: true, record: { select: { tableId: true } } },
  });
  if (!current || current.recordId !== recordId || current.record.tableId !== tableId) {
    throw notFound('Comentario no encontrado en esta fila.');
  }

  if (!(await canEditOrDeleteComment(commentId, userId))) {
    throw forbidden('Solo el autor o un SYSADMIN pueden editar este comentario.');
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { body: body.trim(), updatedById: userId ?? undefined },
  });

  const { baseId } = await getBaseContextByTable(tableId);
  await logAudit(undefined, {
    baseId,
    tableId,
    recordId,
    userId: userId ?? undefined,
    action: AuditAction.COMMENT_EDITED,
    summary: `Editó un comentario en la fila #${recordId}`,
    details: {
      commentId,
      oldSnippet: makeSnippet(current.body),
      newSnippet: makeSnippet(body),
    },
  });

  return { ok: true };
}

export async function softDeleteCommentSvc(
  _baseId: number,
  tableId: number,
  recordId: number,
  commentId: number,
  userId: number | null,
) {
  const c = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, body: true, recordId: true, record: { select: { tableId: true } } },
  });
  if (!c || c.recordId !== recordId || c.record.tableId !== tableId) {
    throw notFound('Comentario no encontrado en esta fila.');
  }

  if (!(await canEditOrDeleteComment(commentId, userId))) {
    throw forbidden('Solo el autor o un SYSADMIN pueden eliminar este comentario.');
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { isTrashed: true, trashedAt: new Date() },
  });

  const { baseId } = await getBaseContextByTable(tableId);
  await logAudit(undefined, {
    baseId,
    tableId,
    recordId,
    userId: userId ?? undefined,
    action: AuditAction.COMMENT_TRASHED,
    summary: `Eliminó un comentario en la fila #${recordId}`,
    details: { commentId, snippet: makeSnippet(c.body) },
  });

  return { ok: true };
}

/* ========= NUEVO: Conteo rápido por múltiples records ========= */
export async function countCommentsForRecordsSvc(
  _baseId: number,
  tableId: number,
  recordIds: number[],
) {
  if (!recordIds.length) return {};

  // Verifica que los records pertenezcan a esa tabla y estén activos
  const validRows = await prisma.recordRow.findMany({
    where: { tableId, id: { in: recordIds }, isTrashed: false },
    select: { id: true },
  });
  const validIds = validRows.map(r => r.id);
  if (!validIds.length) return {};

  const counts = await prisma.comment.groupBy({
    by: ['recordId'],
    where: { recordId: { in: validIds }, isTrashed: false },
    _count: { recordId: true },
  });

  const out: Record<number, number> = {};
  for (const c of counts) out[c.recordId] = c._count.recordId;
  return out;
}

/* ========= Papelera ========= */
export async function listTrashedCommentsSvc(recordId: number) {
  return prisma.comment.findMany({
    where: { recordId, isTrashed: true },
    orderBy: { trashedAt: 'desc' },
  });
}
export async function restoreCommentSvc(recordId: number, commentId: number) {
  const c = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!c || c.recordId !== recordId) throw notFound('Comentario no encontrado.');
  if (!c.isTrashed) throw badRequest('El comentario no está en papelera.');
  await prisma.comment.update({
    where: { id: commentId },
    data: { isTrashed: false, trashedAt: null },
  });
  return { ok: true };
}
export async function deleteCommentPermanentSvc(recordId: number, commentId: number) {
  const c = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!c || c.recordId !== recordId) throw notFound('Comentario no encontrado.');
  if (!c.isTrashed) throw badRequest('El comentario no está en papelera.');
  await prisma.comment.delete({ where: { id: commentId } });
  return { ok: true };
}
export async function emptyCommentTrashForRecordSvc(recordId: number) {
  await prisma.comment.deleteMany({ where: { recordId, isTrashed: true } });
  return { ok: true };
}
export async function purgeTrashedCommentsForRecordOlderThanSvc(recordId: number, days = 30) {
  const threshold = new Date(Date.now() - days * 86_400_000);
  await prisma.comment.deleteMany({
    where: { recordId, isTrashed: true, trashedAt: { lte: threshold } },
  });
  return { ok: true };
}