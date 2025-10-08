import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { guard } from '../permissions/guard.js';
import {
  // fields
  listFields,
  createField,
  updateField,
  deleteField,
  restoreField,
  deleteFieldPermanent,
  listTrashedFields,
  emptyFieldTrash,
  purgeFieldTrash,
  // options
  listOptions,
  listTrashedOptions,
  createOption,
  updateOption,
  reorderOptions,
  deleteOption,
  restoreOption,
  deleteOptionPermanent,
} from '../controllers/fields.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

/* FIELDS (dentro de una tabla) */
// Lectura del esquema: cualquiera que pueda ver la base
router.get('/',                        guard('base:view'),      listFields);

// Mutaciones de esquema: SOLO owner (o SYSADMIN)
router.post('/',                       guard('schema:manage'),  createField);
router.patch('/:fieldId',              guard('schema:manage'),  updateField);
router.delete('/:fieldId',             guard('schema:manage'),  deleteField);

router.post('/:fieldId/restore',       guard('schema:manage'),  restoreField);
router.delete('/:fieldId/permanent',   guard('schema:manage'),  deleteFieldPermanent);

router.get('/trash',                   guard('schema:manage'),  listTrashedFields);
router.post('/trash/empty',            guard('schema:manage'),  emptyFieldTrash);
router.post('/trash/purge',            guard('schema:manage'),  purgeFieldTrash);

/* OPTIONS (para fieldId) */
// Ver opciones: con ver la base alcanza
router.get('/:fieldId/options',                    guard('base:view'),     listOptions);
router.get('/:fieldId/options/trash',              guard('schema:manage'), listTrashedOptions);

// Mutaciones de opciones: SOLO owner (o SYSADMIN)
router.post('/:fieldId/options',                   guard('schema:manage'), createOption);
router.patch('/:fieldId/options/reorder',          guard('schema:manage'), reorderOptions);
router.patch('/:fieldId/options/:optionId',        guard('schema:manage'), updateOption);
router.delete('/:fieldId/options/:optionId',       guard('schema:manage'), deleteOption);
router.post('/:fieldId/options/:optionId/restore', guard('schema:manage'), restoreOption);
router.delete('/:fieldId/options/:optionId/permanent', guard('schema:manage'), deleteOptionPermanent);

export default router;