import { getJSON, postJSON, API_URL } from './http';

export type FieldType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'CURRENCY'
  | 'CHECKBOX'
  | 'DATE'
  | 'DATETIME'
  | 'TIME'
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT';

/** Opción de un SELECT almacenada en BD */
export type SelectOption = {
  id: number;
  label: string;
  color: string | null;
  position: number;
};

/** Payload para crear/actualizar opciones */
export type OptionInput = {
  label: string;
  color?: string | null;
};

export type Field = {
  id: number;
  tableId: number;
  name: string;
  type: FieldType;
  position: number;
  /** Opciones cargadas para SINGLE/MULTI_SELECT */
  options?: SelectOption[];
};

export async function listFields(baseId: number, tableId: number) {
  return getJSON<{ ok: boolean; fields: Field[] }>(
    `/bases/${baseId}/tables/${tableId}/fields`
  );
}

export async function createField(
  baseId: number,
  tableId: number,
  input: { name: string; type: FieldType; options?: OptionInput[] }
) {
  return postJSON<{ ok: boolean; field: Field }>(
    `/bases/${baseId}/tables/${tableId}/fields`,
    input
  );
}

export async function updateField(
  baseId: number,
  tableId: number,
  fieldId: number,
  patch: Partial<{
    name: string;
    type: FieldType;
    position: number;
    options: OptionInput[];
  }>
) {
  const res = await fetch(`${API_URL}/bases/${baseId}/tables/${tableId}/fields/${fieldId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
  return body as { ok: boolean; field: Field };
}

export async function deleteField(baseId: number, tableId: number, fieldId: number) {
  const res = await fetch(`${API_URL}/bases/${baseId}/tables/${tableId}/fields/${fieldId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
  return body as { ok: boolean };
}

/* ===== OPTIONS (para SINGLE/MULTI_SELECT) ===== */
export async function listOptions(baseId: number, tableId: number, fieldId: number) {
  return getJSON<{ ok: boolean; options: SelectOption[] }>(
    `/bases/${baseId}/tables/${tableId}/fields/${fieldId}/options`
  );
}