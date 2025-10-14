// apps/frontend/src/pages/components/CreateWorkspaceModal.tsx
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { createWorkspace } from '../../api/workspaces';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

export default function CreateWorkspaceModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset limpio al cerrar
  useEffect(() => {
    if (!open) {
      setName('');
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const inputCls =
    'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azulMedio focus:border-azulMedio focus:outline-none transition-colors';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await createWorkspace({ name: name.trim() });
      const ws = res?.workspace;
      if (!ws) throw new Error('No se recibió el workspace del servidor');

      // Notificar creación (tu comportamiento original)
      window.dispatchEvent(new CustomEvent('workspace:created', { detail: ws }));

      onCreated?.();
      onClose();
      setName('');
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear el workspace');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo workspace"
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
            form="create-workspace-form"
            className="px-4 py-2 rounded-lg bg-azulMedio text-white font-medium hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting || !name.trim()}
          >
            {submitting ? 'Creando…' : 'Crear'}
          </button>
        </>
      }
    >
      <form id="create-workspace-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col">
          <label htmlFor="wsName" className="text-sm font-medium text-gray-700 mb-1">
            Nombre
          </label>
          <input
            id="wsName"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Equipo de Marketing"
            autoFocus
          />
        </div>
      </form>
    </Modal>
  );
}