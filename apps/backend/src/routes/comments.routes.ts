import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { guard } from '../permissions/guard.js';
import {
  listComments,
  createComment,
  updateComment,
  softDeleteComment,
  listTrashedComments,
  restoreComment,
  deleteCommentPermanent,
  emptyCommentTrash,
  purgeCommentTrash,
  countCommentsForRecords,
} from '../controllers/comments.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// Base: /bases/:baseId/tables/:tableId/records/:recordId/comments
router.get('/', guard('records:read'), listComments);
router.post('/', guard('comments:create'), createComment);

// Conteo rápido (nuevo endpoint)
router.get('/count', guard('records:read'), countCommentsForRecords);

// Papelera
router.get('/trash', guard('comments:create'), listTrashedComments);
router.post('/trash/empty', guard('comments:create'), emptyCommentTrash);
router.post('/trash/purge', guard('comments:create'), purgeCommentTrash);

// Operaciones puntuales
router.patch('/:commentId', guard('comments:create'), updateComment);
router.delete('/:commentId', guard('comments:create'), softDeleteComment);
router.post('/:commentId/restore', guard('comments:create'), restoreComment);
router.delete('/:commentId/permanent', guard('comments:create'), deleteCommentPermanent);

export default router;