// apps/backend/src/permissions/context.ts
import type { Request } from 'express';
import { prisma } from '../services/db.js';
import { getAuthUser } from '../middlewares/auth.middleware.js';
import type { PermissionContext } from './types.js';

export async function buildPermissionContext(req: Request, baseId: number): Promise<PermissionContext> {
  const me = getAuthUser<{
    id: number;
    platformRole: 'USER' | 'SYSADMIN';
    canCreateBases?: boolean;
  }>(req);

  if (!me) {
    throw Object.assign(new Error('No autenticado'), { status: 401 });
  }

  // 1) Trae la base (owner + visibilidad)
  const base = await prisma.base.findUnique({
    where: { id: baseId },
    select: {
      id: true,
      ownerId: true,
      visibility: true, // 'PUBLIC' | 'PRIVATE'
    },
  });
  if (!base) {
    throw Object.assign(new Error('Base no encontrada'), { status: 404 });
  }

  // 2) Trae la membresía por índice único (baseId,userId)
  //    (Más seguro/eficiente que via "members: { take: 1 }")
  const membership = await prisma.baseMember.findUnique({
    where: { baseId_userId: { baseId, userId: me.id } },
    select: { role: true },
  });

  const ctx: PermissionContext = {
    userId: me.id,
    platformRole: me.platformRole,
    canCreateBases: !!me.canCreateBases,

    baseId: base.id,
    baseVisibility: base.visibility, // enum del schema: 'PUBLIC' | 'PRIVATE'
    isOwner: base.ownerId === me.id,
    membershipRole: membership?.role ?? null,
  };

  return ctx;
}