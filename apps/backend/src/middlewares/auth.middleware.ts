import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/db.js';
import { verifyJwt } from '../services/security/jwt.service.js';

const COOKIE_NAME = process.env.COOKIE_NAME ?? 'session';

// ===== Tipos =====
type CoreUser = {
  id: number;
  email: string;
  fullName?: string;
  platformRole: 'USER' | 'SYSADMIN';
  isActive: boolean;
  mustChangePassword: boolean;
  canCreateBases: boolean;
};

// ===== Cache LRU simple (memoria local) =====
const AUTH_USER_CACHE_TTL_MS = Number(process.env.AUTH_USER_CACHE_TTL_MS ?? 30_000);
const userCache = new Map<number, { exp: number; user: CoreUser }>();

async function loadUserCore(userId: number): Promise<CoreUser | null> {
  const now = Date.now();
  const hit = userCache.get(userId);
  if (hit && hit.exp > now) return hit.user;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      platformRole: true,
      isActive: true,
      mustChangePassword: true,
      canCreateBases: true,
    },
  });

  if (!user) return null;
  userCache.set(userId, { exp: now + AUTH_USER_CACHE_TTL_MS, user });
  return user;
}

// <<< NUEVO: invalidación explícita del caché de un usuario >>>
export function invalidateAuthUserCache(userId: number) {
  userCache.delete(userId);
}

// Factory para evitar duplicar lógica
function authCore(allowMustChange: boolean) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) {
        res.status(401).json({ ok: false, error: 'No autenticado (sin cookie)' });
        return;
      }

      const payload = verifyJwt<{ sub: string }>(token);
      const userId = Number(payload.sub);
      if (!userId) {
        res.status(401).json({ ok: false, error: 'Token inválido' });
        return;
      }

      const user = await loadUserCore(userId);
      if (!user || !user.isActive) {
        res.status(401).json({ ok: false, error: 'No autorizado' });
        return;
      }

      if (!allowMustChange && user.mustChangePassword) {
        res.status(403).json({
          ok: false,
          error: 'Debes cambiar tu contraseña primero',
          reason: 'MUST_CHANGE_PASSWORD',
        });
        return;
      }

      (req as any).user = user;
      next();
    } catch {
      res.status(401).json({ ok: false, error: 'Token inválido' });
    }
  };
}

export const requireAuth = authCore(false);
export const requireAuthAllowMustChange = authCore(true);

// Helper para controladores
export function getAuthUser<
  T = {
    id: number;
    email: string;
    fullName?: string;
    platformRole: 'USER' | 'SYSADMIN';
    mustChangePassword: boolean;
    canCreateBases: boolean;
  }
>(req: Request): T | undefined {
  return (req as any).user as T | undefined;
}

// Roles
export function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as CoreUser | undefined;
  if (!user) return res.status(401).json({ ok: false, error: 'No autenticado' });
  if (user.platformRole !== 'SYSADMIN') {
    return res.status(403).json({ ok: false, error: 'Solo superusuario' });
  }
  next();
}

export function requireBaseCreator(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as CoreUser | undefined;
  if (!user) return res.status(401).json({ ok: false, error: 'No autenticado' });
  if (user.platformRole === 'SYSADMIN' || user.canCreateBases) return next();
  return res.status(403).json({ ok: false, error: 'No puedes crear bases' });
}