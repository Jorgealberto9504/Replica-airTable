import { Request, Response } from 'express';
import { z } from 'zod';
import {
  listCommentsSvc,
  createCommentSvc,
  updateCommentSvc,
  softDeleteCommentSvc,
  listTrashedCommentsSvc,
  restoreCommentSvc,
  deleteCommentPermanentSvc,
  emptyCommentTrashForRecordSvc,
  purgeTrashedCommentsForRecordOlderThanSvc,
  countCommentsForRecordsSvc,
} from '../services/comments.service.js';
import { currentUserId } from '../utils/currentUser.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
const createSchema = z.object({
  body: z.string().min(1, 'El comentario no puede estar vacío.'),
});
const patchSchema = z.object({
  body: z.string().min(1, 'El comentario no puede estar vacío.'),
});

export async function listComments(req: Request, res: Response) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const recordId = Number(req.params.recordId);
    const { page, pageSize } = listQuery.parse(req.query);
    const { total, comments } = await listCommentsSvc(baseId, tableId, recordId, page, pageSize);
    res.json({ ok: true, total, comments });
  } catch (e: any) {
    res.status(e?.status ?? 400).json({ ok: false, error: e?.message ?? 'Error', details: e?.details });
  }
}

/* === NUEVO: Conteo rápido de comentarios por múltiples records === */
export async function countCommentsForRecords(req: Request, res: Response) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const raw = String(req.query.ids ?? '');
    const ids = raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
    if (!ids.length) return res.json({ ok: true, counts: {} });

    const counts = await countCommentsForRecordsSvc(baseId, tableId, ids.slice(0, 1000));
    res.json({ ok: true, counts });
  } catch (e: any) {
    res.status(e?.status ?? 400).json({ ok: false, error: e?.message ?? 'Error', details: e?.details });
  }
}

/* === CRUD existente === */
export async function createComment(req: Request, res: Response) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const recordId = Number(req.params.recordId);
    const userId = currentUserId(req, res);
    const { body } = createSchema.parse(req.body);
    const c = await createCommentSvc(baseId, tableId, recordId, body, userId);
    res.json({ ok: true, comment: c });
  } catch (e: any) {
    res.status(e?.status ?? 400).json({ ok: false, error: e?.message ?? 'Error', details: e?.details });
  }
}

export async function updateComment(req: Request, res: Response) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const recordId = Number(req.params.recordId);
    const commentId = Number(req.params.commentId);
    const userId = currentUserId(req, res);
    const { body } = patchSchema.parse(req.body);
    await updateCommentSvc(baseId, tableId, recordId, commentId, body, userId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e?.status ?? 400).json({ ok: false, error: e?.message ?? 'Error', details: e?.details });
  }
}

export async function softDeleteComment(req: Request, res: Response) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const recordId = Number(req.params.recordId);
    const commentId = Number(req.params.commentId);
    const userId = currentUserId(req, res);
    await softDeleteCommentSvc(baseId, tableId, recordId, commentId, userId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e?.status ?? 400).json({ ok: false, error: e?.message ?? 'Error', details: e?.details });
  }
}

/* ==== Papelera ==== */
export async function listTrashedComments(req: Request, res: Response) {
  try {
    const recordId = Number(req.params.recordId);
    const rows = await listTrashedCommentsSvc(recordId);
    res.json({ ok: true, comments: rows });
  } catch (e: any) {
    res.status(e?.status ?? 400).json({ ok: false, error: e?.message ?? 'Error', details: e?.details });
  }
}
export async function restoreComment(req: Request, res: Response) {
  try {
    const recordId = Number(req.params.recordId);
    const commentId = Number(req.params.commentId);
    await restoreCommentSvc(recordId, commentId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e?.status ?? 400).json({ ok: false, error: e?.message ?? 'Error', details: e?.details });
  }
}
export async function deleteCommentPermanent(req: Request, res: Response) {
  try {
    const recordId = Number(req.params.recordId);
    const commentId = Number(req.params.commentId);
    await deleteCommentPermanentSvc(recordId, commentId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e?.status ?? 400).json({ ok: false, error: e?.message ?? 'Error', details: e?.details });
  }
}
export async function emptyCommentTrash(req: Request, res: Response) {
  try {
    const recordId = Number(req.params.recordId);
    await emptyCommentTrashForRecordSvc(recordId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e?.status ?? 400).json({ ok: false, error: e?.message ?? 'Error', details: e?.details });
  }
}
export async function purgeCommentTrash(req: Request, res: Response) {
  try {
    const recordId = Number(req.params.recordId);
    const days = Number(req.query.days ?? 30);
    await purgeTrashedCommentsForRecordOlderThanSvc(recordId, Number.isFinite(days) && days >= 0 ? days : 30);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e?.status ?? 400).json({ ok: false, error: e?.message ?? 'Error', details: e?.details });
  }
}