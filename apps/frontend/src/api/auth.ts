// apps/frontend/src/api/auth.ts
import { getJSON, postJSON } from './http';

export type MeResp = {
  ok: boolean;
  user?: {
    id: number;
    email: string;
    fullName: string;
    platformRole: 'USER' | 'SYSADMIN';
    mustChangePassword: boolean;
    canCreateBases?: boolean;
  };
};

export function fetchMe() {
  return getJSON<MeResp>('/auth/me');
}

export function doLogout() {
  return postJSON<{ ok: boolean }>('/auth/logout', {});
}

// Admin
export function adminRegisterUser(input: {
  email: string;
  fullName: string;
  tempPassword: string;
  platformRole?: 'USER' | 'SYSADMIN';
  canCreateBases?: boolean;
}) {
  return postJSON<{ ok: boolean; user?: any }>('/auth/admin/register', input);
}

// Cambio de contraseña (primer login)
export function changePasswordFirstLogin(input: {
  newPassword: string;
  confirm: string;
}) {
  return postJSON<{ ok: boolean }>('/auth/change-password', input);
}

// <<< NUEVO >>> Solicitud de restablecimiento (envía email con link)
export function forgotPassword(email: string) {
  return postJSON<{ ok: boolean }>('/auth/forgot-password', { email });
}