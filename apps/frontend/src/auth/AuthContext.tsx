// apps/frontend/src/auth/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { fetchMe, doLogout } from '../api/auth';
import { postJSON, HTTPError } from '../api/http';

export type PlatformRole = 'USER' | 'SYSADMIN';
export type AuthUser = {
  id: number;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  mustChangePassword: boolean;
  canCreateBases?: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Carga inicial
  useEffect(() => {
    (async () => {
      try {
        const me = await fetchMe();
        setUser(me.user ?? null);
        setMustChangePassword(Boolean(me.user?.mustChangePassword));
      } catch (e) {
        if (e instanceof HTTPError && e.status === 403 && e.data?.reason === 'MUST_CHANGE_PASSWORD') {
          setUser(null);
          setMustChangePassword(true);
        } else {
          setUser(null);
          setMustChangePassword(false);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const resp = await postJSON<{ ok: boolean; user?: AuthUser }>('/auth/login', {
      email: email.trim(),
      password: password.trim(),
    });
    if (!resp.ok || !resp.user) throw new Error('Credenciales inválidas');
    setUser(resp.user);
    setMustChangePassword(Boolean(resp.user.mustChangePassword));
    return resp.user;
  }

  async function logout() {
    await doLogout();
    setUser(null);
    setMustChangePassword(false);
  }

  async function refresh() {
    setLoading(true);
    try {
      const me = await fetchMe();
      setUser(me.user ?? null);
      setMustChangePassword(Boolean(me.user?.mustChangePassword));
    } catch (e) {
      if (e instanceof HTTPError && e.status === 403 && e.data?.reason === 'MUST_CHANGE_PASSWORD') {
        setUser(null);
        setMustChangePassword(true);
      } else {
        setUser(null);
        setMustChangePassword(false);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, mustChangePassword, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}