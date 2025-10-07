import rateLimit from 'express-rate-limit';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutos
  max: 20,                    // 20 intentos por IP+email
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip ?? 'ip';
    const email = (req.body?.email ?? '').toString().toLowerCase();
    return `${ip}:${email}`;
  },
  message: { ok: false, error: 'Demasiados intentos de login. Intenta más tarde.' },
});

/** Rate limit para solicitudes de “olvidé mi contraseña”. */
export const forgotPwdRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutos
  max: 5,                      // 5 solicitudes por IP+email
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip ?? 'ip';
    const email = (req.body?.email ?? '').toString().toLowerCase();
    return `${ip}:${email}`;
  },
  message: { ok: false, error: 'Demasiadas solicitudes de recuperación. Intenta más tarde.' },
});