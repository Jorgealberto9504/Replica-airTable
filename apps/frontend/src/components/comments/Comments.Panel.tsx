import { useEffect, useRef, useState } from 'react';
import type { Comment } from '../../api/comments';
import {
  createComment,
  listComments,
  deleteComment,
  updateComment,
} from '../../api/comments';

type Props = {
  baseId: number;
  tableId: number;
  recordId: number;
  canComment: boolean;
  onClose: () => void;
  onDeltaCount?: (delta: number) => void;
};

// 🧠 cache simple en memoria: evita volver a pedir los mismos comentarios
const commentCache = new Map<string, Comment[]>();

export default function CommentsPanel({
  baseId,
  tableId,
  recordId,
  canComment,
  onClose,
  onDeltaCount,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Comment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const cacheKey = `${baseId}-${tableId}-${recordId}`;

  useEffect(() => {
    let alive = true;
    const cached = commentCache.get(cacheKey);

    // ⚡ Muestra al instante los últimos comentarios guardados (cache local)
    if (cached && alive) {
      setItems(cached);
      setLoading(true);
    } else {
      setItems([]);
      setLoading(true);
    }

    // 🚀 Carga asíncrona sin bloquear renderizado
    listComments(baseId, tableId, recordId, 1, 200)
      .then((r) => {
        if (!alive) return;
        commentCache.set(cacheKey, r.comments);
        setItems(r.comments);
        scrollToBottom();
      })
      .catch((e: any) => {
        if (alive) setErr(e?.message || 'No se pudieron cargar los comentarios');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId, tableId, recordId]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  }

  async function handleSend() {
    const body = text.trim();
    if (!body) return;
    setText('');

    const tempId = -Date.now();
    const optimistic: Comment = {
      id: tempId,
      body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: undefined,
      updatedBy: undefined,
    };
    setItems((prev) => [...prev, optimistic]);
    scrollToBottom();

  try {
  const r = await createComment(baseId, tableId, recordId, body);
  setItems((prev) => prev.map((c) => (c.id === tempId ? r.comment : c)));

  // ✅ Actualizamos cache correctamente
  const current = commentCache.get(cacheKey) || [];
  commentCache.set(cacheKey, [
    ...current.filter((p) => p.id !== tempId),
    r.comment,
  ]);

  onDeltaCount?.(1);
} catch (e: any) {
  setItems((prev) => prev.filter((c) => c.id !== tempId));
  alert(e?.message || 'No se pudo enviar el comentario');
}
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este comentario?')) return;
    const old = items;
    setItems((prev) => prev.filter((c) => c.id !== id));
    try {
      await deleteComment(baseId, tableId, recordId, id);
      commentCache.set(cacheKey, old.filter((c) => c.id !== id));
      onDeltaCount?.(-1);
    } catch (e: any) {
      alert(e?.message || 'No se pudo eliminar');
      setItems(old);
    }
  }

  async function handleUpdate(id: number, newBody: string) {
    try {
      await updateComment(baseId, tableId, recordId, id, newBody);
      setItems((prev) =>
        prev.map((c) => (c.id === id ? { ...c, body: newBody } : c))
      );
      const updated = items.map((c) =>
        c.id === id ? { ...c, body: newBody } : c
      );
      commentCache.set(cacheKey, updated);
    } catch (e: any) {
      alert(e?.message || 'No se pudo editar el comentario');
    }
  }

  function formatMeta(c: Comment) {
    const who = c.createdBy?.fullName || 'Usuario';
    const dt = new Date(c.createdAt);
    return `${who} · ${dt.toLocaleString()}`;
  }

  return (
    <>
      <div className="cmt-overlay" onClick={onClose} />
      <aside className="cmt-drawer" role="dialog" aria-modal="true">
        <header className="cmt-header">
          <strong>Comentarios</strong>
          <button className="cmt-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div ref={listRef} className="cmt-list">
          {/* 💨 Esqueleto rápido mientras carga */}
          {loading && items.length === 0 && (
            <div className="cmt-skeleton">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-line" />
              ))}
            </div>
          )}

          {err && <div className="cmt-error">{err}</div>}

          {!loading && items.length === 0 && !err && (
            <div className="cmt-empty">No hay comentarios.</div>
          )}

          {items.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              canEditDelete={canComment}
              onDelete={() => handleDelete(c.id)}
              onEdit={(txt) => handleUpdate(c.id, txt)}
              meta={formatMeta(c)}
            />
          ))}
        </div>

        <footer className="cmt-footer">
          {canComment ? (
            <div className="cmt-compose">
              <textarea
                className="cmt-input"
                rows={2}
                placeholder="Escribe un comentario…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button className="btn-primary cmt-send" onClick={handleSend}>
                Enviar
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

function CommentItem({
  comment,
  meta,
  canEditDelete,
  onDelete,
  onEdit,
}: {
  comment: Comment;
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
        <div className="cmt-meta">{meta}</div>

        {!editing ? (
          <div className="cmt-bodytext">{comment.body}</div>
        ) : (
          <textarea
            className="cmt-edit"
            rows={3}
            value={buf}
            onChange={(e) => setBuf(e.target.value)}
          />
        )}

        {canEditDelete && (
          <div className="cmt-actions">
            {!editing ? (
              <>
                <button className="cmt-action" onClick={() => setEditing(true)}>
                  Editar
                </button>
                <button className="cmt-action danger" onClick={onDelete}>
                  Eliminar
                </button>
              </>
            ) : (
              <>
                <button
                  className="cmt-action"
                  onClick={() => {
                    const v = buf.trim();
                    if (!v) return;
                    onEdit(v);
                    setEditing(false);
                  }}
                >
                  Guardar
                </button>
                <button
                  className="cmt-action"
                  onClick={() => {
                    setEditing(false);
                    setBuf(comment.body);
                  }}
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  return (a + b).toUpperCase() || 'U';
}