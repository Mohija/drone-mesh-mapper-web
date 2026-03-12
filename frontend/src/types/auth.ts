export type UserRole = 'super_admin' | 'tenant_admin' | 'user';

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: UserRole;
  tenant_id: string | null;
  tenant_name?: string;
  is_active: boolean;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}
