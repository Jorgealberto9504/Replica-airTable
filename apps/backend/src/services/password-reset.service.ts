// apps/backend/src/services/password-reset.service.ts
import crypto from 'crypto';
import { prisma } from './db.js';
import { resetUserPasswordAdmin } from './users.service.js';

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL ?? 'http://localhost:8080';
const DEFAULT_TEMP_PASSWORD = process.env.DEFAULT_TEMP_PASSWORD ?? 'Aa12345!';
const RESET_TTL_MIN = Number(process.env.PWD_RESET_TTL_MIN ?? 30);

function sha256(hex: string) {
  return crypto.createHash('sha256').update(hex).digest('hex');
}

export function buildResetLink(rawToken: string) {
  // Link a endpoint GET (conveniente para click directo desde el email)
  return `${BACKEND_PUBLIC_URL}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export async function createPasswordResetToken(emailRaw: string, meta?: { ip?: string; ua?: string }) {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  // invalidar/limpiar tokens previos del usuario (opcional)
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });

  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      ip: meta?.ip,
      userAgent: meta?.ua,
    },
  });

  return { userId: user.id, rawToken: raw, expiresAt };
}

export async function consumeResetTokenAndResetPassword(rawToken: string) {
  const tokenHash = sha256(rawToken);

  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, passwordUpdatedAt: true, isActive: true } } },
  });

  if (!token || !token.user || !token.user.isActive) {
    throw Object.assign(new Error('Token inválido'), { status: 400 });
  }
  if (token.usedAt) {
    throw Object.assign(new Error('Token ya fue usado'), { status: 400 });
  }
  if (token.expiresAt.getTime() < Date.now()) {
    throw Object.assign(new Error('Token expirado'), { status: 400 });
  }
  // Si el usuario cambió su password después de emitir el token, invalídalo
  if (token.user.passwordUpdatedAt && token.user.passwordUpdatedAt > token.createdAt) {
    throw Object.assign(new Error('Token inválido'), { status: 400 });
  }

  // Marcar como usado primero (idempotencia básica)
  await prisma.passwordResetToken.update({
    where: { tokenHash },
    data: { usedAt: new Date() },
  });

  // Reutiliza la lógica admin: setea contraseña por defecto y fuerza mustChangePassword
  await resetUserPasswordAdmin(token.userId, DEFAULT_TEMP_PASSWORD);

  return { userId: token.userId };
}