// apps/frontend/src/realtime/useFieldsRealtime.ts
import { useEffect, useRef } from 'react';
import { getSocket } from './socket';

/**
 * El hub emite:
 *  - 'field.created'         -> { tableId, field, user? }
 *  - 'field.updated'         -> { tableId, field, user? }
 *  - 'field.trashed'         -> { tableId, fieldId, user? }
 *  - 'field.restored'        -> { tableId, field, user? }
 *  - 'field.options.changed' -> { tableId, fieldId, options }
 */

type RTUser = { id: number; fullName?: string | null } | null | undefined;

export type FieldPayloadCreated = {
  tableId: number;
  field: any; // lo tiparemos desde el consumidor si quiere
  user?: RTUser;
};
export type FieldPayloadUpdated = FieldPayloadCreated;
export type FieldPayloadTrashed = { tableId: number; fieldId: number; user?: RTUser };
export type FieldPayloadRestored = FieldPayloadCreated;
export type FieldOptionsChanged = {
  tableId: number;
  fieldId: number;
  options: Array<{ id: number; label: string; color?: string | null; position: number }>;
};

type Handlers = {
  onCreated?: (p: FieldPayloadCreated) => void;
  onUpdated?: (p: FieldPayloadUpdated) => void;
  onTrashed?: (p: FieldPayloadTrashed) => void;
  onRestored?: (p: FieldPayloadRestored) => void;
  onOptionsChanged?: (p: FieldOptionsChanged) => void;
};

/**
 * Suscribe el cliente al room de la tabla y reenvía los eventos
 * del hub a los handlers provistos. Hace cleanup completo.
 */
export function useFieldsRealtime(baseId: number, tableId: number, handlers: Handlers) {
  // Evitar re-suscripciones por cambios de identidad en handlers
  const hRef = useRef(handlers);
  useEffect(() => { hRef.current = handlers; }, [handlers]);

  useEffect(() => {
    if (!baseId || !tableId) return;
    const socket = getSocket();

    // Asegura que estamos en el room de la tabla
    socket.emit('subscribe:table', { baseId, tableId });

    const onCreated = (p: FieldPayloadCreated) => {
      if (p.tableId !== tableId) return;
      hRef.current.onCreated?.(p);
    };
    const onUpdated = (p: FieldPayloadUpdated) => {
      if (p.tableId !== tableId) return;
      hRef.current.onUpdated?.(p);
    };
    const onTrashed = (p: FieldPayloadTrashed) => {
      if (p.tableId !== tableId) return;
      hRef.current.onTrashed?.(p);
    };
    const onRestored = (p: FieldPayloadRestored) => {
      if (p.tableId !== tableId) return;
      hRef.current.onRestored?.(p);
    };
    const onOptionsChanged = (p: FieldOptionsChanged) => {
      if (p.tableId !== tableId) return;
      hRef.current.onOptionsChanged?.(p);
    };

    socket.on('field.created', onCreated);
    socket.on('field.updated', onUpdated);
    socket.on('field.trashed', onTrashed);
    socket.on('field.restored', onRestored);
    socket.on('field.options.changed', onOptionsChanged);

    return () => {
      // Limpieza total
      socket.off('field.created', onCreated);
      socket.off('field.updated', onUpdated);
      socket.off('field.trashed', onTrashed);
      socket.off('field.restored', onRestored);
      socket.off('field.options.changed', onOptionsChanged);
      socket.emit('unsubscribe:table', { baseId, tableId });
    };
  }, [baseId, tableId]);
}