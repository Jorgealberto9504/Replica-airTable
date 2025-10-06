// apps/backend/src/routes/auth.routes.ts
import { Router } from 'express';
import {
  login,
  logout,
  me,
  adminRegister,
  changePasswordFirstLogin,
} from '../controllers/auth.controller.js';
import {
  requireAuth,
  requireAuthAllowMustChange,
} from '../middlewares/auth.middleware.js';
import { guardGlobal } from '../permissions/guard.js';
import { loginRateLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

/** LOGIN con rate limit */
router.post('/login', loginRateLimiter, login);

/** LOGOUT (requiere sesión válida) */
router.post('/logout', requireAuth, logout);

/**
 * /auth/me debe responder 200 tanto si el usuario debe cambiar contraseña
 * como si no; así el FE puede leer `mustChangePassword` y decidir enviar
 * al flujo de cambio de contraseña sin romper la sesión.
 */
router.get('/me', requireAuthAllowMustChange, me);

/** Alta por SYSADMIN (protección por guard) */
router.post(
  '/admin/register',
  requireAuth,
  guardGlobal('platform:users:manage'),
  adminRegister
);

/**
 * Cambio de contraseña del primer login.
 * Permitimos ambos paths por compatibilidad: kebab-case y snake_case.
 * Se permite acceder aunque `mustChangePassword` sea true.
 */
router.post('/change-password', requireAuthAllowMustChange, changePasswordFirstLogin);
router.post('/change_password', requireAuthAllowMustChange, changePasswordFirstLogin);

export default router;