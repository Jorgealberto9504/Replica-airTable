// apps/frontend/src/pages/components/BaseGrid.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import type { BaseItem } from '../../api/workspaces';
import { listBasesForWorkspace } from '../../api/workspaces';
import {
  listBases,
  renameBase,
  deleteBase,
  updateBaseVisibility,
  type BaseVisibility,
} from '../../api/bases';

import { useAuth } from '../../auth/AuthContext';
import { confirmToast } from '../../ui/confirmToast';
// Si ya migraste a tu Modal genérico, descomenta esta línea y usa <Modal> abajo
// import Modal from '../../components/Modal';
import { measureAsync } from '../../utils/metrics';

type GridItem = BaseItem & { ownerName?: string };

type Props = {
  workspaceId: number | null;
  onCreateBase?: () => void;
  canCreate?: boolean;
  query?: string;
  showInlineSearch?: boolean;
  reloadKey?: number;
};

// Constantes de UI
const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
const DEBOUNCE_DELAY = 300;

// Hook de debounce simple
const useDebounce = (value: string, delay = DEBOUNCE_DELAY) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced.trim();
};

export default function BaseGrid({
  workspaceId,
  onCreateBase,
  canCreate,
  query,
  showInlineSearch = true,
  reloadKey,
}: Props) {
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const isAdmin = me?.platformRole === 'SYSADMIN';

  // Datos
  const [items, setItems] = useState<GridItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Filtro/búsqueda
  const [localQuery, setLocalQuery] = useState('');
  const debouncedLocal = useDebounce(localQuery);
  const searchQuery = (showInlineSearch ? debouncedLocal : (query ?? '')).trim();

  // Paginación
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState<number | null>(null);
  const totalKnown = total ?? items.length;
  const totalPages = Math.max(1, Math.ceil((totalKnown || 1) / pageSize));
  useEffect(() => { setPage(1); }, [workspaceId, searchQuery, pageSize]);

  const canCreateHere = Boolean(canCreate && workspaceId && workspaceId !== 0);

  // Permisos por base
  const canManageBase = useCallback((b: GridItem): boolean => {
    return Boolean(isAdmin || (me?.id && b.ownerId && me.id === b.ownerId));
  }, [isAdmin, me?.id]);

  // Carga de datos
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        if (workspaceId === 0) {
          const r = await measureAsync('bases.listAll', () =>
            listBases({ page, pageSize, q: searchQuery })
          );
          if (!alive) return;
          const rows: GridItem[] = r.bases.map((b: any) => ({
            id: b.id,
            name: b.name,
            visibility: b.visibility,
            workspaceId: b.workspaceId ?? 0,
            ownerId: b.ownerId ?? 0,
            createdAt: b.createdAt ?? '',
            ownerName: b.owner?.fullName ?? undefined,
          }));
          setItems(rows);
          setTotal(r.total ?? null);
        } else if (workspaceId) {
          const r = await measureAsync('bases.listByWs', () =>
            listBasesForWorkspace(workspaceId)
          );
          if (!alive) return;
          let rows: GridItem[] = (r.bases as any[]).map((b: any) => ({
            ...b,
            ownerId: b.ownerId ?? 0,
            ownerName: b.owner?.fullName,
          }));
          if (searchQuery) {
            const ql = searchQuery.toLowerCase();
            rows = rows.filter(b => (b.name ?? '').toLowerCase().includes(ql));
          }
          setTotal(rows.length);
          const start = (page - 1) * pageSize;
          setItems(rows.slice(start, start + pageSize));
        } else {
          setItems([]);
          setTotal(0);
        }
      } catch (e) {
        console.error('Error fetching bases:', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [workspaceId, page, pageSize, searchQuery, reloadKey]);

  // Navegar a base
  const openBase = useCallback((id: number) => {
    navigate(`/bases/${id}`);
  }, [navigate]);

  // Menú contextual
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });

  const openMenu = useCallback((e: React.MouseEvent, baseId: number) => {
    e.stopPropagation();
    const b = items.find(x => x.id === baseId);
    if (!b || !canManageBase(b)) return;

    setMenuFor(baseId);
    const btn = e.currentTarget as HTMLButtonElement;
    const r = btn.getBoundingClientRect();
    const gap = 6;
    const desiredLeft = r.left;
    const fitsRight = desiredLeft + 220 < window.innerWidth - 8;
    setMenuPos({ top: r.bottom + gap, ...(fitsRight ? { left: desiredLeft } : { right: window.innerWidth - r.right }) });
  }, [items, canManageBase]);

  const closeMenu = useCallback(() => setMenuFor(null), []);

  // Modales
  const [renameOpen, setRenameOpen] = useState<{ open: boolean; id?: number; name: string }>({ open: false, name: '' });
  const [privacyOpen, setPrivacyOpen] = useState<{ open: boolean; id?: number; v: BaseVisibility }>({ open: false, v: 'PRIVATE' });

  const refreshData = useCallback(async () => {
    if (workspaceId === 0) {
      const r = await measureAsync('bases.listAll', () =>
        listBases({ page, pageSize, q: searchQuery })
      );
      const rows: GridItem[] = r.bases.map((b: any) => ({
        id: b.id,
        name: b.name,
        visibility: b.visibility,
        workspaceId: b.workspaceId ?? 0,
        ownerId: b.ownerId ?? 0,
        createdAt: b.createdAt ?? '',
        ownerName: b.owner?.fullName ?? undefined,
      }));
      setItems(rows);
      setTotal(r.total ?? null);
    } else if (workspaceId) {
      const r = await measureAsync('bases.listByWs', () =>
        listBasesForWorkspace(workspaceId)
      );
      let rows: GridItem[] = (r.bases as any[]).map((b: any) => ({
        ...b,
        ownerId: b.ownerId ?? 0,
        ownerName: b.owner?.fullName,
      }));
      if (searchQuery) rows = rows.filter(b => (b.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()));
      setTotal(rows.length);
      const start = (page - 1) * pageSize;
      setItems(rows.slice(start, start + pageSize));
    }
  }, [workspaceId, page, pageSize, searchQuery]);

  async function submitRename() {
    if (!renameOpen.id) return;
    const b = items.find(x => x.id === renameOpen.id);
    if (!b || !canManageBase(b)) { setRenameOpen({ open: false, name: '' }); return; }

    const name = renameOpen.name.trim();
    if (!name) return;

    try {
      await measureAsync('bases.rename', () => renameBase(renameOpen.id!, name));
      await refreshData();
    } catch (e: any) {
      alert(e?.message || 'No se pudo renombrar la base');
    }
    setRenameOpen({ open: false, name: '' });
  }

  async function submitPrivacy() {
    if (!privacyOpen.id) return;
    const b = items.find(x => x.id === privacyOpen.id);
    if (!b || !canManageBase(b)) { setPrivacyOpen({ open: false, v: 'PRIVATE' }); return; }

    try {
      await measureAsync('bases.changeVisibility', () =>
        updateBaseVisibility(privacyOpen.id!, privacyOpen.v)
      );
      await refreshData();
    } catch (e: any) {
      alert(e?.message || 'No se pudo actualizar la privacidad');
    }
    setPrivacyOpen({ open: false, v: 'PRIVATE' });
  }

  const sendToTrash = useCallback(async (id: number) => {
    closeMenu();
    const b = items.find(x => x.id === id);
    if (!b || !canManageBase(b)) return;

    const ok = await confirmToast({
      title: 'Enviar a papelera',
      body: <>¿Enviar la base <b>{b.name}</b> a la papelera?</>,
      confirmText: 'Enviar',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!ok) return;

    try {
      await measureAsync('bases.delete', () => deleteBase(id));

      // Ajustar página si cambia el total
      const nextCount = (total ?? items.length) - 1;
      const nextTotalPages = Math.max(1, Math.ceil(nextCount / pageSize));
      if (page > nextTotalPages) setPage(nextTotalPages);

      await refreshData();
    } catch (e: any) {
      alert(e?.message || 'No se pudo enviar a la papelera');
    }
  }, [closeMenu, items, canManageBase, total, page, pageSize, refreshData]);

  // Texto toolbar
  const toolbarText = useMemo(() => `${totalKnown} ${totalKnown === 1 ? 'base' : 'bases'}`, [totalKnown]);

  // ======= Render =======

  const renderToolbar = () => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          {workspaceId === 0 ? 'Todas las bases' : 'Bases'}
        </h2>
        <p className="text-gray-600 text-sm">
          {workspaceId === 0 ? 'Explora todas las bases disponibles' : 'Bases de este workspace'}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {showInlineSearch && (
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azulMedio focus:border-azulMedio focus:outline-none transition-colors w-64"
              placeholder="Buscar bases…"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
            />
          </div>
        )}

        <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
          {toolbarText}
        </span>

        {canCreateHere && (
          <button
            onClick={onCreateBase}
            className="px-4 py-2 rounded-lg bg-azulMedio text-white text-sm font-medium hover:brightness-95 transition-colors shadow-sm"
          >
            Nueva base
          </button>
        )}
      </div>
    </div>
  );

  const renderCreateCard = () => {
    if (!canCreateHere) return null;
    return (
      <div
        onClick={onCreateBase}
        className="group cursor-pointer bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-200 rounded-xl p-6 hover:border-blue-300 hover:from-blue-100 hover:to-indigo-100 transition-all duration-200 hover:shadow-md"
      >
        <div className="flex flex-col items-center justify-center text-center h-full">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Crear nueva base</h3>
          <p className="text-sm text-gray-600">Comienza desde cero o usa una plantilla</p>
        </div>
      </div>
    );
  };

  const renderBaseCard = (b: GridItem) => {
    const canManage = canManageBase(b);
    const isPublic = b.visibility === 'PUBLIC';

    return (
      <div
        key={b.id}
        role="button"
        tabIndex={0}
        className="group cursor-pointer bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-200 p-5 flex flex-col"
        onClick={() => openBase(b.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openBase(b.id);
          }
        }}
        title={`Abrir ${b.name}`}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-azulMedio transition-colors">
              {b.name}
            </h3>
          </div>

        {canManage && (
            <button
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-all duration-200 ml-2 flex-shrink-0 p-1 rounded hover:bg-gray-100"
              aria-label={`Acciones para ${b.name}`}
              onClick={(e) => openMenu(e, b.id)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          )}
        </div>

        <div className="mt-auto space-y-2">
          <div className="inline-flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              isPublic
                ? 'bg-green-100 text-green-800 border border-green-200'
                : 'bg-gray-100 text-gray-800 border border-gray-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isPublic ? 'bg-green-500' : 'bg-gray-500'}`} />
              {isPublic ? 'Pública' : 'Privada'}
            </span>
          </div>
          {b.ownerName && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {b.ownerName}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPagination = () => (
    <div className="flex flex-wrap items-center justify-between mt-8 gap-4 text-gray-700">
      <div className="flex items-center gap-3">
        <button
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Anterior
        </button>

        <span className="text-sm text-gray-600">
          Página <span className="font-medium">{page}</span> de <span className="font-medium">{totalPages}</span>
        </span>

        <button
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Siguiente
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-600">Mostrar</span>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-azulMedio focus:border-azulMedio focus:outline-none transition-colors"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map(sz => (
            <option key={sz} value={sz}>{sz} por página</option>
          ))}
        </select>
      </div>
    </div>
  );

  const renderContextMenu = () => {
    if (menuFor == null) return null;
    const current = items.find(x => x.id === menuFor);
    if (!current) return null;

    return (
      <>
        <div className="fixed inset-0 bg-black/10 z-40" onClick={closeMenu} />
        <div
          role="menu"
          className="bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-64 absolute z-50"
          style={{
            position: 'fixed',
            top: menuPos.top,
            ...(menuPos.left != null ? { left: menuPos.left } : { right: menuPos.right }),
          }}
        >
          <button
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => setRenameOpen({ open: true, id: menuFor, name: current.name })}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Cambiar nombre
          </button>

          <button
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => setPrivacyOpen({ open: true, id: menuFor, v: (current.visibility ?? 'PRIVATE') as BaseVisibility })}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Cambiar privacidad
          </button>

          <hr className="my-1 border-gray-200" />

          <button
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            onClick={() => sendToTrash(menuFor)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Eliminar
          </button>
        </div>
      </>
    );
  };

  // Si ya migraste a <Modal />, reemplaza los overlays siguientes por ese componente.
  const renderRenameModal = () => {
    if (!renameOpen.open) return null;
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setRenameOpen({ open: false, name: '' })}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Cambiar nombre</h3>
            <button className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100" onClick={() => setRenameOpen({ open: false, name: '' })}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-6">
            <input
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azulMedio focus:border-azulMedio focus:outline-none transition-colors"
              value={renameOpen.name}
              onChange={(e) => setRenameOpen(s => ({ ...s, name: e.target.value }))}
              placeholder="Nuevo nombre"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
            <button className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors font-medium" onClick={() => setRenameOpen({ open: false, name: '' })}>
              Cancelar
            </button>
            <button className="px-4 py-2 bg-azulMedio hover:brightness-95 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={submitRename} disabled={!renameOpen.name.trim()}>
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPrivacyModal = () => {
    if (!privacyOpen.open) return null;
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setPrivacyOpen({ open: false, v: 'PRIVATE' })}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Cambiar privacidad</h3>
            <button className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100" onClick={() => setPrivacyOpen({ open: false, v: 'PRIVATE' })}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-6 space-y-4">
            <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
              <input
                type="radio"
                name="visibility"
                checked={privacyOpen.v === 'PRIVATE'}
                onChange={() => setPrivacyOpen((s) => ({ ...s, v: 'PRIVATE' }))}
                className="text-azulMedio focus:ring-azulMedio"
              />
              <div>
                <div className="font-medium text-gray-900">Privada</div>
                <div className="text-sm text-gray-600">Solo tú y los usuarios autorizados pueden ver esta base</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
              <input
                type="radio"
                name="visibility"
                checked={privacyOpen.v === 'PUBLIC'}
                onChange={() => setPrivacyOpen((s) => ({ ...s, v: 'PUBLIC' }))}
                className="text-azulMedio focus:ring-azulMedio"
              />
              <div>
                <div className="font-medium text-gray-900">Pública</div>
                <div className="text-sm text-gray-600">Todos los usuarios pueden ver esta base</div>
              </div>
            </label>
          </div>
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
            <button className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors font-medium" onClick={() => setPrivacyOpen({ open: false, v: 'PRIVATE' })}>
              Cancelar
            </button>
            <button className="px-4 py-2 bg-azulMedio hover:brightness-95 text-white rounded-lg font-medium transition-colors" onClick={submitPrivacy}>
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="flex-1 p-6">
      {renderToolbar()}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-azulMedio mx-auto mb-3"></div>
            <div className="text-gray-500">Cargando bases…</div>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          {canCreateHere && (
            <div className="flex flex-col items-center justify-center mb-8">
              <div
                onClick={onCreateBase}
                className="group cursor-pointer bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-200 rounded-xl p-8 hover:border-blue-300 hover:from-blue-100 hover:to-indigo-100 transition-all duration-200 hover:shadow-md max-w-sm w-full"
              >
                <div className="flex flex-col items-center justify-center text-center h-full">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2 text-lg">Crear tu primera base</h3>
                  <p className="text-sm text-gray-600">Comienza desde cero o usa una plantilla</p>
                </div>
              </div>
            </div>
          )}
          {!canCreateHere && (
            <>
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay bases</h3>
              <p className="text-gray-500 max-w-sm mx-auto">No hay bases disponibles en este workspace</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {renderCreateCard()}
            {items.map(renderBaseCard)}
          </div>
          {renderPagination()}
        </>
      )}

      {renderContextMenu()}
      {renderRenameModal()}
      {renderPrivacyModal()}
    </section>
  );
}