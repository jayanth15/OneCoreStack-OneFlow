const USER_KEY = "oneflow_user";

export interface CurrentUser {
  id: number;
  username: string;
  role: string; // super_admin | admin | manager | worker
}

export function setCurrentUser(user: CurrentUser): void {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getCurrentUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentUser;
  } catch {
    return null;
  }
}

export function clearCurrentUser(): void {
  sessionStorage.removeItem(USER_KEY);
}

export function isAdmin(): boolean {
  const role = getCurrentUser()?.role;
  return role === "admin" || role === "super_admin";
}

export function isAdminOrAbove(): boolean {
  return isAdmin();
}

export function isSuperAdmin(): boolean {
  return getCurrentUser()?.role === "super_admin";
}

export function isWorker(): boolean {
  return getCurrentUser()?.role === "worker";
}

export function isManager(): boolean {
  return getCurrentUser()?.role === "manager";
}

export function isManagerOrWorker(): boolean {
  const role = getCurrentUser()?.role;
  return role === "manager" || role === "worker";
}
