const USER_KEY = "oneflow_user";

export const ALL_INVENTORY_TYPES = [
  "raw_material",
  "finished_good",
  "semi_finished",
  "spare",
  "consumable",
] as const;

export type InventoryType = (typeof ALL_INVENTORY_TYPES)[number];

export const INVENTORY_TYPE_LABELS: Record<InventoryType, string> = {
  raw_material:   "Raw Materials",
  finished_good:  "Finished Goods",
  semi_finished:  "Semi-Finished",
  spare:          "Spares",
  consumable:     "Consumables",
};

export interface CurrentUser {
  id: number;
  username: string;
  role: string; // super_admin | admin | manager | worker
  inventory_access: string[]; // empty = all types allowed
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

/**
 * Returns true if the current user may access the given inventory type.
 * - Admins/super_admins always have access to everything.
 * - Managers/workers: if inventory_access is empty → all types allowed (backwards-compat);
 *   otherwise access is limited to the listed types.
 */
export function canAccessInventory(type: string): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (!user.inventory_access || user.inventory_access.length === 0) return true;
  return user.inventory_access.includes(type);
}
