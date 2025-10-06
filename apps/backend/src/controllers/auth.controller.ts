import type { Request, Response } from 'express';
import { prisma } from '../services/db.js';
import {
  createUserAdmin,
  findUserByEmail,
  isUniqueEmailError,
  getUserForLogin,
} from '../services/users.service.js';
import { checkPassword, hashPassword } from '../services/security/password.service.js';
import { signJwt } from '../services/security/jwt.service.js';
import { getAuthUser, invalidateAuthUserCache } from '../middlewares/auth.middleware.js';
import { isStrongPassword, STRONG_PWD_HELP } from '../services/security/password.rules.js';

// === Config ===
const COOKIE_NAME = process.env.COOKIE_NAME ?? 'session';

type SameSiteOpt = 'lax' | 'strict' | 'none';
function cookieOpts() {
  const sameSiteEnv = (process.env.COOKIE_SAME_SITE ?? '').toLowerCase();
  const sameSite: SameSiteOpt =
    sameSiteEnv === 'none' || sameSiteEnv === 'strict' || sameSiteEnv === 'lax'
      ? (sameSiteEnv as SameSiteOpt)
      : 'none';

  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production' ||
    (process.env.FRONTEND_ORIGIN ?? '').startsWith('https://');

  return { sameSite, secure };
}

function isEmailBasic(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Permite lista de dominios separada por comas o espacios.
 *  Compat: ALLOWED_EMAIL_DOMAIN (singular).
 */
function getAllowedDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS ?? process.env.ALLOWED_EMAIL_DOMAIN ?? '';
  return raw
    .split(/[,\s]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}
function isAllowedDomain(email: string) {
  const list = getAllowedDomains();
  if (list.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return list.includes(domain);
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'email y password son requeridos' });
  }

  const user = await getUserForLogin(email);
  if (!user) return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
  if (!user.isActive) return res.status(403).json({ ok: false, error: 'Cuenta desactivada' });

  const okPass = await checkPassword(password, user.passwordHash);
  if (!okPass) return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

  const token = signJwt({ sub: String(user.id), email: user.email, role: user.platformRole });
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    ...cookieOpts(),
    maxAge: MAX_AGE_MS,
    path: '/',
  });

  return res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      platformRole: user.platformRole,
      mustChangePassword: user.mustChangePassword,
      canCreateBases: user.canCreateBases,
    },
  });
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    ...cookieOpts(),
    path: '/',
  });
  return res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'No autenticado' });
  return res.json({ ok: true, user });
}

export async function adminRegister(req: Request, res: Response) {
  try {
    const { email, fullName, tempPassword, platformRole, canCreateBases } = req.body as {
      email?: string; fullName?: string; tempPassword?: string;
      platformRole?: 'USER' | 'SYSADMIN'; canCreateBases?: boolean;
    };
    if (!email || !fullName || !tempPassword) {
      return res.status(400).json({ ok: false, error: 'email, fullName y tempPassword son requeridos' });
    }
    if (!isEmailBasic(email)) return res.status(400).json({ ok: false, error: 'Email inválido' });
    if (!isAllowedDomain(email)) {
      const allow = getAllowedDomains().join(', ');
      return res.status(403).json({ ok: false, error: `Dominio de email no permitido. Permitidos: ${allow}` });
    }
    if (!isStrongPassword(tempPassword)) return res.status(400).json({ ok: false, error: STRONG_PWD_HELP });

    const exists = await findUserByEmail(email);
    if (exists) return res.status(409).json({ ok: false, error: 'Email ya registrado' });

    const user = await createUserAdmin({
      email, fullName, password: tempPassword,
      platformRole: platformRole ?? 'USER',
      canCreateBases: !!canCreateBases,
    });
    return res.status(201).json({ ok: true, user });
  } catch (e) {
    if (isUniqueEmailError(e)) return res.status(409).json({ ok: false, error: 'Email ya registrado' });
    console.error('[adminRegister] error:', e);
    return res.status(500).json({ ok: false, error: 'Error al registrar usuario' });
  }
}

export async function changePasswordFirstLogin(req: Request, res: Response) {
  const auth = getAuthUser<{ id: number }>(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'No autenticado' });

  const { newPassword, confirm } = req.body as { newPassword?: string; confirm?: string };
  if (!newPassword || !confirm) return res.status(400).json({ ok: false, error: 'Faltan campos' });
  if (newPassword !== confirm) return res.status(400).json({ ok: false, error: 'La confirmación no coincide' });
  if (!isStrongPassword(newPassword)) return res.status(400).json({ ok: false, error: STRONG_PWD_HELP });

  // Evita reutilizar la contraseña actual
  const current = await prisma.user.findUnique({
    where: { id: auth.id },
    select: { id: true, email: true, platformRole: true, mustChangePassword: true, passwordHash: true },
  });
  if (!current) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

  const sameAsOld = await checkPassword(newPassword, current.passwordHash);
  if (sameAsOld) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña debe ser distinta a la actual' });
  }
  if (!current.mustChangePassword) {
    return res.status(409).json({ ok: false, error: 'Este usuario no requiere cambio de contraseña' });
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: current.id },
    data: { passwordHash: newHash, mustChangePassword: false, passwordUpdatedAt: new Date() },
  });

  // <<< NUEVO: invalidar cache del middleware para reflejar mustChangePassword=false ya mismo >>>
  invalidateAuthUserCache(current.id);

  // Renovar cookie de sesión
  const token = signJwt({ sub: String(current.id), email: current.email, role: current.platformRole });
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    ...cookieOpts(),
    maxAge: MAX_AGE_MS,
    path: '/',
  });

  // Devolver el usuario actualizado
  const freshUser = await prisma.user.findUnique({
    where: { id: current.id },
    select: {
      id: true, email: true, fullName: true, platformRole: true,
      mustChangePassword: true, canCreateBases: true
    },
  });

  return res.json({ ok: true, user: freshUser });
}