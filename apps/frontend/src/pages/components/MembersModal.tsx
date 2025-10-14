// apps/frontend/src/pages/components/MembersModal.tsx
import { useEffect, useState, useCallback } from 'react';
import Modal from '../../components/Modal';
import {
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  type MemberRow,
  type MembershipRole,
} from '../../api/members';

type Props = {
  baseId: number;
  open: boolean;
  onClose: () => void;
};

const ROLES: { value: MembershipRole; label: string; description: string }[] = [
  { value: 'VIEWER',    label: 'Lector',       description: 'Puede ver la base pero no editar.' },
  { value: 'COMMENTER', label: 'Comentarista', description: 'Puede ver y comentar.' },
  { value: 'EDITOR',    label: 'Editor',       description: 'Puede editar y gestionar datos.' },
];

export default function MembersModal({ baseId, open, onClose }: Props) {
  // Estado de datos
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Invitaciones
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MembershipRole>('EDITOR');
  const [inviting, setInviting] = useState(false);

  // Carga de miembros al abrir
  useEffect(() => {
    if (!open) return;

    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await listMembers(baseId);
        if (!alive) return;
        setMembers(r.members);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? 'No se pudieron cargar los miembros');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [open, baseId]);

  // Acciones
  const refreshMembers = useCallback(async () => {
    const r = await listMembers(baseId);
    setMembers(r.members);
  }, [baseId]);

  const handleInvite = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) return;

    setInviting(true);
    setError(null);
    try {
      await inviteMember(baseId, { email: trimmed, role: inviteRole });
      setEmail('');
      await refreshMembers();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo enviar la invitación');
    } finally {
      setInviting(false);
    }
  }, [baseId, email, inviteRole, refreshMembers]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && email.trim()) handleInvite();
  }, [email, handleInvite]);

  const handleChangeRole = useCallback(async (memberId: number, role: MembershipRole) => {
    setError(null);
    try {
      await updateMemberRole(baseId, memberId, role);
      setMembers(cur => cur.map(m => m.id === memberId ? { ...m, role } : m));
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cambiar el rol');
    }
  }, [baseId]);

  const handleRemove = useCallback(async (memberId: number) => {
    setError(null);
    try {
      await removeMember(baseId, memberId);
      setMembers(cur => cur.filter(m => m.id !== memberId));
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo quitar el miembro');
    }
  }, [baseId]);

  // Clases de inputs
  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azulMedio focus:border-azulMedio focus:outline-none transition-colors';
  const selectCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-azulMedio focus:border-azulMedio focus:outline-none transition-colors';

  // Render
  const InviteSection = () => (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <h4 className="font-semibold text-gray-900 mb-3">Invitar nuevo miembro</h4>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            className={inputCls}
            type="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={handleKeyPress}
          />
        </div>
        <div className="sm:w-48">
          <select
            className={selectCls}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as MembershipRole)}
          >
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <button
          className="bg-azulMedio hover:brightness-95 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          onClick={handleInvite}
          disabled={inviting || !email.trim()}
        >
          {inviting ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Invitando…
            </span>
          ) : 'Invitar'}
        </button>
      </div>
      <div className="mt-2 text-sm text-gray-600">
        {ROLES.find(r => r.value === inviteRole)?.description}
      </div>
    </div>
  );

  const MembersList = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-azulMedio mx-auto mb-3" />
            <div className="text-gray-500">Cargando miembros…</div>
          </div>
        </div>
      );
    }
    if (members.length === 0) {
      return (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h4 className="text-lg font-medium text-gray-900 mb-2">No hay miembros</h4>
          <p className="text-gray-500 max-w-sm mx-auto">
            Invita a miembros para colaborar en esta base
          </p>
        </div>
      );
    }
    return (
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {members.map(m => (
          <div key={m.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 bg-gradient-to-br from-azulMedio to-azulOscuro rounded-full flex items-center justify-center text-white font-semibold text-sm">
                {(m.user.fullName?.[0] || m.user.email[0]).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{m.user.fullName || 'Usuario sin nombre'}</div>
                <div className="text-sm text-gray-500 truncate">{m.user.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <select
                className={`${selectCls} text-sm`}
                value={m.role}
                onChange={(e) => handleChangeRole(m.id, e.target.value as MembershipRole)}
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button
                className="px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium text-sm"
                onClick={() => handleRemove(m.id)}
                title="Eliminar miembro"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gestión de miembros"
      footer={
        <button
          className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors font-medium"
          onClick={onClose}
        >
          Cerrar
        </button>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        <InviteSection />
        <MembersList />
      </div>
    </Modal>
  );
}