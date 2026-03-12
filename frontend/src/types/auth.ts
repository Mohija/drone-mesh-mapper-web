export type UserRole = 'super_admin' | 'tenant_admin' | 'user';

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: UserRole;
  effective_role?: UserRole;
  tenant_id: string | null;
  tenant_name?: string;
  is_active: boolean;
  tenants?: TenantInfo[];
}

export interface TenantInfo {
  id: string;
  name: string;
  display_name: string;
  is_active?: boolean;
  membership_role?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
  tenants?: TenantInfo[];
}
