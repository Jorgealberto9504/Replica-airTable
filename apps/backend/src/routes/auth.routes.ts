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

// POST /auth/login  { email, password }  (con rate limit)
router.post('/login', loginRateLimiter, login);

// POST /auth/logout  (borra cookie)
router.post('/logout', requireAuth, logout);

// GET /auth/me  (usuario autenticado)
router.get('/me', requireAuth, me);

// POST /auth/admin/register  (solo SYSADMIN vía guardGlobal)
router.post(
  '/admin/register',
  requireAuth,
  guardGlobal('platform:users:manage'),
  adminRegister
);

// POST /auth/change-password  (permite cuando mustChangePassword=true)
router.post('/change-password', requireAuthAllowMustChange, changePasswordFirstLogin);

export default router;