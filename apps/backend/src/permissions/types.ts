import type { BaseRole, PlatformRole } from '@prisma/client';

export type Action =
  | 'records:read'
  | 'records:create'
  | 'records:update'
  | 'records:delete'
  | 'base:view'
  | 'comments:create'
  | 'schema:manage'
  | 'members:manage'
  | 'base:delete'
  | 'base:visibility'
  | 'bases:create'
  | 'platform:users:manage';

export type PermissionContext = {
  userId: number;
  platformRole: PlatformRole;          // 'USER' | 'SYSADMIN'
  canCreateBases: boolean;

  baseId: number;
  baseVisibility: 'PUBLIC' | 'PRIVATE' | 'SHARED'; // 👈 añade SHARED si existe en tu schema

  isOwner: boolean;
  membershipRole?: BaseRole | null;    // 'EDITOR' | 'COMMENTER' | 'VIEWER'
};

const BASE_ROLE_RANK: Record<BaseRole, number> = {
  EDITOR: 3,
  COMMENTER: 2,
  VIEWER: 1,
};

export function isRoleAtLeast(a: BaseRole, b: BaseRole): boolean {
  return BASE_ROLE_RANK[a] >= BASE_ROLE_RANK[b];
}

export function isSysadmin(ctx: Pick<PermissionContext, 'platformRole'>): boolean {
  return ctx.platformRole === 'SYSADMIN';
}

export function resolveEffectiveBaseRole(ctx: PermissionContext): BaseRole | undefined {
  if (isSysadmin(ctx)) return 'EDITOR';
  if (ctx.isOwner) return 'EDITOR';
  if (ctx.membershipRole) return ctx.membershipRole;
  if (ctx.baseVisibility === 'PUBLIC') return 'VIEWER';
  return undefined;
}