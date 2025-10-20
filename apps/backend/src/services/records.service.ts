// apps/backend/src/services/records.service.ts

import {
  emitRecordCreated,
  emitRecordUpdated,
  emitRecordTrashed,
  emitRecordRestored,
} from '../realtime/hub.js';
import { prisma, prismaDirect } from './db.js';
import { Prisma, FieldType } from '@prisma/client';
import { badRequest, notFound } from '../utils/errors.js';

/* ===================== INCLUDE TIPADO (¡clave para evitar los errores!) ===================== */
/**
 * Este include está “estrechado” con Prisma.validator para que TypeScript sepa que:
 * - En cada celda vienen: field { id, name }, updatedBy { id, fullName } y options [{ optionId }]
 * - En comentarios vienen: createdBy/updatedBy { id, fullName }
 */
const recordRowInclude = Prisma.validator<Prisma.RecordRowInclude>()({
  cells: {
    include: {
      field: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, fullName: true } },
      options: { select: { optionId: true } }, // MULTI_SELECT (join table)
    },
  },
  comments: {
    where: { isTrashed: false },
    orderBy: { updatedAt: 'desc' },
    take: 1,
    select: {
      id: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { id: true, fullName: true } },
      updatedBy: { select: { id: true, fullName: true } },
    },
  },
});
type RecordRowWithStuff = Prisma.RecordRowGetPayload<{ include: typeof recordRowInclude }>;

/* ===================== Tipos de ordenamiento ===================== */
type SortDir = 'asc' | 'desc';
type NullsPos = 'first' | 'last';
export type SortSpec = {
  kind: 'field';
  fieldId: number;
  dir: SortDir;
  nulls?: NullsPos; // default: "last"
};

/* ===================== HELPERS (baseId para RT) ===================== */
async function baseIdForTable(tableId: number) {
  const t = await prisma.tableDef.findUnique({
    where: { id: tableId },
    select: { baseId: true },
  });
  if (!t) throw notFound('Tabla no encontrada.');
  return t.baseId;
}

/* ===================== LIST ===================== */
/**
 * Devuelve registros de una tabla:
 * - records[].values: diccionario { fieldId: valor }
 * - records[].lastChange (opcional) con kind 'CELL' o 'COMMENT'
 */
export async function listRecordsSvc(
  _baseId: number,
  tableId: number,
  page: number,
  pageSize: number
) {
  const fields = await prisma.field.findMany({
    where: { tableId, isTrashed: false },
    select: { id: true, type: true, name: true },
  });
  const typeById = new Map(fields.map((f) => [f.id, f.type]));
  const nameById = new Map(fields.map((f) => [f.id, f.name]));
  const fieldIds = fields.map((f) => f.id);

  const [rows, total] = await Promise.all([
    prisma.recordRow.findMany({
      where: { tableId, isTrashed: false },
      include: recordRowInclude,
      orderBy: { id: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.recordRow.count({ where: { tableId, isTrashed: false } }),
  ]);

  const records = rows.map((r) => materializeRecord(r, fieldIds, typeById, nameById));
  return { total, records };
}

/* ===================== QUERY (con filtros estilo Airtable + MULTISORT) ===================== */

type LogicOp = 'AND' | 'OR';
type FilterCond = {
  kind: 'cond';
  fieldId: number;
  op: string;
  value?: any;
  values?: any[];
};
type FilterNode = FilterCond | { kind: 'group'; logic: LogicOp; filters: FilterNode[] };

/** Igual que listRecordsSvc, pero aplicando filtros tipo Airtable. Si pasas `sort`, ordena en cascada. */
export async function queryRecordsSvc(
  _baseId: number,
  tableId: number,
  group: FilterNode,
  page?: number,
  pageSize?: number,
  sort: SortSpec[] = []
) {
  const fields = await prisma.field.findMany({
    where: { tableId, isTrashed: false },
    select: { id: true, type: true, name: true },
  });
  const typeById = new Map(fields.map((f) => [f.id, f.type]));
  const nameById = new Map(fields.map((f) => [f.id, f.name]));
  const fieldIds = fields.map((f) => f.id);

  const whereFilters = buildRowWhereFromFilter(group, tableId, typeById);
  const baseWhere: Prisma.RecordRowWhereInput = {
    tableId,
    isTrashed: false,
    ...(whereFilters ?? {}),
  };

  const needInMemorySort = sort.length > 0;

  const [rows, total] = await Promise.all([
    prisma.recordRow.findMany({
      where: baseWhere,
      include: recordRowInclude,
      orderBy: { id: 'asc' }, // base determinista
      ...(needInMemorySort || !page || !pageSize
        ? {} // sin skip/take (traemos todo)
        : { skip: (page - 1) * pageSize, take: pageSize }),
    }),
    prisma.recordRow.count({ where: baseWhere }),
  ]);

  let records = rows.map((r) => materializeRecord(r, fieldIds, typeById, nameById));

  if (needInMemorySort) {
    // Preparamos órdenes de opciones para selects (id → posición)
    const selectFieldIds = Array.from(
      new Set(
        sort
          .filter((s) => s.kind === 'field')
          .map((s) => s.fieldId)
          .filter((fid) => {
            const t = typeById.get(fid);
            return t === 'SINGLE_SELECT' || t === 'MULTI_SELECT';
          })
      )
    );

    const optionOrderByField = new Map<number, Map<number, number>>();
    if (selectFieldIds.length) {
      const allOptions = await prisma.selectOption.findMany({
        where: { fieldId: { in: selectFieldIds }, isTrashed: false },
        orderBy: { id: 'asc' },
        select: { id: true, fieldId: true },
      });
      for (const fid of selectFieldIds) {
        const list = allOptions.filter((o) => o.fieldId === fid);
        const map = new Map<number, number>();
        list.forEach((o, i) => map.set(o.id, i));
        optionOrderByField.set(fid, map);
      }
    }

    // Orden estable en cascada (text/num/bool/date/time/select)
    records.sort((a, b) =>
      compareRecordsBySort(a, b, sort, typeById, optionOrderByField)
    );

    // Si nos pasaron paginación, la aplicamos después del sort
    if (page && pageSize) {
      const start = (page - 1) * pageSize;
      records = records.slice(start, start + pageSize);
    }
  }

  return { total, records };
}

/* ===================== CREATE / PATCH / DELETE ===================== */

export async function createRecordSvc(
  _baseId: number,
  tableId: number,
  values: Record<string, any> | undefined,
  userId: number | null
) {
  const baseId = await baseIdForTable(tableId);
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true } })
    : null;

  const rec = await prismaDirect.$transaction(async (tx) => {
    const r = await tx.recordRow.create({
      data: {
        tableId,
        createdById: userId ?? undefined,
        updatedById: userId ?? undefined,
      },
    });

    if (values && Object.keys(values).length) {
      await patchCellsTx(tx, tableId, r.id, values, userId);
      await tx.recordRow.update({
        where: { id: r.id },
        data: { updatedById: userId ?? undefined },
      });
    }
    return r;
  });

  // 🔊 Emit RT (sala por TABLA)
  emitRecordCreated(baseId, tableId, rec.id, {
    values: values ?? {},
    user,
    at: new Date().toISOString(),
  });

  return rec;
}

export async function patchRecordSvc(
  _baseId: number,
  tableId: number,
  recordId: number,
  values: Record<string, any>,
  userId: number | null
) {
  const exists = await prisma.recordRow.findFirst({
    where: { id: recordId, tableId, isTrashed: false },
    select: { id: true },
  });
  if (!exists) throw notFound('El registro no existe en esta tabla.');

  await prismaDirect.$transaction(async (tx) => {
    await patchCellsTx(tx, tableId, recordId, values, userId);
    await tx.recordRow.update({
      where: { id: recordId },
      data: { updatedById: userId ?? undefined },
    });
  });

  const baseId = await baseIdForTable(tableId);
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true } })
    : null;

  // 🔊 Emit RT — enviamos sólo el patch recibido
  emitRecordUpdated(baseId, tableId, recordId, {
    values,
    user,
    at: new Date().toISOString(),
  });
}

export async function deleteRecordSvc(
  _baseId: number,
  tableId: number,
  recordId: number,
  userId: number | null
) {
  const exists = await prisma.recordRow.findFirst({
    where: { id: recordId, tableId, isTrashed: false },
    select: { id: true },
  });
  if (!exists) throw notFound('El registro no existe en esta tabla.');

  await prisma.recordRow.update({
    where: { id: recordId },
    data: {
      isTrashed: true,
      trashedAt: new Date(),
      updatedById: userId ?? undefined,
    },
  });

  const baseId = await baseIdForTable(tableId);
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true } })
    : null;

  // 🔊 Emit RT
  emitRecordTrashed(baseId, tableId, recordId, { user });
}

/* ===================== HELPERS (materialización / lastChange) ===================== */

function materializeRecord(
  r: RecordRowWithStuff,
  fieldIds: number[],
  typeById: Map<number, FieldType>,
  nameById: Map<number, string>
) {
  const values: Record<string, any> = {};

  for (const c of r.cells) {
    const t = typeById.get(c.fieldId);
    let v: any = null;

    if (t === 'MULTI_SELECT') {
      v = (c.options ?? []).map((o) => o.optionId);
    } else if (t === 'SINGLE_SELECT') {
      v = c.selectOptionId ?? null;
    } else if (t === 'TIME') {
      v = c.timeMinutes ?? null;
    } else {
      v =
        c.stringValue ??
        c.numberValue ??
        c.boolValue ??
        c.dateValue ??
        c.datetimeValue ??
        null;
    }

    values[String(c.fieldId)] = v;
  }
  // Completa nulls donde no hay celda
  for (const fid of fieldIds) if (!(String(fid) in values)) values[String(fid)] = null;

  // lastChange: comparar última celda vs último comentario
  const latestCell =
    r.cells.length > 0 ? r.cells.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b)) : null;
  const latestComment = r.comments[0] ?? null;

  const cellAt = latestCell?.updatedAt ?? null;
  const commentAt = latestComment ? (latestComment.updatedAt ?? latestComment.createdAt) : null;

  let lastChange: any = null;
  if (commentAt && (!cellAt || commentAt > cellAt)) {
    lastChange = {
      kind: 'COMMENT' as const,
      commentId: latestComment.id,
      body: latestComment.body,
      user: latestComment.updatedBy ?? latestComment.createdBy ?? null,
      at: (latestComment.updatedAt ?? latestComment.createdAt).toISOString(),
    };
  } else if (cellAt && latestCell) {
    lastChange = {
      kind: 'CELL' as const,
      fieldId: latestCell.fieldId ?? null,
      fieldName: latestCell.field?.name ?? nameById.get(latestCell.fieldId) ?? null,
      user: latestCell.updatedBy ? { id: latestCell.updatedBy.id, fullName: latestCell.updatedBy.fullName } : null,
      at: latestCell.updatedAt.toISOString(),
    };
  }

  return { id: r.id, values, ...(lastChange ? { lastChange } : {}) };
}

/* ===================== ORDER HELPERS ===================== */

function compareRecordsBySort(
  a: { id: number; values: Record<string, any> },
  b: { id: number; values: Record<string, any> },
  sorts: SortSpec[],
  typeById: Map<number, FieldType>,
  optionOrderByField: Map<number, Map<number, number>>
) {
  for (const s of sorts) {
    if (s.kind !== 'field') continue;

    const t = typeById.get(s.fieldId);
    const dirMul = s.dir === 'desc' ? -1 : 1;
    const nulls = s.nulls ?? 'last';

    const av = a.values[String(s.fieldId)];
    const bv = b.values[String(s.fieldId)];

    // manejo de nulls
    const aNull = av == null;
    const bNull = bv == null;
    if (aNull || bNull) {
      if (aNull && bNull) continue;
      if (aNull) return nulls === 'first' ? -1 : 1;
      return nulls === 'first' ? 1 : -1;
    }

    let cmp = 0;
    switch (t) {
      case 'TEXT':
      case 'LONG_TEXT': {
        const as = String(av);
        const bs = String(bv);
        cmp = as.localeCompare(bs, undefined, { sensitivity: 'base' });
        break;
      }
      case 'NUMBER':
      case 'CURRENCY': {
        const na =
          (typeof av === 'object' && av && 'toNumber' in (av as any))
            ? (av as any).toNumber()
            : Number(av);
        const nb =
          (typeof bv === 'object' && bv && 'toNumber' in (bv as any))
            ? (bv as any).toNumber()
            : Number(bv);
        cmp = na < nb ? -1 : na > nb ? 1 : 0;
        break;
      }
      case 'CHECKBOX': {
        const na = av ? 1 : 0;
        const nb = bv ? 1 : 0;
        cmp = na - nb;
        break;
      }
      case 'DATE':
      case 'DATETIME': {
        const ta = av instanceof Date ? av.getTime() : new Date(av).getTime();
        const tb = bv instanceof Date ? bv.getTime() : new Date(bv).getTime();
        cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
        break;
      }
      case 'TIME': {
        const ta = Number(av);
        const tb = Number(bv);
        cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
        break;
      }
      case 'SINGLE_SELECT': {
        const map = optionOrderByField.get(s.fieldId) ?? new Map<number, number>();
        const pa = map.get(Number(av)) ?? Number.MAX_SAFE_INTEGER;
        const pb = map.get(Number(bv)) ?? Number.MAX_SAFE_INTEGER;
        cmp = pa < pb ? -1 : pa > pb ? 1 : 0;
        break;
      }
      case 'MULTI_SELECT': {
        const map = optionOrderByField.get(s.fieldId) ?? new Map<number, number>();
        const arrA: number[] = Array.isArray(av) ? av.map((id: any) => map.get(Number(id)) ?? Number.MAX_SAFE_INTEGER) : [];
        const arrB: number[] = Array.isArray(bv) ? bv.map((id: any) => map.get(Number(id)) ?? Number.MAX_SAFE_INTEGER) : [];
        const L = Math.max(arrA.length, arrB.length);
        for (let i = 0; i < L; i++) {
          const va = arrA[i] ?? Number.MAX_SAFE_INTEGER;
          const vb = arrB[i] ?? Number.MAX_SAFE_INTEGER;
          if (va === vb) continue;
          cmp = va < vb ? -1 : 1;
          break;
        }
        break;
      }
      default:
        cmp = 0;
    }

    if (cmp !== 0) return cmp * dirMul;
  }
  // desempate estable
  return a.id - b.id;
}

/* ===================== HELPERS (coerción / patch) ===================== */

function coerceValue(type: FieldType, raw: any) {
  if (raw == null) return null;

  switch (type) {
    case 'TEXT':
    case 'LONG_TEXT':
      return String(raw);

    case 'NUMBER':
    case 'CURRENCY': {
      const num = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      if (Number.isNaN(num)) throw badRequest('El valor debe ser numérico.');
      return new Prisma.Decimal(num);
    }

    case 'CHECKBOX': {
      if (typeof raw === 'boolean') return raw;
      const s = String(raw).toLowerCase().trim();
      if (['1', 'true', 'sí', 'si', 'on', 'y'].includes(s)) return true;
      if (['0', 'false', 'no', 'off', 'n'].includes(s)) return false;
      throw badRequest('El valor debe ser booleano.');
    }

    case 'DATE': {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw badRequest('Fecha inválida.');
      d.setHours(0, 0, 0, 0);
      return d;
    }

    case 'DATETIME': {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw badRequest('Fecha/hora inválida.');
      return d;
    }

    case 'TIME': {
      if (typeof raw === 'number') {
        const n = Math.trunc(raw);
        if (n < 0 || n > 1439) throw badRequest('TIME inválido (minutos 0..1439).');
        return n;
      }
      const s = String(raw).trim();
      const m = /^(\d{1,2}):(\d{2})$/.exec(s);
      if (!m) throw badRequest('TIME inválido. Usa "HH:mm" o minutos.');
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) throw badRequest('TIME inválido.');
      return hh * 60 + mm;
    }
  }
  return null;
}

async function patchCellsTx(
  tx: Prisma.TransactionClient,
  tableId: number,
  recordId: number,
  values: Record<string, any>,
  userId: number | null
) {
  const ids = Object.keys(values)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  if (!ids.length) return;

  // 1) Validar campos de esta tabla
  const fields = await tx.field.findMany({
    where: { tableId, id: { in: ids }, isTrashed: false },
    select: { id: true, type: true },
  });

  const foundIds = new Set(fields.map((f) => f.id));
  const missing = ids.filter((fid) => !foundIds.has(fid));
  if (missing.length) throw badRequest(`Campos inexistentes en esta tabla: ${missing.join(', ')}`);

  // 2) Procesar secuencialmente
  for (const f of fields) {
    const raw = values[String(f.id)];
    const baseData: any = {
      stringValue: null,
      numberValue: null,
      boolValue: null,
      dateValue: null,
      datetimeValue: null,
      timeMinutes: null,
      selectOptionId: null,
      updatedById: userId ?? undefined,
    };

    if (f.type === 'SINGLE_SELECT') {
      if (raw == null) {
        await upsertCell(tx, recordId, f.id, baseData, userId);
        continue;
      }
      const optId = Number(raw);
      if (!Number.isFinite(optId)) throw badRequest(`SINGLE_SELECT: optionId inválido para campo ${f.id}`);
      const ok = await tx.selectOption.findFirst({
        where: { id: optId, fieldId: f.id, isTrashed: false },
        select: { id: true },
      });
      if (!ok) throw badRequest(`SINGLE_SELECT: optionId ${optId} no pertenece al campo ${f.id}`);
      baseData.selectOptionId = optId;
      await upsertCell(tx, recordId, f.id, baseData, userId);
      continue;
    }

    if (f.type === 'MULTI_SELECT') {
      let list: number[] = [];
      if (raw == null) list = [];
      else if (Array.isArray(raw)) list = raw.map((n) => Number(n)).filter((n) => Number.isFinite(n));
      else throw badRequest(`MULTI_SELECT espera arreglo de optionIds en campo ${f.id}`);

      if (list.length) {
        const valid = await tx.selectOption.findMany({
          where: { id: { in: list }, fieldId: f.id, isTrashed: false },
          select: { id: true },
        });
        const validSet = new Set(valid.map((v) => v.id));
        const invalid = list.filter((id) => !validSet.has(id));
        if (invalid.length) throw badRequest(`MULTI_SELECT: optionIds inválidos para campo ${f.id}: ${invalid.join(', ')}`);
      }

      const cell = await upsertCell(tx, recordId, f.id, baseData, userId);

      const current = await tx.recordCellOption.findMany({
        where: { recordCellId: cell.id },
        select: { optionId: true },
        orderBy: { optionId: 'asc' },
      });
      const currentSet = new Set(current.map((c) => c.optionId));
      const desiredSet = new Set(list);

      for (const { optionId } of current) {
        if (!desiredSet.has(optionId)) {
          await tx.recordCellOption.delete({
            where: { recordCellId_optionId: { recordCellId: cell.id, optionId } },
          });
        }
      }
      for (const optionId of list) {
        if (!currentSet.has(optionId)) {
          await tx.recordCellOption.create({ data: { recordCellId: cell.id, optionId } });
        }
      }
      continue;
    }

    switch (f.type) {
      case 'TEXT':
      case 'LONG_TEXT':
        baseData.stringValue = coerceValue(f.type, raw) as string | null;
        break;
      case 'NUMBER':
      case 'CURRENCY':
        baseData.numberValue = coerceValue(f.type, raw) as Prisma.Decimal | null;
        break;
      case 'CHECKBOX':
        baseData.boolValue = coerceValue(f.type, raw) as boolean | null;
        break;
      case 'DATE':
        baseData.dateValue = coerceValue(f.type, raw) as Date | null;
        break;
      case 'DATETIME':
        baseData.datetimeValue = coerceValue(f.type, raw) as Date | null;
        break;
      case 'TIME':
        baseData.timeMinutes = coerceValue(f.type, raw) as number | null;
        break;
    }

    await upsertCell(tx, recordId, f.id, baseData, userId);
  }
}

async function upsertCell(
  tx: Prisma.TransactionClient,
  recordId: number,
  fieldId: number,
  data: any,
  userId: number | null
) {
  return tx.recordCell.upsert({
    where: { recordId_fieldId: { recordId, fieldId } },
    create: { recordId, fieldId, ...data, createdById: userId ?? undefined },
    update: data,
  });
}

/* ===================== TRASH (registros) ===================== */

export async function listTrashedRecordsForTableSvc(tableId: number) {
  return prisma.recordRow.findMany({
    where: { tableId, isTrashed: true },
    orderBy: { trashedAt: 'desc' },
  });
}

export async function restoreRecordSvc(tableId: number, recordId: number) {
  const row = await prisma.recordRow.findUnique({
    where: { id: recordId },
    select: { id: true, tableId: true, isTrashed: true },
  });
  if (!row || row.tableId !== tableId) throw notFound('Registro no encontrado.');
  if (!row.isTrashed) throw badRequest('El registro no está en papelera.');

  const updated = await prisma.recordRow.update({
    where: { id: recordId },
    data: { isTrashed: false, trashedAt: null },
  });

  const baseId = await baseIdForTable(tableId);
  // 🔊 Emit RT
  emitRecordRestored(baseId, tableId, recordId, {});

  return updated;
}

export async function deleteRecordPermanentSvc(tableId: number, recordId: number) {
  const row = await prisma.recordRow.findUnique({
    where: { id: recordId },
    select: { id: true, tableId: true, isTrashed: true },
  });
  if (!row || row.tableId !== tableId) throw notFound('Registro no encontrado.');
  if (!row.isTrashed) throw badRequest('El registro no está en papelera.');
  await prisma.recordRow.delete({ where: { id: recordId } });
}

export async function emptyRecordTrashForTableSvc(tableId: number) {
  await prisma.recordRow.deleteMany({ where: { tableId, isTrashed: true } });
}

export async function purgeTrashedRecordsOlderThanSvc(days = 30) {
  const threshold = new Date(Date.now() - days * 86_400_000);
  await prisma.recordRow.deleteMany({
    where: { isTrashed: true, trashedAt: { lte: threshold } },
  });
}

/* ===================== FILTER BUILDER (Airtable-like) ===================== */

function buildRowWhereFromFilter(
  node: FilterNode,
  _tableId: number,
  typeById: Map<number, FieldType>
): Prisma.RecordRowWhereInput | undefined {
  if (!node) return undefined;

  if (node.kind === 'group') {
    const parts = (node.filters || [])
      .map((child) => buildRowWhereFromFilter(child, _tableId, typeById))
      .filter(Boolean) as Prisma.RecordRowWhereInput[];
    if (!parts.length) return undefined;
    return node.logic === 'OR' ? { OR: parts } : { AND: parts };
  }

  const t = typeById.get(node.fieldId);
  if (!t) return { id: { equals: -1 } }; // campo inexistente -> condición imposible

  const fieldId = node.fieldId;
  const op = (node.op || '').toLowerCase();

  switch (t) {
    case 'TEXT':
    case 'LONG_TEXT':
      return textCond(fieldId, op, node.value);
    case 'NUMBER':
    case 'CURRENCY':
      return numberCond(fieldId, op, node.value, node.values);
    case 'CHECKBOX':
      return checkboxCond(fieldId, op);
    case 'DATE':
      return dateCond(fieldId, op, node.value, 'dateValue');
    case 'DATETIME':
      return dateCond(fieldId, op, node.value, 'datetimeValue');
    case 'TIME':
      return timeCond(fieldId, op, node.value, node.values);
    case 'SINGLE_SELECT':
      return singleSelectCond(fieldId, op, node.value);
    case 'MULTI_SELECT':
      return multiSelectCond(fieldId, op, node.values ?? node.value);
  }
}

/* ---- Operadores por tipo ---- */
function textCond(fieldId: number, op: string, value: any): Prisma.RecordRowWhereInput {
  if (op === 'contains') {
    return { cells: { some: { fieldId, stringValue: { contains: String(value ?? ''), mode: 'insensitive' } } } };
  }
  if (op === 'notcontains' || op === 'not_contains') {
    return { cells: { none: { fieldId, stringValue: { contains: String(value ?? ''), mode: 'insensitive' } } } };
  }
  if (op === 'eq' || op === 'is') {
    return { cells: { some: { fieldId, stringValue: { equals: String(value ?? ''), mode: 'insensitive' } } } };
  }
  if (op === 'neq' || op === 'isnot' || op === 'not') {
    return { cells: { none: { fieldId, stringValue: { equals: String(value ?? ''), mode: 'insensitive' } } } };
  }
  if (op === 'isempty' || op === 'is_empty') {
    return {
      OR: [
        { cells: { none: { fieldId } } },
        { cells: { some: { fieldId, OR: [{ stringValue: null }, { stringValue: '' }] } } },
      ],
    };
  }
  if (op === 'notempty' || op === 'not_empty') {
    return { cells: { some: { fieldId, AND: [{ stringValue: { not: null } }, { stringValue: { not: '' } }] } } };
  }
  // fallback
  return { cells: { some: { fieldId, stringValue: { contains: String(value ?? ''), mode: 'insensitive' } } } };
}

function numberCond(fieldId: number, op: string, value?: any, values?: any[]): Prisma.RecordRowWhereInput {
  const asDec = (v: any) => new Prisma.Decimal(typeof v === 'number' ? v : Number(v));
  if (op === 'eq') return { cells: { some: { fieldId, numberValue: { equals: asDec(value) } } } };
  if (op === 'neq') return { cells: { none: { fieldId, numberValue: { equals: asDec(value) } } } };
  if (op === 'gt') return { cells: { some: { fieldId, numberValue: { gt: asDec(value) } } } };
  if (op === 'gte') return { cells: { some: { fieldId, numberValue: { gte: asDec(value) } } } };
  if (op === 'lt') return { cells: { some: { fieldId, numberValue: { lt: asDec(value) } } } };
  if (op === 'lte') return { cells: { some: { fieldId, numberValue: { lte: asDec(value) } } } };
  if (op === 'between') {
    const [a, b] = (values ?? value ?? []) as any[];
    if (a == null || b == null) return { id: { equals: -1 } };
    return { cells: { some: { fieldId, numberValue: { gte: asDec(a), lte: asDec(b) } } } };
  }
  if (op === 'isempty') return { OR: [{ cells: { none: { fieldId } } }, { cells: { some: { fieldId, numberValue: null } } }] };
  if (op === 'notempty') return { cells: { some: { fieldId, numberValue: { not: null } } } };
  return { id: { not: undefined } };
}

function checkboxCond(fieldId: number, op: string): Prisma.RecordRowWhereInput {
  if (op === 'istrue' || op === 'true') return { cells: { some: { fieldId, boolValue: true } } };
  if (op === 'isfalse' || op === 'false') return { cells: { some: { fieldId, boolValue: false } } };
  if (op === 'isempty') return { OR: [{ cells: { none: { fieldId } } }, { cells: { some: { fieldId, boolValue: null } } }] };
  if (op === 'notempty') return { cells: { some: { fieldId, boolValue: { not: null } } } };
  return { id: { not: undefined } };
}

/* ---- Date/Datetime con rangos de día local ---- */
function dateCond(
  fieldId: number,
  op: string,
  value: any,
  column: 'dateValue' | 'datetimeValue'
): Prisma.RecordRowWhereInput {

  // Convierte un input a rango de día LOCAL [start, end)
  const asLocalDayRange = (input: any) => {
    // Si viene "YYYY-MM-DD", parsear como fecha LOCAL
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const [y, m, d] = input.split('-').map(Number);
      const start = new Date(y, m - 1, d, 0, 0, 0, 0); // medianoche local
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end };
    }
    // Si es Date/ISO, tomar el día local de ese timestamp
    const dt = new Date(input);
    if (Number.isNaN(dt.getTime())) return null;
    const start = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  };

  if (op === 'on') {
    const r = asLocalDayRange(value);
    if (!r) return { id: { equals: -1 } };
    return { cells: { some: { fieldId, [column]: { gte: r.start, lt: r.end } } } } as any;
  }

  if (op === 'before') {
    const r = asLocalDayRange(value);
    if (!r) return { id: { equals: -1 } };
    // "antes de la fecha": estrictamente antes del inicio de ese día local
    return { cells: { some: { fieldId, [column]: { lt: r.start } } } } as any;
  }

  if (op === 'after') {
    const r = asLocalDayRange(value);
    if (!r) return { id: { equals: -1 } };
    // "después de la fecha": a partir del fin de ese día local
    return { cells: { some: { fieldId, [column]: { gte: r.end } } } } as any;
  }

  if (op === 'between') {
    const arr = Array.isArray(value) ? value : [];
    const ra = asLocalDayRange(arr[0]);
    const rb = asLocalDayRange(arr[1]);
    if (!ra || !rb) return { id: { equals: -1 } };
    // Incluye ambos extremos de día: [startA, endB)
    return { cells: { some: { fieldId, [column]: { gte: ra.start, lt: rb.end } } } } as any;
  }

  if (op === 'isempty') {
    return {
      OR: [
        { cells: { none: { fieldId } } },
        { cells: { some: { fieldId, [column]: null } } },
      ],
    } as any;
  }

  if (op === 'notempty') {
    return { cells: { some: { fieldId, [column]: { not: null } } } } as any;
  }

  return { id: { not: undefined } };
}

function timeCond(fieldId: number, op: string, value?: any, values?: any[]): Prisma.RecordRowWhereInput {
  const asInt = (v: any) => (typeof v === 'number' ? Math.trunc(v) : Number(v));
  if (op === 'eq') return { cells: { some: { fieldId, timeMinutes: { equals: asInt(value) } } } };
  if (op === 'gt') return { cells: { some: { fieldId, timeMinutes: { gt: asInt(value) } } } };
  if (op === 'gte') return { cells: { some: { fieldId, timeMinutes: { gte: asInt(value) } } } };
  if (op === 'lt') return { cells: { some: { fieldId, timeMinutes: { lt: asInt(value) } } } };
  if (op === 'lte') return { cells: { some: { fieldId, timeMinutes: { lte: asInt(value) } } } };
  if (op === 'between') {
    const [a, b] = (values ?? value ?? []) as any[];
    if (a == null || b == null) return { id: { equals: -1 } };
    return { cells: { some: { fieldId, timeMinutes: { gte: asInt(a), lte: asInt(b) } } } };
  }
  if (op === 'isempty') return { OR: [{ cells: { none: { fieldId } } }, { cells: { some: { fieldId, timeMinutes: null } } }] };
  if (op === 'notempty') return { cells: { some: { fieldId, timeMinutes: { not: null } } } };
  return { id: { not: undefined } };
}

function singleSelectCond(fieldId: number, op: string, value?: any): Prisma.RecordRowWhereInput {
  const optId = Number(value);
  if (op === 'eq') return { cells: { some: { fieldId, selectOptionId: optId } } };
  if (op === 'neq') return { cells: { none: { fieldId, selectOptionId: optId } } };
  if (op === 'isempty') return { OR: [{ cells: { none: { fieldId } } }, { cells: { some: { fieldId, selectOptionId: null } } }] };
  if (op === 'notempty') return { cells: { some: { fieldId, selectOptionId: { not: null } } } };
  return { id: { not: undefined } };
}

function multiSelectCond(fieldId: number, op: string, raw?: any): Prisma.RecordRowWhereInput {
  const list: number[] = Array.isArray(raw) ? raw.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];
  if (op === 'includesany' || op === 'includes_any') {
    if (!list.length) return { id: { not: undefined } };
    return { cells: { some: { fieldId, options: { some: { optionId: { in: list } } } } } };
  }
  if (op === 'includesall' || op === 'includes_all') {
    if (!list.length) return { id: { not: undefined } };
    return {
      cells: {
        some: {
          fieldId,
          AND: list.map((optionId) => ({ options: { some: { optionId } } })),
        },
      },
    };
  }
  if (op === 'excludesany' || op === 'excludes_any') {
    if (!list.length) return { id: { not: undefined } };
    return { cells: { none: { fieldId, options: { some: { optionId: { in: list } } } } } };
  }
  if (op === 'isempty') {
    return { OR: [{ cells: { none: { fieldId } } }, { cells: { some: { fieldId, options: { none: {} } } } }] };
  }
  if (op === 'notempty') {
    return { cells: { some: { fieldId, options: { some: {} } } } };
  }
  return { id: { not: undefined } };
}

// === BOOTSTRAP (fields + options + records + commentCounts en una sola llamada) ===
export type BootstrapParams = {
  page?: number;
  pageSize?: number;
  logic?: 'AND' | 'OR';
  filters?: any[];         // mismo formato que queryRecords
  sort?: SortSpec[];
};

export async function bootstrapGridSvc(
  baseId: number,
  tableId: number,
  { page = 1, pageSize = 50, logic = 'AND', filters = [], sort = [] }: BootstrapParams
) {
  // 1) Fields + options embebidos (mínimos)
  const fields = await prisma.field.findMany({
    where: { tableId, isTrashed: false },
    orderBy: { position: 'asc' },
    select: {
      id: true, name: true, type: true, position: true,
      options: {
        where: { isTrashed: false },
        orderBy: { position: 'asc' },
        select: { id: true, label: true, color: true, position: true },
      },
    },
  });

  // 2) Records (reusa tu motor de filtros + sort)
  const group = { kind: 'group', logic, filters } as any;
  const { total, records } = await queryRecordsSvc(
    baseId,
    tableId,
    group,
    page,
    pageSize,
    sort
  );

  // 3) Conteo de comentarios solo para los records que vienen en página
  const ids = records.map(r => r.id);
  let commentCounts: Record<number, number> = {};
  if (ids.length) {
    const counts = await prisma.comment.groupBy({
      by: ['recordId'],
      where: { recordId: { in: ids }, isTrashed: false },
      _count: { recordId: true },
    });
    for (const c of counts) commentCounts[c.recordId] = c._count.recordId;
  }

  return { fields, total, records, commentCounts };
}