// apps/backend/src/routes/auth.routes.ts
import { Router } from 'express';
import {
  login, logout, me, adminRegister, changePasswordFirstLogin,
} from '../controllers/auth.controller.js';
import {
  requireAuth, requireAuthAllowMustChange,
} from '../middlewares/auth.middleware.js';
import { guardGlobal } from '../permissions/guard.js';
import { loginRateLimiter, forgotPwdRateLimiter } from '../middlewares/rate-limit.middleware.js';
import {
  forgotPasswordRequest,
  resetPasswordWithToken,
  resetPasswordGetHandler,
} from '../controllers/password-reset.controller.js';

const router = Router();

router.post('/login', loginRateLimiter, login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuthAllowMustChange, me);

router.post('/admin/register',
  requireAuth,
  guardGlobal('platform:users:manage'),
  adminRegister
);

router.post('/change-password', requireAuthAllowMustChange, changePasswordFirstLogin);
router.post('/change_password', requireAuthAllowMustChange, changePasswordFirstLogin);

// <<< NUEVO: forgot/reset password >>>
router.post('/forgot-password', forgotPwdRateLimiter, forgotPasswordRequest);
router.post('/reset-password', resetPasswordWithToken);      // consumo vía FE
router.get('/reset-password', resetPasswordGetHandler);      // consumo directo por link

export default router;