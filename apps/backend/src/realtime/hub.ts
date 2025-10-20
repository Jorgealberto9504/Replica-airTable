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

/* ========= helpers de rooms ========= */
const roomRecord = (baseId: number, tableId: number, recordId: number) =>
  `base:${baseId}:table:${tableId}:rec:${recordId}`;
const roomTable = (baseId: number, tableId: number) =>
  `base:${baseId}:table:${tableId}`;

function parseTableRoom(room: string) {
  // base:1:table:2  -> { baseId:1, tableId:2 }
  const m = room.match(/^base:(\d+):table:(\d+)$/);
  if (!m) return null;
  return { baseId: Number(m[1]), tableId: Number(m[2]) };
}

/* ========= PRESENCE por tabla =========
   presenceByRoom: room -> (socketId -> { id, fullName? })
   Guardamos por socket para manejar desconexiones/tab duplicadas.
======================================= */
type PresenceUser = { id: number; fullName?: string | null };
const presenceByRoom = new Map<string, Map<string, PresenceUser>>();

function broadcastPresence(room: string) {
  const io = _io; if (!io) return;
  const bag = presenceByRoom.get(room);
  const meta = parseTableRoom(room);
  if (!bag || !meta) return;
  // De-dup por userId (varias pestañas del mismo user)
  const seen = new Set<number>();
  const users: PresenceUser[] = [];
  for (const u of bag.values()) {
    if (u?.id == null) continue;
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    users.push({ id: u.id, fullName: u.fullName ?? null });
  }
  io.to(room).emit('presence:users', {
    baseId: meta.baseId,
    tableId: meta.tableId,
    users,
    count: users.length,
  });
}

function addPresence(room: string, socketId: string, user: PresenceUser | null | undefined) {
  let bag = presenceByRoom.get(room);
  if (!bag) { bag = new Map(); presenceByRoom.set(room, bag); }
  if (user?.id != null) {
    bag.set(socketId, { id: user.id, fullName: user.fullName ?? null });
    broadcastPresence(room);
  }
}
function removePresence(room: string, socketId: string) {
  const bag = presenceByRoom.get(room);
  if (!bag) return;
  bag.delete(socketId);
  if (bag.size === 0) presenceByRoom.delete(room);
  broadcastPresence(room);
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
        const payload = verifyJwt<{ sub: string; name?: string }>(token);
        (socket.data as any).userId = Number(payload.sub);
        (socket.data as any).fullName = (payload as any)?.name ?? null;
      }
      next();
    } catch {
      next(); // no rompemos la conexión
    }
  });

  _io.on('connection', (socket) => {
    const userId: number | undefined = (socket.data as any)?.userId;
    const fullName: string | null | undefined = (socket.data as any)?.fullName ?? null;
    console.log('[realtime] conectado', socket.id, 'user=', userId);

    // para limpiar presence al desconectar
    const joinedTableRooms = new Set<string>();
    (socket.data as any).joinedTableRooms = joinedTableRooms;

    // === Suscripciones puntuales por RECORD (para comentarios) ===
    socket.on('subscribe:record', ({ baseId, tableId, recordId }: { baseId: number; tableId: number; recordId: number }) => {
      socket.join(roomRecord(baseId, tableId, recordId));
    });
    socket.on('unsubscribe:record', ({ baseId, tableId, recordId }: { baseId: number; tableId: number; recordId: number }) => {
      socket.leave(roomRecord(baseId, tableId, recordId));
    });

    // === Suscripción por TABLA (grid) + PRESENCE ===
    socket.on('subscribe:table', (p: { baseId: number; tableId: number; user?: { id: number; fullName?: string | null } }) => {
      const room = roomTable(p.baseId, p.tableId);
      socket.join(room);
      joinedTableRooms.add(room);
      const effective: PresenceUser | null =
        p?.user?.id ? { id: p.user.id, fullName: p.user.fullName ?? null } :
        (userId ? { id: userId, fullName: fullName ?? null } : null);
      addPresence(room, socket.id, effective);
    });

    socket.on('unsubscribe:table', ({ baseId, tableId }: { baseId: number; tableId: number }) => {
      const room = roomTable(baseId, tableId);
      socket.leave(room);
      joinedTableRooms.delete(room);
      removePresence(room, socket.id);
    });

    socket.on('disconnect', (reason) => {
      // Limpiar presence en todas las tablas que se unió
      for (const room of joinedTableRooms) {
        removePresence(room, socket.id);
      }
      console.log('[realtime] disconnect', socket.id, reason);
    });
  });

  console.log('[realtime] Socket.IO listo (comentarios + grid + presence)');
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
    generic: 'comments:event',
    created: 'comment.created',
    updated: 'comment.updated',
    trashed:  'comment.trashed',
  },
  records: {
    generic: 'records:event',
    created: 'record.created',
    updated: 'record.updated',
    trashed:  'record.trashed',
    restored: 'record.restored',
  },
  fields: {
    created: 'field.created',
    updated: 'field.updated',
    trashed:  'field.trashed',
    restored: 'field.restored',
    optionsChanged: 'field.options.changed',
  },
};

/* =========================
   EMISORES — Comentarios
   ========================= */
export function emitCommentCreated(
  baseId: number,
  tableId: number,
  recordId: number,
  payload: { commentId: number; at?: string; user?: { id: number; fullName?: string | null }; count?: number }
) {
  const s = io(); if (!s) return;
  const msg = { tableId, recordId, commentId: payload.commentId, at: payload.at, user: payload.user, count: payload.count };
  const room = roomRecord(baseId, tableId, recordId);
  s.to(room).emit(EV.comments.created, msg);
  s.emit(EV.comments.generic, { ...msg, type: 'created' });
}
export function emitCommentUpdated(
  baseId: number,
  tableId: number,
  recordId: number,
  payload: { commentId: number; at?: string; user?: { id: number; fullName?: string | null }; count?: number }
) {
  const s = io(); if (!s) return;
  const msg = { tableId, recordId, commentId: payload.commentId, at: payload.at, user: payload.user, count: payload.count };
  const room = roomRecord(baseId, tableId, recordId);
  s.to(room).emit(EV.comments.updated, msg);
  s.emit(EV.comments.generic, { ...msg, type: 'updated' });
}
export function emitCommentTrashed(
  baseId: number,
  tableId: number,
  recordId: number,
  payload: { commentId: number; at?: string; user?: { id: number; fullName?: string | null }; count?: number }
) {
  const s = io(); if (!s) return;
  const msg = { tableId, recordId, commentId: payload.commentId, at: payload.at, user: payload.user, count: payload.count };
  const room = roomRecord(baseId, tableId, recordId);
  s.to(room).emit(EV.comments.trashed, msg);
  s.emit(EV.comments.generic, { ...msg, type: 'trashed' });
}

/* =========================
   EMISORES — Records (grid)
   ========================= */
type RTUser = { id: number; fullName?: string | null } | null | undefined;

export function emitRecordCreated(
  baseId: number,
  tableId: number,
  recordId: number,
  payload: { values?: Record<string, any>; at?: string; user?: RTUser }
) {
  const s = io(); if (!s) return;
  const msg = {
    tableId, recordId,
    values: payload.values ?? {},
    at: payload.at ?? new Date().toISOString(),
    user: payload.user ?? null,
  };
  const room = roomTable(baseId, tableId);
  s.to(room).emit(EV.records.created, msg);
  s.emit(EV.records.generic, { ...msg, type: 'created' });
}

export function emitRecordUpdated(
  baseId: number,
  tableId: number,
  recordId: number,
  payload: { values: Record<string, any>; at?: string; user?: RTUser }
) {
  const s = io(); if (!s) return;
  const msg = {
    tableId, recordId,
    values: payload.values ?? {},
    at: payload.at ?? new Date().toISOString(),
    user: payload.user ?? null,
  };
  const room = roomTable(baseId, tableId);
  s.to(room).emit(EV.records.updated, msg);
  s.emit(EV.records.generic, { ...msg, type: 'updated' });
}

export function emitRecordTrashed(
  baseId: number,
  tableId: number,
  recordId: number,
  payload?: { at?: string; user?: RTUser }
) {
  const s = io(); if (!s) return;
  const msg = {
    tableId, recordId,
    at: payload?.at ?? new Date().toISOString(),
    user: payload?.user ?? null,
  };
  const room = roomTable(baseId, tableId);
  s.to(room).emit(EV.records.trashed, msg);
  s.emit(EV.records.generic, { ...msg, type: 'trashed' });
}

export function emitRecordRestored(
  baseId: number,
  tableId: number,
  recordId: number,
  payload?: { at?: string; user?: RTUser }
) {
  const s = io(); if (!s) return;
  const msg = {
    tableId, recordId,
    at: payload?.at ?? new Date().toISOString(),
    user: payload?.user ?? null,
  };
  const room = roomTable(baseId, tableId);
  s.to(room).emit(EV.records.restored, msg);
  s.emit(EV.records.generic, { ...msg, type: 'restored' });
}

/* =========================
   EMISORES — Fields
   ========================= */
export function emitFieldCreated(baseId: number, tableId: number, field: any) {
  const s = io(); if (!s) return;
  s.to(roomTable(baseId, tableId)).emit(EV.fields.created, { tableId, field });
}
export function emitFieldUpdated(baseId: number, tableId: number, field: any) {
  const s = io(); if (!s) return;
  s.to(roomTable(baseId, tableId)).emit(EV.fields.updated, { tableId, field });
}
export function emitFieldTrashed(baseId: number, tableId: number, fieldId: number) {
  const s = io(); if (!s) return;
  s.to(roomTable(baseId, tableId)).emit(EV.fields.trashed, { tableId, fieldId });
}
export function emitFieldRestored(baseId: number, tableId: number, field: any) {
  const s = io(); if (!s) return;
  s.to(roomTable(baseId, tableId)).emit(EV.fields.restored, { tableId, field });
}
export function emitFieldOptionsChanged(
  baseId: number,
  tableId: number,
  fieldId: number,
  options: Array<{ id: number; label: string; color?: string | null; position: number }>
) {
  const s = io(); if (!s) return;
  s.to(roomTable(baseId, tableId)).emit(EV.fields.optionsChanged, { tableId, fieldId, options });
}