import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listFieldsSvc,
  createFieldSvc,
  updateFieldSvc,
  deleteFieldSvc,
  restoreFieldSvc,
  deleteFieldPermanentSvc,
  listTrashedFieldsForTableSvc,
  emptyFieldTrashForTableSvc,
  purgeTrashedFieldsOlderThanSvc,
  // options
  listOptionsSvc,
  listTrashedOptionsSvc,
  createOptionSvc,
  updateOptionSvc,
  reorderOptionsSvc,
  deleteOptionSvc,
  restoreOptionSvc,
  deleteOptionPermanentSvc,
} from '../services/fields.service.js';
import { currentUserId } from '../utils/currentUser.js';

// Auditoría
import { logAudit } from '../services/audit.service.js';
import { AuditAction, FieldType } from '@prisma/client';
import { prisma } from '../services/db.js';

// 🔴 Realtime
import {
  emitFieldCreated,
  emitFieldUpdated,
  emitFieldTrashed,
  emitFieldRestored,
  emitFieldOptionsChanged,
} from '../realtime/hub.js';

const FieldTypeSchema = z.enum([
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'CURRENCY',
  'CHECKBOX',
  'DATE',
  'DATETIME',
  'TIME',
  'SINGLE_SELECT',
  'MULTI_SELECT',
]);

const createFieldSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  type: FieldTypeSchema,
  options: z
    .array(z.object({ label: z.string().min(1), color: z.string().nullable().optional() }))
    .optional(),
});

const updateFieldSchema = z.object({
  name: z.string().min(1).optional(),
  type: FieldTypeSchema.optional(),
  position: z.number().int().min(0).optional(),
  // Opcionalmente puedes permitir options aquí si quieres reemplazo completo desde controller:
  // options: z.array(z.object({ label: z.string().min(1), color: z.string().nullable().optional() })).optional(),
});

const createOptionSchema = z.object({
  label: z.string().min(1),
  color: z.string().nullable().optional(),
});
const updateOptionSchema = z.object({
  label: z.string().min(1).optional(),
  color: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
});
const reorderSchema = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1),
});

/* ============== FIELDS ============== */

export async function listFields(req: Request, res: Response, next: NextFunction) {
  try {
    const tableId = Number(req.params.tableId);
    const fields = await listFieldsSvc(tableId);
    res.json({ ok: true, fields });
  } catch (e) { next(e); }
}

export async function createField(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const userId = currentUserId(req, res);
    const input = createFieldSchema.parse(req.body);

    const field = await createFieldSvc(tableId, input, userId);
    if (!field) return res.status(500).json({ ok: false, error: 'No se pudo crear la columna' });

    // RT
    emitFieldCreated(baseId, tableId, field);

    // Auditoría de creación (best-effort)
    try {
      const base = await prisma.tableDef.findUnique({
        where: { id: tableId },
        select: { baseId: true },
      });
      if (base) {
        await logAudit(undefined, {
          userId,
          ip: req.ip,
          baseId: base.baseId,
          tableId,
          fieldId: field.id,
          action: AuditAction.FIELD_CREATED,
          summary: `Creó la columna "${field.name}"`,
          details: { name: field.name, type: field.type as FieldType, position: field.position },
        });
      }
    } catch { /* no bloquear */ }

    res.json({ ok: true, field });
  } catch (e) { next(e); }
}

export async function updateField(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const fieldId = Number(req.params.fieldId);
    const userId = currentUserId(req, res);
    const patch = updateFieldSchema.parse(req.body);

    // Snapshot previo (para auditoría)
    const before = await prisma.field.findFirst({
      where: { id: fieldId, tableId, isTrashed: false },
      select: {
        id: true,
        name: true,
        type: true,
        position: true,
        table: { select: { baseId: true } },
      },
    });

    const field = await updateFieldSvc(tableId, fieldId, patch, userId);
    if (!field) {
      return res.status(500).json({ ok: false, error: 'No se pudo cargar la columna actualizada' });
    }

    // RT (campo)
    emitFieldUpdated(baseId, tableId, field);

    // RT (opciones) — si el tipo es SELECT y el servicio devolvió opciones activas
    if (Array.isArray(field.options)) {
      emitFieldOptionsChanged(
        baseId,
        tableId,
        fieldId,
        field.options.map(o => ({
          id: o.id, label: o.label, color: o.color ?? null, position: o.position,
        }))
      );
    }

    // Auditoría detallada
    if (before && before.table) {
      const changes: Record<string, { from: any; to: any }> = {};
      const parts: string[] = [];

      if (patch.name !== undefined && field.name !== before.name) {
        changes.name = { from: before.name, to: field.name };
        parts.push(`nombre "${before.name}" → "${field.name}"`);
      }
      if (patch.type !== undefined && field.type !== before.type) {
        changes.type = { from: before.type, to: field.type };
        parts.push(`tipo ${before.type} → ${field.type}`);
      }
      if (patch.position !== undefined && field.position !== before.position) {
        changes.position = { from: before.position, to: field.position };
        parts.push(`posición ${before.position} → ${field.position}`);
      }

      if (Object.keys(changes).length > 0) {
        await logAudit(undefined, {
          userId,
          ip: req.ip,
          baseId: before.table.baseId,
          tableId,
          fieldId,
          action: AuditAction.FIELD_UPDATED,
          summary: `Actualizó columna ${parts.join(', ')}`,
          details: { changes },
        });
      }
    }

    res.json({ ok: true, field });
  } catch (e) { next(e); }
}

export async function deleteField(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const fieldId = Number(req.params.fieldId);
    const userId = currentUserId(req, res);

    // snapshot para auditoría
    const snap = await prisma.field.findFirst({
      where: { id: fieldId, tableId, isTrashed: false },
      select: { id: true, name: true, table: { select: { baseId: true } } },
    });

    await deleteFieldSvc(tableId, fieldId, userId);

    // RT
    emitFieldTrashed(baseId, tableId, fieldId);

    if (snap?.table) {
      await logAudit(undefined, {
        userId,
        ip: req.ip,
        baseId: snap.table.baseId,
        tableId,
        fieldId,
        action: AuditAction.FIELD_TRASHED,
        summary: `Envió a papelera la columna "${snap.name}"`,
        details: { name: snap.name },
      });
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function restoreField(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const fieldId = Number(req.params.fieldId);

    const before = await prisma.field.findUnique({
      where: { id: fieldId },
      select: { name: true, table: { select: { baseId: true } } },
    });

    const field = await restoreFieldSvc(tableId, fieldId);

    // RT
    emitFieldRestored(baseId, tableId, field);

    if (before?.table) {
      await logAudit(undefined, {
        userId: currentUserId(req, res),
        ip: req.ip,
        baseId: before.table.baseId,
        tableId,
        fieldId,
        action: AuditAction.FIELD_RESTORED,
        summary: `Restauró la columna "${field.name}"`,
        details: { name: field.name, position: field.position },
      });
    }

    res.json({ ok: true, field });
  } catch (e) { next(e); }
}

export async function deleteFieldPermanent(req: Request, res: Response, next: NextFunction) {
  try {
    const tableId = Number(req.params.tableId);
    const fieldId = Number(req.params.fieldId);
    await deleteFieldPermanentSvc(tableId, fieldId);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function listTrashedFields(req: Request, res: Response, next: NextFunction) {
  try {
    const tableId = Number(req.params.tableId);
    const fields = await listTrashedFieldsForTableSvc(tableId);
    res.json({ ok: true, fields });
  } catch (e) { next(e); }
}

export async function emptyFieldTrash(req: Request, res: Response, next: NextFunction) {
  try {
    const tableId = Number(req.params.tableId);
    await emptyFieldTrashForTableSvc(tableId);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function purgeFieldTrash(req: Request, res: Response, next: NextFunction) {
  try {
    const days = Number(req.query.days ?? 30);
    await purgeTrashedFieldsOlderThanSvc(Number.isFinite(days) && days >= 0 ? days : 30);
    res.json({ ok: true, purgedAfterDays: Number.isFinite(days) ? days : 30 });
  } catch (e) { next(e); }
}

/* ============== OPTIONS ============== */

export async function listOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const fieldId = Number(req.params.fieldId);
    const rows = await listOptionsSvc(fieldId);
    res.json({ ok: true, options: rows });
  } catch (e) { next(e); }
}
export async function listTrashedOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const fieldId = Number(req.params.fieldId);
    const rows = await listTrashedOptionsSvc(fieldId);
    res.json({ ok: true, options: rows });
  } catch (e) { next(e); }
}

export async function createOption(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const fieldId = Number(req.params.fieldId);
    const input = createOptionSchema.parse(req.body);

    const row = await createOptionSvc(fieldId, input);

    // RT: enviar el snapshot completo de opciones activas
    const options = await listOptionsSvc(fieldId);
    emitFieldOptionsChanged(baseId, tableId, fieldId, options);

    res.json({ ok: true, option: row });
  } catch (e) { next(e); }
}

export async function updateOption(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const fieldId = Number(req.params.fieldId);
    const optionId = Number(req.params.optionId);
    const patch = updateOptionSchema.parse(req.body);

    const row = await updateOptionSvc(fieldId, optionId, patch);

    const options = await listOptionsSvc(fieldId);
    emitFieldOptionsChanged(baseId, tableId, fieldId, options);

    res.json({ ok: true, option: row });
  } catch (e) { next(e); }
}

export async function reorderOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const fieldId = Number(req.params.fieldId);
    const { orderedIds } = reorderSchema.parse(req.body);

    await reorderOptionsSvc(fieldId, orderedIds);

    const options = await listOptionsSvc(fieldId);
    emitFieldOptionsChanged(baseId, tableId, fieldId, options);

    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function deleteOption(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const fieldId = Number(req.params.fieldId);
    const optionId = Number(req.params.optionId);

    await deleteOptionSvc(fieldId, optionId);

    const options = await listOptionsSvc(fieldId);
    emitFieldOptionsChanged(baseId, tableId, fieldId, options);

    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function restoreOption(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const fieldId = Number(req.params.fieldId);
    const optionId = Number(req.params.optionId);

    const row = await restoreOptionSvc(fieldId, optionId);

    const options = await listOptionsSvc(fieldId);
    emitFieldOptionsChanged(baseId, tableId, fieldId, options);

    res.json({ ok: true, option: row });
  } catch (e) { next(e); }
}

export async function deleteOptionPermanent(req: Request, res: Response, next: NextFunction) {
  try {
    const fieldId = Number(req.params.fieldId);
    const optionId = Number(req.params.optionId);
    await deleteOptionPermanentSvc(fieldId, optionId);
    // No es necesario emitir aquí (ya estaba en papelera).
    res.json({ ok: true });
  } catch (e) { next(e); }
}