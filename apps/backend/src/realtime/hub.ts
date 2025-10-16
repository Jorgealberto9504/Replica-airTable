// apps/backend/src/realtime/hub.ts
import type { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import cookie from 'cookie';
import { verifyJwt } from '../services/security/jwt.service.js';

let _io: Server | null = null;

/** Permitir sólo tu frontend (y localhost en dev) */
function allowOrigin(origin?: string | null) {
  if (!origin) return true; // curl/postman
  const FRONTEND = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  return origin === FRONTEND || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

/** Inicializa Socket.IO una sola vez y lo acopla al server HTTP */
export function initRealtime(server: HTTPServer) {
  if (_io) return _io;

  _io = new Server(server, {
    cors: {
      origin: (origin, cb) => cb(null, allowOrigin(origin)),
      credentials: true,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  // Auth mínima por cookie (no bloquea la conexión si falla)
  _io.use((socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie ?? '');
      const cookieName = process.env.COOKIE_NAME ?? 'session';
      const token = cookies[cookieName];
      if (token) {
        const payload = verifyJwt<{ sub: string }>(token);
        (socket.data as any).userId = Number(payload.sub);
      }
      next();
    } catch {
      next(); // no rompemos la conexión
    }
  });

  // Helpers de rooms
  const roomRecord = (baseId: number, tableId: number, recordId: number) =>
    `base:${baseId}:table:${tableId}:rec:${recordId}`;

  _io.on('connection', (socket) => {
    const userId: number | undefined = (socket.data as any)?.userId;
    console.log('[realtime] conectado', socket.id, 'user=', userId);

    // Suscripción por record (para el panel de comentarios)
    socket.on('subscribe:record', ({ baseId, tableId, recordId }: { baseId: number; tableId: number; recordId: number }) => {
      socket.join(roomRecord(baseId, tableId, recordId));
    });

    socket.on('unsubscribe:record', ({ baseId, tableId, recordId }: { baseId: number; tableId: number; recordId: number }) => {
      socket.leave(roomRecord(baseId, tableId, recordId));
    });

    socket.on('disconnect', (reason) => {
      console.log('[realtime] disconnect', socket.id, reason);
    });
  });

  console.log('[realtime] Socket.IO listo (solo comentarios)');
  return _io;
}

/** Acceso interno */
function io(): Server | null {
  if (!_io) {
    console.warn('[realtime] emit omitido → IO no inicializado');
    return null;
  }
  return _io;
}

/** Eventos que el frontend escuchará */
const EV = {
  comments: {
    generic: 'comments:event', // (opcional) broadcast general
    created: 'comment.created',
    updated: 'comment.updated',
    trashed: 'comment.trashed',
  },
};

/** Emit: creado */
export function emitCommentCreated(
  baseId: number,
  tableId: number,
  recordId: number,
  payload: { commentId: number; at?: string; user?: { id: number; fullName?: string | null }; count?: number }
) {
  const s = io(); if (!s) return;
  const msg = { tableId, recordId, commentId: payload.commentId, at: payload.at, user: payload.user, count: payload.count };
  const room = `base:${baseId}:table:${tableId}:rec:${recordId}`;
  s.to(room).emit(EV.comments.created, msg);
  s.emit(EV.comments.generic, { ...msg, type: 'created' });
}

/** Emit: actualizado */
export function emitCommentUpdated(
  baseId: number,
  tableId: number,
  recordId: number,
  payload: { commentId: number; at?: string; user?: { id: number; fullName?: string | null }; count?: number }
) {
  const s = io(); if (!s) return;
  const msg = { tableId, recordId, commentId: payload.commentId, at: payload.at, user: payload.user, count: payload.count };
  const room = `base:${baseId}:table:${tableId}:rec:${recordId}`;
  s.to(room).emit(EV.comments.updated, msg);
  s.emit(EV.comments.generic, { ...msg, type: 'updated' });
}

/** Emit: eliminado (soft) */
export function emitCommentTrashed(
  baseId: number,
  tableId: number,
  recordId: number,
  payload: { commentId: number; at?: string; user?: { id: number; fullName?: string | null }; count?: number }
) {
  const s = io(); if (!s) return;
  const msg = { tableId, recordId, commentId: payload.commentId, at: payload.at, user: payload.user, count: payload.count };
  const room = `base:${baseId}:table:${tableId}:rec:${recordId}`;
  s.to(room).emit(EV.comments.trashed, msg);
  s.emit(EV.comments.generic, { ...msg, type: 'deleted' });
}