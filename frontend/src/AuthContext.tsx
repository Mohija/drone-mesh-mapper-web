import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, TenantInfo, UserRole } from './types/auth';
import { login as apiLogin, fetchCurrentUser, switchTenant as apiSwitchTenant } from './api';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Effective role for the current tenant (may differ from user.role) */
  effectiveRole: UserRole | null;
  /** List of tenants the user has access to */
  tenants: TenantInfo[];
  /** Currently active tenant ID */
  currentTenantId: string | null;
  login: (username: string, password: string, tenantId?: string) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: string) => Promise<void>;
  /** Re-fetch user info + tenant list from backend */
  refreshUser: () => Promise<void>;
  /** Check if current user can perform admin actions (tenant_admin+) */
  canManage: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  effectiveRole: null,
  tenants: [],
  currentTenantId: null,
  login: async () => {},
  logout: () => {},
  switchTenant: async () => {},
  refreshUser: async () => {},
  canManage: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);

  const effectiveRole = user?.effective_role || user?.role || null;
  const currentTenantId = user?.tenant_id || null;
  const canManage = effectiveRole === 'super_admin' || effectiveRole === 'tenant_admin';

  // On mount: check for existing token and validate
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetchCurrentUser()
      .then(u => {
        localStorage.setItem('current_user_id', u.id);
        setUser(u);
        if (u.tenants) setTenants(u.tenants);
      })
      .catch(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Listen for auth:logout events from authFetch
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setTenants([]);
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  const login = useCallback(async (username: string, password: string, tenantId?: string) => {
    const data = await apiLogin(username, password, tenantId);
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('current_user_id', data.user.id);
    setUser(data.user);
    if (data.tenants) setTenants(data.tenants);
  }, []);

  const switchTenant = useCallback(async (tenantId: string) => {
    const data = await apiSwitchTenant(tenantId);
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    setUser(data.user);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const u = await fetchCurrentUser();
      setUser(u);
      if (u.tenants) setTenants(u.tenants);
    } catch { /* silent */ }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_user_id');
    setUser(null);
    setTenants([]);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: user !== null,
      isLoading,
      effectiveRole,
      tenants,
      currentTenantId,
      login,
      logout,
      switchTenant,
      refreshUser,
      canManage,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
