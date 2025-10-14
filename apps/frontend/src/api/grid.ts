import { postJSON } from './http';
import type { SortSpec } from './records'; // o duplica el tipo si aquí no existe

export type BootstrapGridReq = {
  all?: boolean;
  page?: number;
  pageSize?: number;
  logic?: 'AND' | 'OR';
  filters?: any[];
  sort?: SortSpec[];
};

export type BootstrapGridRes = {
  ok: true;
  fields: Array<{
    id: number;
    name: string;
    type: string;
    position: number;
    options?: Array<{ id: number; label: string; color?: string | null; position: number }>;
  }>;
  total: number;
  records: Array<{ id: number; values: Record<string, any>; lastChange?: any }>;
  commentCounts?: Record<number, number>;
};

export function bootstrapGrid(
  baseId: number,
  tableId: number,
  body: BootstrapGridReq,
  signal?: AbortSignal
) {
  return postJSON<BootstrapGridRes>(`/bases/${baseId}/tables/${tableId}/records/bootstrap`, body, { signal });
}