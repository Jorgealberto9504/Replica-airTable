// apps/frontend/src/api/records.ts
import { API_URL } from './http';

export type SortSpec = { kind: 'field'; fieldId: number; dir: 'asc' | 'desc'; nulls?: 'first' | 'last' };

export async function queryRecords(
  baseId: number,
  tableId: number,
  params: {
    page?: number;
    pageSize?: number;
    filters?: any[];
    logic?: 'AND' | 'OR';
    sort?: SortSpec[];
    all?: boolean;
  } = {}
) {
  const body = {
    all: params.all ?? false,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
    logic: params.logic ?? 'AND',
    filters: params.filters ?? [],
    sort: params.sort ?? [],
  };
  const res = await fetch(`${API_URL}/bases/${baseId}/tables/${tableId}/records/query`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json as { ok: boolean; total: number; records: Array<{ id: number; values: Record<string, any> }> };
}

export async function createRecord(baseId: number, tableId: number, values: Record<string, any> = {}) {
  const res = await fetch(`${API_URL}/bases/${baseId}/tables/${tableId}/records`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json as { ok: boolean; record: { id: number; values: Record<string, any> } };
}

export async function patchRecord(
  baseId: number,
  tableId: number,
  recordId: number,
  values: Record<string, any>
) {
  const res = await fetch(`${API_URL}/bases/${baseId}/tables/${tableId}/records/${recordId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json as { ok: boolean };
}

export async function deleteRecord(baseId: number, tableId: number, recordId: number) {
  const res = await fetch(`${API_URL}/bases/${baseId}/tables/${tableId}/records/${recordId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json as { ok: boolean };
}