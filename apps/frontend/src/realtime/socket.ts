// apps/frontend/src/realtime/socket.ts
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '../api/http';

let socketRef: Socket | null = null;

export function getSocket(): Socket {
  if (socketRef) return socketRef;

  socketRef = io(API_URL, {
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socketRef.on('connect', () => {
    console.debug('[realtime] conectado', socketRef?.id);
  });
  socketRef.on('disconnect', (reason) => {
    console.debug('[realtime] desconectado:', reason);
  });
  socketRef.on('connect_error', (err) => {
    console.warn('[realtime] error de conexión:', err?.message || err);
  });

  return socketRef;
}