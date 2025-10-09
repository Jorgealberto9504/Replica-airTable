import { getJSON, postJSON, patchJSON, delJSON, API_URL } from './http';

export type CommentUser = { id: number; fullName: string };
export type Comment = {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: CommentUser | null;
  updatedBy?: CommentUser | null;
};

/* =========================
   CRUD de comentarios
   ========================= */
export async function listComments(
  baseId: number,
  tableId: number,
  recordId: number,
  page = 1,
  pageSize = 200
) {
  return getJSON<{ ok: true; total: number; comments: Comment[] }>(
    `/bases/${baseId}/tables/${tableId}/records/${recordId}/comments?page=${page}&pageSize=${pageSize}`
  );
}

export async function createComment(
  baseId: number,
  tableId: number,
  recordId: number,
  body: string
) {
  return postJSON<{ ok: true; comment: Comment }>(
    `/bases/${baseId}/tables/${tableId}/records/${recordId}/comments`,
    { body }
  );
}

export async function updateComment(
  baseId: number,
  tableId: number,
  recordId: number,
  commentId: number,
  body: string
) {
  return patchJSON<{ ok: true }>(
    `/bases/${baseId}/tables/${tableId}/records/${recordId}/comments/${commentId}`,
    { body }
  );
}

export async function deleteComment(
  baseId: number,
  tableId: number,
  recordId: number,
  commentId: number
) {
  return delJSON<{ ok: true }>(
    `/bases/${baseId}/tables/${tableId}/records/${recordId}/comments/${commentId}`
  );
}

/* =========================
   Conteo de comentarios optimizado (nuevo endpoint)
   ========================= */

/**
 * Obtiene el número de comentarios por recordId en una sola petición HTTP.
 * Si el backend aún no tiene soporte para esta ruta, hace fallback automático
 * al modo anterior (una petición por fila).
 */
export async function countCommentsForRecords(
  baseId: number,
  tableId: number,
  recordIds: number[]
): Promise<Record<number, number>> {
  if (!recordIds.length) return {};

  try {
    // ⚡ NUEVO: consulta batch optimizada
    const query = recordIds.join(',');
    const res = await fetch(
      `${API_URL}/bases/${baseId}/tables/${tableId}/comments/count?ids=${encodeURIComponent(query)}`,
      { credentials: 'include' }
    );

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json?.error || 'Error al contar comentarios');
    return json.counts ?? {};
  } catch (err) {
    console.warn('[comments] Endpoint /count no disponible, usando fallback lento');
    // Fallback al método anterior (una llamada por fila)
    const out: Record<number, number> = {};
    await Promise.all(
      recordIds.map(async (rid) => {
        try {
          const r = await listComments(baseId, tableId, rid, 1, 1);
          out[rid] = r.total ?? 0;
        } catch {
          out[rid] = 0;
        }
      })
    );
    return out;
  }
}