// apps/backend/src/services/users.service.ts
import { prisma } from './db.js';
import { hashPassword } from './security/password.service.js';
import { Prisma, type PlatformRole } from '@prisma/client';

/** Forma “pública” base de un usuario que solemos exponer al frontend */
export type UserPublic = {
  id: number;
  email: string;
  fullName: string;
  createdAt: Date;
  platformRole: PlatformRole;
  mustChangePassword: boolean;
  canCreateBases: boolean;
};

/** Tipo para administración (incluye isActive) */
export type UserAdmin = {
  id: number;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  canCreateBases: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
};

/* ===========================
   CREATE (usado por /auth)
   =========================== */
export async function createUserAdmin(input: {
  email: string;
  fullName: string;
  password: string;            // temporal
  platformRole?: PlatformRole; // 'USER' | 'SYSADMIN'
  canCreateBases?: boolean;    // flag de creador global
}): Promise<UserPublic> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      email,
      fullName: input.fullName,
      passwordHash,
      platformRole: input.platformRole ?? 'USER',
      isActive: true,
      mustChangePassword: true,
      canCreateBases: !!input.canCreateBases,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      createdAt: true,
      platformRole: true,
      mustChangePassword: true,
      canCreateBases: true,
    },
  });
}

/* ===========================
   LIST (compat antiguo)
   =========================== */
export type UserAdminList = UserAdmin;

export async function listUsers(): Promise<UserAdminList[]> {
  return prisma.user.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      platformRole: true,
      canCreateBases: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
}

/* ==============================================
   ADMIN: Listado con filtros y paginación
   ============================================== */
export async function listUsersAdmin(params: {
  q?: string;
  role?: PlatformRole;
  isActive?: boolean;
  canCreateBases?: boolean;
  page?: number;
  limit?: number;
}) {
  const page = params.page && params.page > 0 ? params.page : 1;
  const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 200) : 20;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    ...(params.role ? { platformRole: params.role } : {}),
    ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    ...(params.canCreateBases !== undefined ? { canCreateBases: params.canCreateBases } : {}),
    ...(params.q
      ? {
          OR: [
            { email: { contains: params.q, mode: 'insensitive' } },
            { fullName: { contains: params.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ platformRole: 'desc' }, { id: 'asc' }],
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        fullName: true,
        platformRole: true,
        canCreateBases: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    users,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/* ===========================
   ADMIN: Get by id
   =========================== */
export async function getUserByIdAdmin(id: number): Promise<UserAdmin | null> {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      platformRole: true,
      canCreateBases: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
}

/* =================================================
   ADMIN: Update (protege “último SYSADMIN”)
   ================================================= */
async function ensureNotLeavingZeroSysadmins(
  targetUserId: number,
  patch: { platformRole?: PlatformRole; isActive?: boolean }
) {
  if (patch.platformRole === undefined && patch.isActive === undefined) return;

  const current = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, platformRole: true, isActive: true },
  });
  if (!current) {
    const err: any = new Error('Usuario no encontrado');
    err.status = 404;
    throw err;
  }

  const willBeSysadmin =
    (patch.platformRole ?? current.platformRole) === 'SYSADMIN' &&
    (patch.isActive ?? current.isActive) === true;

  if (willBeSysadmin) return;

  const otherSysadmins = await prisma.user.count({
    where: {
      id: { not: targetUserId },
      platformRole: 'SYSADMIN',
      isActive: true,
    },
  });

  if (otherSysadmins === 0) {
    const err: any = new Error('No puedes dejar el sistema sin SYSADMIN activo');
    err.status = 409;
    throw err;
  }
}

export async function updateUserAdmin(
  userId: number,
  patch: {
    fullName?: string;
    platformRole?: PlatformRole;
    isActive?: boolean;
    canCreateBases?: boolean;
    mustChangePassword?: boolean;
  }
): Promise<UserAdmin> {
  await ensureNotLeavingZeroSysadmins(userId, {
    platformRole: patch.platformRole,
    isActive: patch.isActive,
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
      ...(patch.platformRole !== undefined ? { platformRole: patch.platformRole } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.canCreateBases !== undefined ? { canCreateBases: patch.canCreateBases } : {}),
      ...(patch.mustChangePassword !== undefined ? { mustChangePassword: patch.mustChangePassword } : {}),
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      platformRole: true,
      canCreateBases: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });

  return updated;
}

/* ===========================
   ADMIN: Reset password
   =========================== */
export async function resetUserPasswordAdmin(
  userId: number,
  newPassword: string
): Promise<UserAdmin> {
  const passwordHash = await hashPassword(newPassword);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      passwordUpdatedAt: new Date(),
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      platformRole: true,
      canCreateBases: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });

  return updated;
}

/* ===========================
   ADMIN: Compat antiguos
   =========================== */
export async function setUserCanCreateBases(userId: number, can: boolean): Promise<UserAdmin> {
  return prisma.user.update({
    where: { id: userId },
    data: { canCreateBases: can },
    select: {
      id: true,
      email: true,
      fullName: true,
      platformRole: true,
      canCreateBases: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
}

export async function findUserByEmail(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
}

export async function getUserForLogin(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      passwordHash: true,
      platformRole: true,
      isActive: true,
      mustChangePassword: true,
      canCreateBases: true,
    },
  });
}

export function isUniqueEmailError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}