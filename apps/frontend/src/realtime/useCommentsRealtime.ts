// apps/frontend/src/realtime/useCommentsRealtime.ts
import { useEffect, useRef } from 'react';
import { getSocket } from './socket';

type CommentEvt = {
  tableId?: number;
  recordId: number;
  commentId: number;
  at?: string;
  user?: { id: number; fullName?: string | null };
  count?: number;
};

type Handlers = {
  onCreated?: (p: CommentEvt) => void;
  onUpdated?: (p: CommentEvt) => void;
  onTrashed?: (p: CommentEvt) => void;
  /** opcional: evento genérico (si lo quieres escuchar) */
  onGeneric?: (p: CommentEvt & { type: 'created' | 'updated' | 'deleted' }) => void;
};

export function useCommentsRealtime(
  baseId: number,
  tableId: number,
  recordId: number,
  handlers?: Handlers
) {
  const socket = getSocket();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!Number.isFinite(baseId) || !Number.isFinite(tableId) || !Number.isFinite(recordId)) return;

    // Join
    socket.emit('subscribe:record', { baseId, tableId, recordId });

    const onCreated = (p: CommentEvt) => {
      if (p.recordId === recordId) handlersRef.current?.onCreated?.(p);
    };
    const onUpdated = (p: CommentEvt) => {
      if (p.recordId === recordId) handlersRef.current?.onUpdated?.(p);
    };
    const onTrashed = (p: CommentEvt) => {
      if (p.recordId === recordId) handlersRef.current?.onTrashed?.(p);
    };
    const onGeneric = (p: any) => {
      if (p.recordId === recordId) handlersRef.current?.onGeneric?.(p);
    };

    socket.on('comment.created', onCreated as any);
    socket.on('comment.updated', onUpdated as any);
    socket.on('comment.trashed', onTrashed as any);
    socket.on('comments:event', onGeneric as any);

    return () => {
      socket.off('comment.created', onCreated as any);
      socket.off('comment.updated', onUpdated as any);
      socket.off('comment.trashed', onTrashed as any);
      socket.off('comments:event', onGeneric as any);
      socket.emit('unsubscribe:record', { baseId, tableId, recordId });
    };
  }, [baseId, tableId, recordId, socket]);
}