// apps/backend/src/controllers/password-reset.controller.ts
import type { Request, Response } from 'express';
import { createPasswordResetToken, buildResetLink, consumeResetTokenAndResetPassword } from '../services/password-reset.service.js';
import { sendPasswordResetEmail } from '../services/mailer.js';
import { getAllowedDomains } from './util.allowed-domains.js'; // helper pequeño abajo
import { findUserByEmail } from '../services/users.service.js';

const COOKIE_NAME = process.env.COOKIE_NAME ?? 'session';

/**
 * POST /auth/forgot-password  { email }
 * Responde 200 siempre para evitar enumeración de usuarios.
 */
export async function forgotPasswordRequest(req: Request, res: Response) {
  try {
    const { email } = req.body as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(200).json({ ok: true }); // respuesta uniforme
    }

    // Opcional: respetar dominios permitidos
    const allowed = getAllowedDomains();
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    if (allowed.length && !allowed.includes(domain)) {
      return res.status(200).json({ ok: true }); // respuesta uniforme
    }

    // Solo generamos para usuarios existentes y activos
    const exists = await findUserByEmail(email);
    if (exists) {
      const meta = { ip: req.ip, ua: req.headers['user-agent'] as string | undefined };
      const token = await createPasswordResetToken(email, meta);
      if (token) {
        const link = buildResetLink(token.rawToken);
        try { await sendPasswordResetEmail(email, link); } catch (e) { /* no filtramos */ }
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    // Mantener respuesta uniforme
    return res.json({ ok: true });
  }
}

/**
 * POST /auth/reset-password  { token }
 * Útil si lo quieres consumir desde un FE. Limpia cookie de sesión por seguridad.
 */
export async function resetPasswordWithToken(req: Request, res: Response) {
  try {
    const { token } = req.body as { token?: string };
    if (!token) return res.status(400).json({ ok: false, error: 'token requerido' });

    await consumeResetTokenAndResetPassword(token);

    // limpiar cookie de sesión vigente (si la hubiera)
    res.clearCookie(COOKIE_NAME, { httpOnly: true, path: '/' });

    return res.json({ ok: true });
  } catch (e: any) {
    const status = e?.status ?? 400;
    return res.status(status).json({ ok: false, error: e?.message ?? 'Token inválido' });
  }
}

/**
 * GET /auth/reset-password?token=...
 * Pensado para click directo desde el email; redirige al login con un flag.
 */
export async function resetPasswordGetHandler(req: Request, res: Response) {
  try {
    const token = (req.query.token as string | undefined) ?? '';
    if (!token) return res.status(400).send('token requerido');

    await consumeResetTokenAndResetPassword(token);

    res.clearCookie(COOKIE_NAME, { httpOnly: true, path: '/' });

    const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
    return res.redirect(302, `${FRONTEND_ORIGIN}/login?reset=ok`);
  } catch {
    const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
    return res.redirect(302, `${FRONTEND_ORIGIN}/login?reset=fail`);
  }
}