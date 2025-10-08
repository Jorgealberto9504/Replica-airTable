import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { guard } from '../permissions/guard.js';
import {
  listComments,
  createComment,
  updateComment,
  softDeleteComment,
  // trash
  listTrashedComments,
  restoreComment,
  deleteCommentPermanent,
  emptyCommentTrash,
  purgeCommentTrash,
} from '../controllers/comments.controller.js';

// Muy importante: mergeParams para heredar baseId/tableId/recordId del parent
const router = Router({ mergeParams: true });
router.use(requireAuth);

// Base absoluta (montado): /bases/:baseId/tables/:tableId/records/:recordId/comments

// Lectura de comentarios: quien pueda leer registros
router.get('/',                guard('records:read'),    listComments);

// Crear/editar/borrar/recuperar comentarios: COMMENTER+ (comments:create)
router.post('/',               guard('comments:create'),  createComment);

// Papelera (solo para quien puede comentar)
router.get('/trash',           guard('comments:create'),  listTrashedComments);
router.post('/trash/empty',    guard('comments:create'),  emptyCommentTrash);
router.post('/trash/purge',    guard('comments:create'),  purgeCommentTrash);

// Operar comentario puntual
router.patch('/:commentId',           guard('comments:create'), updateComment);
router.delete('/:commentId',          guard('comments:create'), softDeleteComment);
router.post('/:commentId/restore',    guard('comments:create'), restoreComment);
router.delete('/:commentId/permanent',guard('comments:create'), deleteCommentPermanent);

export default router;