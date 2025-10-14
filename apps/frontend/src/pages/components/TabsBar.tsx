// apps/frontend/src/pages/components/TabsBar.tsx
// Barra de tabs con drag & drop, flechas de scroll y menú contextual.
// Mantiene tu API/handlers y añade estilos Tailwind consistentes con el resto.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { TabItem } from '../../api/tables';

type Props = {
  baseId: number;
  tabs: TabItem[];
  activeId: number | null;
  canManage: boolean;
  onSelect: (tableId: number) => void;
  onCreate?: () => void;
  onRename: (tableId: number) => void;
  onTrash: (tableId: number) => void;
  onReorder?: (orderedIds: number[]) => Promise<void> | void;
};

export default function TabsBar({
  tabs,
  activeId,
  canManage,
  onSelect,
  onCreate,
  onRename,
  onTrash,
  onReorder,
}: Props) {
  // Tabs memoizadas para deps estables
  const safeTabs = useMemo<TabItem[]>(
    () => (Array.isArray(tabs) ? tabs : []),
    [tabs]
  );

  // Orden por posición (igual que tu código)
  const sortedTabs = useMemo(
    () => [...safeTabs].sort((a, b) => a.position - b.position),
    [safeTabs]
  );

  // Menú contextual
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });

  const handleOpenMenu = useCallback((e: React.MouseEvent, tabId: number) => {
    e.stopPropagation();
    setMenuFor(tabId);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const gap = 6;
    const desiredLeft = r.left;
    const fitsRight = desiredLeft + 220 < window.innerWidth - 8;
    setMenuPos({
      top: r.bottom + gap,
      ...(fitsRight ? { left: desiredLeft } : { right: window.innerWidth - r.right })
    });
  }, []);

  const handleCloseMenu = useCallback(() => setMenuFor(null), []);

  // Scroll con flechas
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 4);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scrollByPx = useCallback((px: number) => {
    scrollerRef.current?.scrollBy({ left: px, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    updateArrows();
    const onResize = () => updateArrows();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateArrows]);

  useEffect(() => { updateArrows(); }, [safeTabs, updateArrows]);

  // Drag & Drop (idéntico a tu flujo)
  const handleDragStart = useCallback((e: React.DragEvent<HTMLButtonElement>, id: number) => {
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (onReorder) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, [onReorder]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, overId: number) => {
    if (!onReorder) return;
    e.preventDefault();
    const draggedId = Number(e.dataTransfer.getData('text/plain'));
    if (!draggedId || draggedId === overId) return;

    const ids = sortedTabs.map(t => t.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0) return;

    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, draggedId);
    await onReorder(next);
  }, [onReorder, sortedTabs]);

  // Flecha reutilizable
  const ScrollArrow = ({ dir }: { dir: 'left' | 'right' }) => {
    const visible = dir === 'left' ? showLeft : showRight;
    if (!visible) return null;
    const amount = dir === 'left' ? -280 : 280;
    return (
      <button
        className={`absolute top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white/90 border border-gray-300 rounded-full shadow-md flex items-center justify-center text-gray-600 hover:text-gray-900 hover:shadow-lg transition-all ${dir === 'left' ? 'left-2' : 'right-2'}`}
        aria-label={`Ver pestañas ${dir === 'left' ? 'anteriores' : 'siguientes'}`}
        onClick={() => scrollByPx(amount)}
      >
        <svg className={`w-4 h-4 ${dir === 'right' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    );
  };

  // Render de cada tab (conserva onSelect y activeId)
  const renderTab = (t: TabItem) => {
    const isActive = t.id === activeId;
    return (
      <div
        key={t.id}
        className={`relative group border-b-2 ${isActive ? 'border-azulMedio bg-white' : 'border-transparent bg-gray-50 hover:bg-gray-100'} transition-colors`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, t.id)}
      >
        <button
          draggable={!!onReorder}
          onDragStart={(e) => handleDragStart(e, t.id)}
          className={`flex items-center gap-2 px-4 py-3 min-w-0 max-w-xs text-sm font-medium ${isActive ? 'text-azulOscuro' : 'text-gray-700 hover:text-gray-900'}`}
          aria-pressed={isActive}
          onClick={() => onSelect(t.id)}
          title={t.name}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="truncate">{t.name}</span>
        </button>

        {canManage && isActive && (
          <button
            className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded transition-colors opacity-0 group-hover:opacity-100"
            aria-label={`Opciones de ${t.name}`}
            onClick={(e) => handleOpenMenu(e, t.id)}
            title="Opciones"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  // Botón crear tabla (opcional)
  const renderCreateButton = () => {
    if (!canManage || !onCreate) return null;
    return (
      <button
        className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border-b-2 border-transparent transition-colors"
        onClick={onCreate}
        title="Nueva tabla"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>Nueva tabla</span>
      </button>
    );
  };

  // Menú contextual
  const renderContextMenu = () => {
    if (menuFor === null) return null;
    return (
      <>
        <div className="fixed inset-0 bg-black/10 z-40" onClick={handleCloseMenu} />
        <div
          role="menu"
          className="bg-white rounded-lg shadow-xl border border-gray-200 py-2 w-48 absolute z-50"
          style={{
            position: 'fixed',
            top: menuPos.top,
            ...(menuPos.left != null ? { left: menuPos.left } : { right: menuPos.right }),
          }}
        >
          <button
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => { handleCloseMenu(); onRename(menuFor); }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Renombrar
          </button>
          <button
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            onClick={() => { handleCloseMenu(); onTrash(menuFor); }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Enviar a papelera
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="relative bg-gray-100 border-b border-gray-200">
      {/* Flechas */}
      <ScrollArrow dir="left" />
      <ScrollArrow dir="right" />

      {/* Contenedor scrolleable */}
      <div
        ref={scrollerRef}
        className="flex overflow-x-auto scrollbar-hide"
        onScroll={updateArrows}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex min-w-max">
          {sortedTabs.map(renderTab)}
          {renderCreateButton()}
        </div>
      </div>

      {/* Menú contextual */}
      {renderContextMenu()}

      {/* Ocultar scrollbar en WebKit */}
      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}