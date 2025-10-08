// -----------------------------------------------------------------------------
// Router de Auditoría
// - GET /api/bases/:baseId/audit → lista eventos (solo SYSADMIN u OWNER)
// -----------------------------------------------------------------------------
import { Router } from 'express';
import { listAuditEvents } from '../controllers/audit.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { guard } from '../permissions/guard.js';

const router = Router();

// Solo el OWNER de la base (y SYSADMIN por la regla global) pueden ver auditoría.
router.get('/bases/:baseId/audit', requireAuth, guard('schema:manage'), listAuditEvents);

export default router;