// apps/frontend/src/components/comments/Comments.Panel.tsx
import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Comment } from '../../api/comments';
import {
  createComment,
  listComments,
  deleteComment,
  updateComment,
} from '../../api/comments';
import { measureAsync } from '../../utils/metrics';
import { useCommentsRealtime } from '../../realtime/useCommentsRealtime';

type Props = {
  baseId: number;
  tableId: number;
  recordId: number;
  canComment: boolean;
  onClose: () => void;
  onDeltaCount?: (delta: number) => void;
};

const commentCache = new Map<string, Comment[]>();
type LocalComment = Comment & { __optimistic?: boolean };

function CommentsPanelInner({
  baseId,
  tableId,
  recordId,
  canComment,
  onClose,
  onDeltaCount,
}: Props) {
  const cacheKey = `${baseId}-${tableId}-${recordId}`;

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LocalComment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const refetchTimer = useRef<number | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  };

  const loadList = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await measureAsync('comments.list', () => listComments(baseId, tableId, recordId, 1, 200));
      commentCache.set(cacheKey, r.comments);
      setItems(r.comments);
      scrollToBottom();
    } catch (e: any) {
      setErr(e?.message || 'No se pudieron cargar los comentarios');
    } finally {
      setLoading(false);
    }
  }, [baseId, tableId, recordId, cacheKey]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) return;
    refetchTimer.current = window.setTimeout(() => {
      refetchTimer.current = null;
      loadList();
    }, 200);
  }, [loadList]);

  // Cargar (y cache)
  useEffect(() => {
    let alive = true;
    const cached = commentCache.get(cacheKey);
    if (cached) setItems(cached as LocalComment[]);

    loadList();
    return () => { alive = false; if (refetchTimer.current) window.clearTimeout(refetchTimer.current); };
  }, [cacheKey, loadList]);

  // Cerrar con Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 🔔 Realtime (refresca lista al recibir eventos)
  useCommentsRealtime(baseId, tableId, recordId, {
    onCreated: () => scheduleRefetch(),
    onUpdated: () => scheduleRefetch(),
    onTrashed: () => scheduleRefetch(),
  });

  async function handleSend() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);

    // Optimista
    setText('');
    const tempId = -Date.now();
    const optimistic: LocalComment = {
      id: tempId,
      body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: undefined,
      updatedBy: undefined,
      __optimistic: true,
    };
    setItems((prev) => [...prev, optimistic]);
    scrollToBottom();

    try {
      const r = await measureAsync('comments.create', () =>
        createComment(baseId, tableId, recordId, body)
      );
      setItems((prev) =>
        prev.map((c) => (c.id === tempId ? (r.comment as LocalComment) : c))
      );

      // Actualiza cache
      const current = commentCache.get(cacheKey) || [];
      commentCache.set(
        cacheKey,
        [...current.filter((c) => c.id !== tempId), r.comment] as Comment[]
      );

      onDeltaCount?.(1);
    } catch (e: any) {
      setItems((prev) => prev.filter((c) => c.id !== tempId)); // revert
      alert(e?.message || 'No se pudo enviar el comentario');
      setText(body);
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este comentario?')) return;
    const old = items;
    setItems((prev) => prev.filter((c) => c.id !== id));
    try {
      await measureAsync('comments.delete', () =>
        deleteComment(baseId, tableId, recordId, id)
      );
      commentCache.set(cacheKey, old.filter((c) => c.id !== id));
      onDeltaCount?.(-1);
    } catch (e: any) {
      alert(e?.message || 'No se pudo eliminar');
      setItems(old);
    }
  }

  async function handleUpdate(id: number, newBody: string) {
    try {
      await measureAsync('comments.update', () =>
        updateComment(baseId, tableId, recordId, id, newBody)
      );
      setItems((prev) =>
        prev.map((c) => (c.id === id ? { ...c, body: newBody } : c))
      );
      const updated = items.map((c) => (c.id === id ? { ...c, body: newBody } : c));
      commentCache.set(cacheKey, updated);
    } catch (e: any) {
      alert(e?.message || 'No se pudo editar el comentario');
    }
  }

  function formatMeta(c: Comment) {
    const who = c.createdBy?.fullName || 'Usuario';
    const dt = new Date(c.createdAt);
    const edited =
      c.updatedAt && c.updatedAt !== c.createdAt ? ' · editado' : '';
    return `${who} · ${dt.toLocaleString()}${edited}`;
  }

  return (
    <>
      <div className="cmt-overlay" onClick={onClose} />
      <aside
        className="cmt-drawer"
        role="dialog"
        aria-modal="true"
        aria-busy={loading ? 'true' : 'false'}
      >
        <header className="cmt-header">
          <strong>Comentarios</strong>
          <button className="cmt-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div ref={listRef} className="cmt-list">
          {loading && items.length === 0 && (
            <div className="cmt-skeleton">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-line" />
              ))}
            </div>
          )}

          {err && (
            <div className="cmt-error">
              <div className="mb-2">{err}</div>
              <button className="btn" onClick={loadList}>Reintentar</button>
            </div>
          )}

          {!loading && items.length === 0 && !err && (
            <div className="cmt-empty">No hay comentarios.</div>
          )}

          {items.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              meta={formatMeta(c)}
              canEditDelete={canComment}
              onDelete={() => handleDelete(c.id)}
              onEdit={(txt) => handleUpdate(c.id, txt)}
            />
          ))}
        </div>

        <footer className="cmt-footer">
          {canComment ? (
            <div className="cmt-compose">
              <textarea
                ref={inputRef}
                className="cmt-input"
                rows={2}
                placeholder="Escribe un comentario…"
                value={text}
                disabled={sending}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  const isEnter = e.key === 'Enter';
                  if ((isEnter && !e.shiftKey) || (isEnter && (e.ctrlKey || e.metaKey))) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                className="btn-primary cmt-send"
                onClick={handleSend}
                disabled={!text.trim() || sending}
                aria-busy={sending ? 'true' : 'false'}
              >
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          ) : (
            <div className="cmt-note muted">No puedes comentar en esta base.</div>
          )}
        </footer>
      </aside>
    </>
  );
}

const CommentItem = memo(function CommentItem({
  comment,
  meta,
  canEditDelete,
  onDelete,
  onEdit,
}: {
  comment: LocalComment;
  meta: string;
  canEditDelete: boolean;
  onDelete: () => void;
  onEdit: (body: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [buf, setBuf] = useState(comment.body);
  useEffect(() => setBuf(comment.body), [comment.body]);

  return (
    <div className="cmt-item">
      <div className="cmt-avatar">{initials(comment.createdBy?.fullName ?? 'U')}</div>
      <div className="cmt-bubble">
        <div className="cmt-meta">
          {meta}
          {comment.__optimistic && <span className="muted ml-2">(enviando…)</span>}
        </div>

        {!editing ? (
          <div className="cmt-bodytext">{comment.body}</div>
        ) : (
          <textarea
            className="cmt-edit"
            rows={3}
            value={buf}
            onChange={(e) => setBuf(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                const v = buf.trim();
                if (!v) return;
                onEdit(v);
                setEditing(false);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
                setBuf(comment.body);
              }
            }}
          />
        )}

        {canEditDelete && (
          <div className="cmt-actions">
            {!editing ? (
              <>
                <button className="cmt-action" onClick={() => setEditing(true)}>Editar</button>
                <button className="cmt-action danger" onClick={onDelete}>Eliminar</button>
              </>
            ) : (
              <>
                <button className="cmt-action" onClick={() => { const v = buf.trim(); if (!v) return; onEdit(v); setEditing(false); }}>Guardar</button>
                <button className="cmt-action" onClick={() => { setEditing(false); setBuf(comment.body); }}>Cancelar</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  return (a + b).toUpperCase() || 'U';
}

export default function CommentsPanel(props: Props) {
  return createPortal(<CommentsPanelInner {...props} />, document.body);
}