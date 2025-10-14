// apps/frontend/src/pages/components/MembersPanel.tsx
// -----------------------------------------------------------------------------
// Panel de miembros (lado derecho). Sin estilos inline.
// -----------------------------------------------------------------------------
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  type MemberRow,
  type MembershipRole,
} from '../../api/members';
import { confirmToast } from '../../ui/confirmToast';

type Props = {
  baseId: number;
  canManage: boolean;
};

const ROLES: MembershipRole[] = ['VIEWER', 'COMMENTER', 'EDITOR'];

function isEmailBasic(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function MembersPanel({ baseId, canManage }: Props) {
  const [items, setItems] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MembershipRole>('EDITOR');
  const [inviting, setInviting] = useState(false);

  const inviteValid = useMemo(() => isEmailBasic(inviteEmail), [inviteEmail]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await listMembers(baseId);
      setItems(r.members);
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudieron cargar los miembros');
    } finally {
      setLoading(false);
    }
  }, [baseId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await listMembers(baseId);
        if (!alive) return;
        setItems(r.members);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? 'No se pudieron cargar los miembros');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [baseId]);

  const handleInvite = useCallback(async () => {
    if (!inviteValid || inviting) return;
    setErr(null);
    setInviting(true);
    try {
      await inviteMember(baseId, { email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail('');
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo invitar');
    } finally {
      setInviting(false);
    }
  }, [baseId, inviteEmail, inviteRole, inviteValid, inviting, load]);

  const handleInviteKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && inviteValid && !inviting) {
        e.preventDefault();
        handleInvite();
      }
    },
    [inviteValid, inviting, handleInvite]
  );

  const handleChangeRole = useCallback(
    async (memberId: number, role: MembershipRole) => {
      setErr(null);
      try {
        await updateMemberRole(baseId, memberId, role);
        setItems(xs => xs.map(m => (m.id === memberId ? { ...m, role } : m)));
      } catch (e: any) {
        setErr(e?.message ?? 'No se pudo cambiar el rol');
      }
    },
    [baseId]
  );

  const handleRemove = useCallback(
    async (memberId: number) => {
      const m = items.find(x => x.id === memberId);
      const ok = await confirmToast({
        title: 'Quitar miembro',
        body: <>¿Quitar a <b>{m?.user.fullName || m?.user.email}</b> de esta base?</>,
        confirmText: 'Quitar',
        cancelText: 'Cancelar',
        danger: true,
      });
      if (!ok) return;

      setErr(null);
      try {
        await removeMember(baseId, memberId);
        setItems(xs => xs.filter(m => m.id !== memberId));
      } catch (e: any) {
        setErr(e?.message ?? 'No se pudo quitar al miembro');
      }
    },
    [baseId, items]
  );

  return (
    <section className="card members-panel" aria-labelledby="members-title">
      <h3 id="members-title" className="section-title m-0 mb-3">Miembros</h3>

      {err && (
        <div className="alert-error mb-3" role="alert" aria-live="polite">
          {err}
        </div>
      )}

      {canManage && (
        <div className="invite-row">
          <input
            className="input flex-1"
            type="email"
            placeholder="correo@ejemplo.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={handleInviteKey}
            aria-invalid={inviteEmail.length > 0 && !inviteValid}
          />
          <select
            className="select"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as MembershipRole)}
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            className="btn-primary"
            onClick={handleInvite}
            disabled={!inviteValid || inviting}
            title={!inviteValid && inviteEmail ? 'Email inválido' : undefined}
          >
            {inviting ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Invitando…
              </span>
            ) : (
              'Invitar'
            )}
          </button>
        </div>
      )}

      {loading ? (
        <div className="muted">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="muted">No hay miembros</div>
      ) : (
        <div className="members-list">
          {items.map(m => (
            <div key={m.id} className={`member-row${canManage ? ' has-actions' : ''}`}>
              <div className="member-user">
                <div className="member-name">{m.user.fullName || 'Usuario'}</div>
                <div className="member-email">{m.user.email}</div>
              </div>

              {canManage ? (
                <>
                  <select
                    className="select"
                    value={m.role}
                    onChange={e => handleChangeRole(m.id, e.target.value as MembershipRole)}
                    aria-label={`Cambiar rol de ${m.user.fullName || m.user.email}`}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    className="btn"
                    onClick={() => handleRemove(m.id)}
                    title="Quitar"
                    aria-label={`Quitar a ${m.user.fullName || m.user.email}`}
                  >
                    Quitar
                  </button>
                </>
              ) : (
                <span className="role-chip" aria-label={`Rol: ${m.role}`}>{m.role}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}