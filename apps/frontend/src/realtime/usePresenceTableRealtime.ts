import { useEffect, useRef } from 'react';
import { getSocket } from './socket';

export type PresenceUser = { id: number; fullName?: string | null };

type PresencePayload = {
  baseId: number;
  tableId: number;
  count: number;
  users: PresenceUser[];
};

type OnUpdate = (p: { count: number; users: PresenceUser[] }) => void;

/**
 * Presencia por tabla.
 * El servidor emite `presence:users` (nuevo) y, por compatibilidad,
 * algunos clientes legacy usan `table.presence`. Escuchamos ambos.
 */
export function usePresenceTableRealtime(
  baseId: number,
  tableId: number,
  onUpdate: OnUpdate
) {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    if (!baseId || !tableId) return;
    const socket = getSocket();

    const subscribe = () => socket.emit('subscribe:table', { baseId, tableId });

    const handler = (p: PresencePayload) => {
      if (p.baseId !== baseId || p.tableId !== tableId) return;
      cbRef.current({
        count: typeof p.count === 'number' ? p.count : (p.users?.length ?? 0),
        users: p.users ?? [],
      });
    };

    // suscribirse
    subscribe();

    // evento nuevo
    socket.on('presence:users', handler);
    // compatibilidad legacy
    socket.on('table.presence', handler);

    // resuscribirse si el socket se reconecta
    const onReconnect = () => subscribe();
    socket.on('reconnect', onReconnect);

    return () => {
      socket.off('presence:users', handler);
      socket.off('table.presence', handler);
      socket.off('reconnect', onReconnect);
      socket.emit('unsubscribe:table', { baseId, tableId });
    };
  }, [baseId, tableId]);
}