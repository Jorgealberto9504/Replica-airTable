import { useEffect } from 'react';
import { getSocket } from './socket';

type RTUser = { id: number; fullName?: string | null } | null | undefined;

type CCreated = { tableId: number; recordId: number; commentId: number; at?: string; user?: RTUser; count?: number };
type CUpdated = CCreated;
type CTrashed = CCreated;

type Handlers = {
  onCreated?: (p: CCreated) => void;
  onUpdated?: (p: CUpdated) => void;
  onTrashed?: (p: CTrashed) => void;
};

export function useCommentsRealtime(baseId: number, tableId: number, recordId: number, handlers: Handlers) {
  useEffect(() => {
    if (!baseId || !tableId || !recordId) return;
    const socket = getSocket();

    socket.emit('subscribe:record', { baseId, tableId, recordId });

    const onCreated = (p: CCreated) => { if (p.recordId === recordId && p.tableId === tableId) handlers.onCreated?.(p); };
    const onUpdated = (p: CUpdated) => { if (p.recordId === recordId && p.tableId === tableId) handlers.onUpdated?.(p); };
    const onTrashed = (p: CTrashed) => { if (p.recordId === recordId && p.tableId === tableId) handlers.onTrashed?.(p); };

    // eventos directos del room
    getSocket().on('comment.created', onCreated);
    getSocket().on('comment.updated', onUpdated);
    getSocket().on('comment.trashed', onTrashed);

    return () => {
      socket.emit('unsubscribe:record', { baseId, tableId, recordId });
      getSocket().off('comment.created', onCreated);
      getSocket().off('comment.updated', onUpdated);
      getSocket().off('comment.trashed', onTrashed);
    };
  }, [baseId, tableId, recordId]);
}