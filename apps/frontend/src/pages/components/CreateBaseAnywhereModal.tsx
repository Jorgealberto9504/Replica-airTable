// apps/frontend/src/pages/components/CreateBaseAnywhereModal.tsx
// Crear base en cualquier workspace usando el Modal genérico con Tailwind.
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { listMyWorkspaces, createBaseInWorkspace } from '../../api/workspaces';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

type WS = { id: number; name: string };

export default function CreateBaseAnywhereModal({ open, onClose, onCreated }: Props) {
  const [workspaces, setWorkspaces] = useState<WS[]>([]);
  const [wsId, setWsId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [submitting, setSubmitting] = useState(false);
  const [loadingWs, setLoadingWs] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Cargar workspaces cuando se abre
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setLoadingWs(true);
    (async () => {
      try {
        const r = await listMyWorkspaces();
        const list = r.workspaces ?? [];
        setWorkspaces(list);
        setWsId(list[0]?.id ?? null);
      } catch (e: any) {
        setWorkspaces([]);
        setWsId(null);
        setErr(e?.message ?? 'No se pudieron cargar los workspaces');
      } finally {
        setLoadingWs(false);
      }
    })();
  }, [open]);

  // Limpiar al cerrar
  useEffect(() => {
    if (!open) {
      setName('');
      setVisibility('PRIVATE');
      setSubmitting(false);
      setErr(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!wsId || !name.trim()) return;

    setSubmitting(true);
    try {
      await createBaseInWorkspace(wsId, { name: name.trim(), visibility });
      onCreated?.();
      // reset básico y cerrar
      setName('');
      setVisibility('PRIVATE');
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'No se pudo crear la base');
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azulMedio focus:border-azulMedio focus:outline-none transition-colors';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva base"
      footer={
        <>
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="create-base-anywhere-form"
            className="px-4 py-2 rounded-lg bg-azulMedio text-white font-medium hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting || !name.trim() || !wsId}
          >
            {submitting ? 'Creando…' : 'Crear'}
          </button>
        </>
      }
    >
      <form id="create-base-anywhere-form" onSubmit={handleSubmit} className="space-y-4">
        {err && (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 text-sm">
            {err}
          </div>
        )}

        {/* Workspace */}
        <div className="flex flex-col">
          <label htmlFor="ws" className="text-sm font-medium text-gray-700 mb-1">
            Workspace
          </label>
          <select
            id="ws"
            className={inputCls}
            value={wsId ?? ''}
            onChange={(e) => setWsId(Number(e.target.value) || null)}
            disabled={loadingWs || (workspaces.length === 0)}
          >
            {workspaces.length === 0 ? (
              <option value="">No hay workspaces disponibles</option>
            ) : (
              workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))
            )}
          </select>
          {loadingWs && <p className="text-xs text-gray-500 mt-1">Cargando workspaces…</p>}
        </div>

        {/* Nombre */}
        <div className="flex flex-col">
          <label htmlFor="name" className="text-sm font-medium text-gray-700 mb-1">
            Nombre
          </label>
          <input
            id="name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CRM, Inventario, Proyectos…"
            autoFocus
          />
        </div>

        {/* Visibilidad */}
        <div className="flex flex-col">
          <label htmlFor="vis" className="text-sm font-medium text-gray-700 mb-1">
            Visibilidad
          </label>
          <select
            id="vis"
            className={inputCls}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE')}
          >
            <option value="PRIVATE">PRIVATE</option>
            <option value="PUBLIC">PUBLIC</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {visibility === 'PUBLIC'
              ? 'Todos los usuarios pueden ver esta base.'
              : 'Solo tú y usuarios autorizados podrán verla.'}
          </p>
        </div>
      </form>
    </Modal>
  );
}