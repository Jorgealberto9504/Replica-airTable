// apps/backend/src/routes/records.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { guard } from '../permissions/guard.js'; // ⬅️ AÑADIR
import {
  listRecords,
  createRecord,
  patchRecord,
  deleteRecord,
  queryRecords,
  listTrashedRecords,
  restoreRecord,
  deleteRecordPermanent,
  emptyRecordTrash,
  purgeRecordTrash,
} from '../controllers/records.controller.js';

import commentsRouter from './comments.routes.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

/* Records */
router.get('/',            guard('records:read'),   listRecords);
router.post('/',           guard('records:create'), createRecord);
router.post('/query',      guard('records:read'),   queryRecords);

router.patch('/:recordId', guard('records:update'), patchRecord);
router.delete('/:recordId',guard('records:delete'), deleteRecord);

/* Papelera (records) */
router.get('/trash',                       guard('records:read'),   listTrashedRecords);
router.post('/:recordId/restore',          guard('records:delete'), restoreRecord);
router.delete('/:recordId/permanent',      guard('records:delete'), deleteRecordPermanent);
router.post('/trash/empty',                guard('records:delete'), emptyRecordTrash);
router.post('/trash/purge',                guard('records:delete'), purgeRecordTrash);

/* Sub-CRUD de comentarios por fila */
router.use('/:recordId/comments', commentsRouter);

export default router;