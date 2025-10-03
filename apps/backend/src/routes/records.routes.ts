// apps/backend/src/routes/records.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
  listRecords,
  createRecord,
  patchRecord,
  deleteRecord,
  // NEW
  queryRecords,
  // trash
  listTrashedRecords,
  restoreRecord,
  deleteRecordPermanent,
  emptyRecordTrash,
  purgeRecordTrash,
} from '../controllers/records.controller.js';

// NEW: monta el subrouter de comentarios
import commentsRouter from './comments.routes.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

/* Records */
router.get('/', listRecords);                    // GET    /bases/:baseId/tables/:tableId/records
router.post('/', createRecord);                  // POST   /bases/:baseId/tables/:tableId/records
router.post('/query', queryRecords);             // POST   /bases/:baseId/tables/:tableId/records/query (filtros)
/* Importante: /query va antes de /:recordId para no colisionar. */

router.patch('/:recordId', patchRecord);         // PATCH  /bases/:baseId/tables/:tableId/records/:recordId
router.delete('/:recordId', deleteRecord);       // DELETE /bases/:baseId/tables/:tableId/records/:recordId (soft)

/* Papelera (records) */
router.get('/trash', listTrashedRecords);        // GET    /.../records/trash
router.post('/:recordId/restore', restoreRecord);// POST   /.../records/:recordId/restore
router.delete('/:recordId/permanent', deleteRecordPermanent); // DELETE permanente
router.post('/trash/empty', emptyRecordTrash);   // POST   /.../records/trash/empty
router.post('/trash/purge', purgeRecordTrash);   // POST   /.../records/trash/purge?days=30

/* Sub-CRUD de comentarios por fila (NO duplica endpoints aquí) */
router.use('/:recordId/comments', commentsRouter); // base: /.../records/:recordId/comments

export default router;