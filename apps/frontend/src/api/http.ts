// apps/frontend/src/api/http.ts
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export class HTTPError<T = any> extends Error {
  status: number;
  data?: T;
  constructor(status: number, message: string, data?: T) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function parseBody(res: Response): Promise<any> {
  // Lee como texto para soportar 204, texto plano y JSON
  const text = await res.text().catch(() => '');
  if (!text) return undefined;

  const ct = res.headers.get('content-type') || '';
  const isJSON = ct.toLowerCase().includes('application/json');

  if (isJSON) {
    try { return JSON.parse(text); } catch { /* cae a texto */ }
  }
  return text; // puede ser texto plano o HTML de error
}

function pickErrorMessage(data: any, fallback: string) {
  if (!data) return fallback;
  if (typeof data === 'string') return data || fallback;

  const cand =
    data.error ||
    data.message ||
    (Array.isArray(data.errors) ? (data.errors[0]?.message ?? data.errors[0]) : undefined);

  if (!cand) return fallback;
  return typeof cand === 'string' ? cand : JSON.stringify(cand);
}

async function handleRes<T>(res: Response): Promise<T> {
  const body = await parseBody(res);

  if (!res.ok) {
    const msg = pickErrorMessage(body, `${res.status} ${res.statusText}`);
    throw new HTTPError(res.status, msg, body);
  }

  // Si no hay cuerpo (204 No Content o vacío), devolvemos objeto vacío
  // para no romper los call sites que esperan JSON.
  return (body ?? ({} as any)) as T;
}

export async function getJSON<T>(
  path: string,
  opts?: { signal?: AbortSignal; headers?: Record<string, string> }
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: { ...(opts?.headers || {}) },
    signal: opts?.signal,
  });
  return handleRes<T>(res);
}

export async function postJSON<T>(
  path: string,
  body: unknown,
  opts?: { signal?: AbortSignal; headers?: Record<string, string> }
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
  return handleRes<T>(res);
}

export async function patchJSON<T>(
  path: string,
  body: unknown,
  opts?: { signal?: AbortSignal; headers?: Record<string, string> }
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
  return handleRes<T>(res);
}

export async function delJSON<T>(
  path: string,
  opts?: { signal?: AbortSignal; headers?: Record<string, string> }
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { ...(opts?.headers || {}) },
    signal: opts?.signal,
  });
  return handleRes<T>(res);
}