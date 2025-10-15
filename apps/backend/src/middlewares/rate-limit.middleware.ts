import { rateLimit } from 'express-rate-limit';

/** Limita intentos de login por email (no usamos IP para evitar warnings v7). */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,                  // 20 intentos por email
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = (req.body?.email ?? '').toString().trim().toLowerCase();
    return email || 'anon';
  },
  message: { ok: false, error: 'Demasiados intentos de login. Intenta más tarde.' },
});

/** Limita solicitudes de “olvidé mi contraseña” por email. */
export const forgotPwdRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,                   // 5 solicitudes por email
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = (req.body?.email ?? '').toString().trim().toLowerCase();
    return email || 'anon';
  },
  message: { ok: false, error: 'Demasiadas solicitudes de recuperación. Intenta más tarde.' },
});