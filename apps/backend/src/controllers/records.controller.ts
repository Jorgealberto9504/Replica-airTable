import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listRecordsSvc,
  createRecordSvc,
  patchRecordSvc,
  deleteRecordSvc,
  // filtros/orden
  queryRecordsSvc,
  // NUEVO bootstrap
  bootstrapGridSvc,
  // trash
  listTrashedRecordsForTableSvc,
  restoreRecordSvc,
  deleteRecordPermanentSvc,
  emptyRecordTrashForTableSvc,
  purgeTrashedRecordsOlderThanSvc,
} from '../services/records.service.js';
import { currentUserId } from '../utils/currentUser.js';

/** Diccionario dinámico { fieldId: any } */
const valuesSchema = z.object({}).catchall(z.any());

/** Query: soporta ?all=1 para traer todo (sin paginar) */
const listQuerySchema = z.object({
  all: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

const createRecordSchema = z.object({
  values: valuesSchema.default({}),
});

const patchRecordSchema = z.object({
  values: valuesSchema,
});

/* ========= Filtros (tipo Airtable) ========= */
type LogicOp = 'AND' | 'OR';

const filterCondSchema = z.object({
  kind: z.literal('cond'),
  fieldId: z.coerce.number().int().min(1),
  op: z.string().min(1),
  value: z.any().optional(),
  values: z.array(z.any()).optional(),
});
type FilterCond = z.infer<typeof filterCondSchema>;

type FilterNode = FilterCond | FilterGroup;
type FilterGroup = {
  kind: 'group';
  logic: LogicOp;
  filters: FilterNode[];
};

const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    filterCondSchema,
    z.object({
      kind: z.literal('group'),
      logic: z.enum(['AND', 'OR']),
      filters: z.array(filterNodeSchema).default([]),
    }),
  ])
);

/* ========= Sort (estilo Airtable) ========= */
const sortItemSchema = z.object({
  kind: z.literal('field'),
  fieldId: z.coerce.number().int().min(1),
  dir: z.enum(['asc', 'desc']),
  nulls: z.enum(['first', 'last']).optional(),
});

const queryBodySchema = z.object({
  all: z.coerce.boolean().optional().default(true),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
  logic: z.enum(['AND', 'OR']).optional().default('AND'),
  filters: z.array(filterNodeSchema).optional().default([]),
  sort: z.array(sortItemSchema).optional().default([]),
});

/* ========== CRUD RECORDS ========== */

export async function listRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const { all, page, pageSize } = listQuerySchema.parse(req.query);

    const effectivePage = all ? 1 : page;
    const effectiveSize = all ? 1_000_000 : pageSize;

    const { total, records } = await listRecordsSvc(
      baseId,
      tableId,
      effectivePage,
      effectiveSize
    );
    res.json({ ok: true, total, records });
  } catch (e) { next(e); }
}

export async function createRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const userId = currentUserId(req, res);
    const { values } = createRecordSchema.parse(req.body);

    const rec = await createRecordSvc(baseId, tableId, values, userId);
    res.json({ ok: true, record: { id: rec.id, values } });
  } catch (e) { next(e); }
}

export async function patchRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const recordId = Number(req.params.recordId);
    const userId = currentUserId(req, res);
    const { values } = patchRecordSchema.parse(req.body);

    await patchRecordSvc(baseId, tableId, recordId, values, userId);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function deleteRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const recordId = Number(req.params.recordId);
    const userId = currentUserId(req, res);

    await deleteRecordSvc(baseId, tableId, recordId, userId);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

/* ========== QUERY (filtros + orden) ========== */
export async function queryRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);

    const body = queryBodySchema.parse(req.body);
    const group: FilterGroup = { kind: 'group', logic: body.logic, filters: body.filters };

    const useAll = body.all ?? true;
    const page = useAll ? undefined : (body.page ?? 1);
    const pageSize = useAll ? undefined : (body.pageSize ?? 50);

    const { total, records } = await queryRecordsSvc(
      baseId,
      tableId,
      group,
      page,
      pageSize,
      body.sort
    );
    res.json({ ok: true, total, records });
  } catch (e) { next(e); }
}

/* ========== BOOTSTRAP (1 request: fields+options+records+counts) ========== */
export async function bootstrapGrid(req: Request, res: Response, next: NextFunction) {
  try {
    const baseId = Number(req.params.baseId);
    const tableId = Number(req.params.tableId);
    const body = queryBodySchema.parse(req.body);

    const out = await bootstrapGridSvc(baseId, tableId, {
      page: body.all ? 1 : (body.page ?? 1),
      pageSize: body.all ? 1_000_000 : (body.pageSize ?? 50),
      logic: body.logic,
      filters: body.filters,
      sort: body.sort,
    });

    res.json({ ok: true, ...out });
  } catch (e) { next(e); }
}

/* ========== Papelera (REGISTROS) ========== */

export async function listTrashedRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const tableId = Number(req.params.tableId);
    const rows = await listTrashedRecordsForTableSvc(tableId);
    res.json({ ok: true, records: rows });
  } catch (e) { next(e); }
}

export async function restoreRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const tableId = Number(req.params.tableId);
    const recordId = Number(req.params.recordId);
    await restoreRecordSvc(tableId, recordId);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function deleteRecordPermanent(req: Request, res: Response, next: NextFunction) {
  try {
    const tableId = Number(req.params.tableId);
    const recordId = Number(req.params.recordId);
    await deleteRecordPermanentSvc(tableId, recordId);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function emptyRecordTrash(req: Request, res: Response, next: NextFunction) {
  try {
    const tableId = Number(req.params.tableId);
    await emptyRecordTrashForTableSvc(tableId);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function purgeRecordTrash(req: Request, res: Response, next: NextFunction) {
  try {
    const days = Number(req.query.days ?? 30);
    await purgeTrashedRecordsOlderThanSvc(Number.isFinite(days) && days >= 0 ? days : 30);
    res.json({ ok: true, purgedAfterDays: Number.isFinite(days) ? days : 30 });
  } catch (e) { next(e); }
}