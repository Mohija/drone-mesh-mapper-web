/**
 * User-scoped localStorage wrapper.
 * Keys like 'tracked-drones', 'refresh-rate', 'nofly-layers' are namespaced
 * per user ID to prevent state leaking when switching accounts.
 * Keys like 'theme', 'access_token', 'refresh_token' remain global.
 */

function userKey(key: string): string {
  const userId = localStorage.getItem('current_user_id');
  return userId ? `${key}_${userId}` : key;
}

export function getUserItem(key: string): string | null {
  return localStorage.getItem(userKey(key));
}

export function setUserItem(key: string, value: string): void {
  localStorage.setItem(userKey(key), value);
}

export function removeUserItem(key: string): void {
  localStorage.removeItem(userKey(key));
}
