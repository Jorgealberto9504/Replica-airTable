// apps/frontend/src/pages/components/CreateBaseModal.tsx
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { createBaseInWorkspace } from '../../api/workspaces';

type Props = {
  open: boolean;
  workspaceId: number | null;
  onClose: () => void;
  onCreated?: () => void;
};

export default function CreateBaseModal({ open, workspaceId, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset limpio al cerrar
  useEffect(() => {
    if (!open) {
      setName('');
      setVisibility('PRIVATE');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const inputCls =
    'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azulMedio focus:border-azulMedio focus:outline-none transition-colors';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await createBaseInWorkspace(workspaceId, {
        name: name.trim(),
        visibility,
      });
      onCreated?.();
      onClose();
      setName('');
      setVisibility('PRIVATE');
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear la base');
    } finally {
      setSubmitting(false);
    }
  }

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
            form="create-base-form"
            className="px-4 py-2 rounded-lg bg-azulMedio text-white font-medium hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting || !name.trim() || !workspaceId}
          >
            {submitting ? 'Creando…' : 'Crear'}
          </button>
        </>
      }
    >
      <form id="create-base-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 text-sm">
            {error}
          </div>
        )}

        {/* Nombre */}
        <div className="flex flex-col">
          <label htmlFor="baseName" className="text-sm font-medium text-gray-700 mb-1">
            Nombre
          </label>
          <input
            id="baseName"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CRM, Inventario, Proyectos…"
            autoFocus
          />
        </div>

        {/* Visibilidad */}
        <div className="flex flex-col">
          <label htmlFor="baseVisibility" className="text-sm font-medium text-gray-700 mb-1">
            Visibilidad
          </label>
          <select
            id="baseVisibility"
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