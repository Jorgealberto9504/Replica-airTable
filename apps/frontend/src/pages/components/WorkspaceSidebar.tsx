// apps/frontend/src/pages/components/WorkspaceSidebar.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import type { Workspace } from '../../api/workspaces';
import { listMyWorkspaces, updateWorkspace, deleteWorkspace } from '../../api/workspaces';
import { confirmToast } from '../../ui/confirmToast';

type Props = {
  selectedId: number | null;
  onSelect: (id: number) => void;
  onOpenCreate?: () => void;
  canCreate?: boolean;
};

export default function WorkspaceSidebar({
  selectedId,
  onSelect,
  onOpenCreate,
  canCreate,
}: Props) {
  const [items, setItems] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });

  const [renameTarget, setRenameTarget] = useState<Workspace | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [saving, setSaving] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const menuRef = useRef<HTMLDivElement | null>(null);

  async function reload() {
    const resp = await listMyWorkspaces();
    setItems(resp.workspaces);
  }

  useEffect(() => {
    (async () => {
      try { await reload(); } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    const onCreated = (ev: Event) => {
      const ws = (ev as CustomEvent<Workspace>).detail;
      if (!ws) return;
      setItems(prev => (prev.some(x => x.id === ws.id) ? prev : [ws, ...prev]));
    };
    window.addEventListener('workspace:created', onCreated as EventListener);
    return () => window.removeEventListener('workspace:created', onCreated as EventListener);
  }, []);

  function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
  function computeMenuPosition(anchor: HTMLElement, menuEl?: HTMLElement) {
    const pad = 8;
    const rect = anchor.getBoundingClientRect();
    const approxW = menuEl?.offsetWidth ?? 200;
    const approxH = menuEl?.offsetHeight ?? 96;
    const spaceBelow = window.innerHeight - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    const openBelow = spaceBelow >= approxH || spaceBelow >= spaceAbove;
    let top = openBelow ? rect.bottom + 6 : rect.top - approxH - 6;
    let left = clamp(rect.right - approxW, pad, window.innerWidth - approxW - pad);
    top = clamp(top, pad, window.innerHeight - approxH - pad);
    return { top, left };
  }
  function repositionMenu() {
    if (openMenuId == null) return;
    const btn = btnRefs.current.get(openMenuId);
    if (!btn) return;
    setMenuPos(computeMenuPosition(btn, menuRef.current || undefined));
  }

  useLayoutEffect(() => {
    if (openMenuId == null) return;
    repositionMenu();
    const t = setTimeout(repositionMenu, 0);
    return () => clearTimeout(t);
  }, [openMenuId]);

  useEffect(() => {
    if (openMenuId == null) return;
    const onWindow = () => repositionMenu();
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenuId(null); };
    window.addEventListener('scroll', onWindow, true);
    window.addEventListener('resize', onWindow);
    window.addEventListener('keydown', onEsc);
    const sc = scrollRef.current; sc?.addEventListener('scroll', onWindow);
    return () => {
      window.removeEventListener('scroll', onWindow, true);
      window.removeEventListener('resize', onWindow);
      window.removeEventListener('keydown', onEsc);
      sc?.removeEventListener('scroll', onWindow);
    };
  }, [openMenuId]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (openMenuId == null) return;
      const menuEl = menuRef.current;
      const btnEl = btnRefs.current.get(openMenuId) || null;
      const target = e.target as Node;
      if (menuEl?.contains(target)) return;
      if (btnEl?.contains(target)) return;
      setOpenMenuId(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [openMenuId]);

  function openRenameModal(w: Workspace) {
    setOpenMenuId(null);
    setRenameTarget(w);
    setRenameValue(w.name);
  }

  async function confirmRename() {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name || name === renameTarget.name) { setRenameTarget(null); return; }
    setSaving(true);
    try {
      await updateWorkspace(renameTarget.id, { name });
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo renombrar el workspace');
    } finally {
      setSaving(false);
      setRenameTarget(null);
    }
  }

  async function handleDelete(w: Workspace) {
    const ok = await confirmToast({
      title: 'Enviar a papelera',
      body: <>¿Enviar el workspace <b>{w.name}</b> a la papelera?</>,
      confirmText: 'Enviar',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteWorkspace(w.id);
      await reload();
      if (selectedId === w.id) onSelect(0);
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo eliminar el workspace');
    } finally {
      setOpenMenuId(null);
    }
  }

  return (
    <div className="h-full flex flex-col p-3 gap-2">
      <div ref={scrollRef} className="overflow-y-auto pr-1">
        {/* Explorar */}
        <button
          onClick={() => { setOpenMenuId(null); onSelect(0); }}
          className={`w-full text-left rounded-lg px-3 py-2 mb-2 transition ${
            selectedId === 0
              ? 'bg-indigo-100 font-bold text-indigo-900'
              : 'hover:bg-slate-100 text-slate-700'
          }`}
        >
          Explorar
          <div className="text-xs text-slate-500 mt-0.5">Miembro + públicas</div>
        </button>

        {/* Workspaces */}
        {loading ? (
          <div className="text-slate-500 p-2">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="text-slate-400 p-2">Sin workspaces</div>
        ) : (
          items.map((w) => (
            <div
              key={w.id}
              onClick={() => { setOpenMenuId(null); onSelect(w.id); }}
              className={`relative flex items-center gap-2 px-2.5 py-2 mb-1.5 rounded-md cursor-pointer transition ${
                selectedId === w.id
                  ? 'bg-indigo-100 font-bold text-indigo-900'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="flex-1 min-w-0 truncate">{w.name}</div>

              <button
                aria-label="Opciones"
                title="Opciones"
                ref={(el) => { if (el) btnRefs.current.set(w.id, el); else btnRefs.current.delete(w.id); }}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(prev => {
                    const next = prev === w.id ? null : w.id;
                    requestAnimationFrame(() => repositionMenu());
                    return next;
                  });
                }}
                className="p-1 rounded-md hover:bg-slate-200 transition"
              >
                <MoreVertical size={18} />
              </button>

              {openMenuId === w.id &&
                createPortal(
                  <div
                    ref={menuRef}
                    onClick={(e) => e.stopPropagation()}
                    className="fixed min-w-[180px] bg-white border border-slate-200 rounded-xl shadow-lg z-[3000] overflow-hidden animate-fade-in"
                    style={{ top: menuPos.top, left: menuPos.left }}
                  >
                    <button
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 transition"
                      onClick={() => openRenameModal(w)}
                    >
                      Cambiar nombre
                    </button>
                    <button
                      className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition"
                      onClick={() => handleDelete(w)}
                    >
                      Eliminar
                    </button>
                  </div>,
                  document.body
                )}
            </div>
          ))
        )}
      </div>

      {/* Crear nuevo */}
      {canCreate && onOpenCreate && (
        <div className="mt-auto pt-3 border-t border-slate-200 mb-12">
          <button onClick={onOpenCreate} className="btn-primary w-full text-center font-semibold">
            Nuevo workspace
          </button>
        </div>
      )}

      {/* Modal renombrar */}
      {renameTarget &&
        createPortal(
          <div className="modal-backdrop" onClick={() => !saving && setRenameTarget(null)}>
            <div className="modal-card w-[400px]" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header border-b border-slate-200">
                <h3 className="m-0 font-semibold text-lg">Cambiar nombre</h3>
                <button className="modal-close" onClick={() => !saving && setRenameTarget(null)}>×</button>
              </div>

              <div className="modal-body">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !saving) confirmRename(); }}
                  placeholder="Nombre del workspace"
                  className="input w-full"
                />
              </div>

              <div className="modal-footer justify-end gap-2">
                <button className="btn" onClick={() => !saving && setRenameTarget(null)} disabled={saving}>
                  Cancelar
                </button>
                <button className="btn-primary" onClick={confirmRename} disabled={saving || !renameValue.trim()}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}