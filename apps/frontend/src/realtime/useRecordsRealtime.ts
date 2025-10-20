// apps/frontend/src/realtime/useRecordsRealtime.ts
import { useEffect, useRef } from 'react';
import { getSocket } from './socket';

export type RTUser = { id: number; fullName?: string | null } | null | undefined;

export type RecordEvt = {
  tableId: number;
  recordId: number;
  values?: Record<string, any>;
  at?: string;
  user?: RTUser;
};

type Handlers = {
  onCreated?:  (p: RecordEvt) => void;
  onUpdated?:  (p: RecordEvt) => void;
  onTrashed?:  (p: { tableId: number; recordId: number; at?: string; user?: RTUser }) => void;
  onRestored?: (p: { tableId: number; recordId: number; at?: string; user?: RTUser }) => void;
  /** opcional */
  onGeneric?:  (p:
    | (RecordEvt & { type: 'created' | 'updated' })
    | ({ tableId: number; recordId: number; type: 'trashed' | 'restored'; at?: string; user?: RTUser })
  ) => void;
};

/**
 * Suscribe el socket a una TABLA para recibir eventos de registros:
 * - 'record.created'  { tableId, recordId, values, at, user }
 * - 'record.updated'  { tableId, recordId, values, at, user }
 * - 'record.trashed'  { tableId, recordId, at, user }
 * - 'record.restored' { tableId, recordId, at, user }
 */
export function useRecordsRealtime(baseId: number, tableId: number, handlers?: Handlers) {
  const socket = getSocket();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!Number.isFinite(baseId) || !Number.isFinite(tableId)) return;

    socket.emit('subscribe:table', { baseId, tableId });

    const onCreated = (p: RecordEvt) => {
      if (p.tableId === tableId) handlersRef.current?.onCreated?.(p);
      handlersRef.current?.onGeneric?.({ ...p, type: 'created' });
    };
    const onUpdated = (p: RecordEvt) => {
      if (p.tableId === tableId) handlersRef.current?.onUpdated?.(p);
      handlersRef.current?.onGeneric?.({ ...p, type: 'updated' });
    };
    const onTrashed = (p: any) => {
      if (p.tableId === tableId) handlersRef.current?.onTrashed?.(p);
      handlersRef.current?.onGeneric?.({ ...p, type: 'trashed' });
    };
    const onRestored = (p: any) => {
      if (p.tableId === tableId) handlersRef.current?.onRestored?.(p);
      handlersRef.current?.onGeneric?.({ ...p, type: 'restored' });
    };

    socket.on('record.created', onCreated as any);
    socket.on('record.updated', onUpdated as any);
    socket.on('record.trashed', onTrashed as any);
    socket.on('record.restored', onRestored as any);
    // si te interesa el genérico a nivel tabla:
    // socket.on('records:event', (p: any) => handlersRef.current?.onGeneric?.(p));

    return () => {
      socket.off('record.created', onCreated as any);
      socket.off('record.updated', onUpdated as any);
      socket.off('record.trashed', onTrashed as any);
      socket.off('record.restored', onRestored as any);
      // socket.off('records:event', ...);
      socket.emit('unsubscribe:table', { baseId, tableId });
    };
  }, [baseId, tableId, socket]);
}