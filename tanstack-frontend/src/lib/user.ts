import { apiFetchJson } from "./api";

const USER_KEY = "oneflow_user";

export const ALL_INVENTORY_TYPES = [
  "raw_material",
  "finished_good",
  "semi_finished",
  "spare",
  "consumable",
  "attachment",
  "weeder",
] as const;

export type InventoryType = (typeof ALL_INVENTORY_TYPES)[number];

export const INVENTORY_TYPE_LABELS: Record<InventoryType, string> = {
  raw_material:   "Raw Materials",
  finished_good:  "Finished Goods",
  semi_finished:  "Semi-Finished",
  spare:          "Spares",
  consumable:     "Consumables",
  attachment:     "Attachments",
  weeder:         "Weeders",
};

export interface CurrentUser {
  id: number;
  username: string;
  role: string; // super_admin | admin | manager | worker
  inventory_access: string[];   // empty = all types allowed
  inventory_edit: string[];     // empty = all types they can view; admin always has full edit
  request_departments: number[]; // empty = all departments
  request_inventory: string[];  // empty = all inventory types
  grn_access?: boolean;
  dispatch_access?: boolean;
  gate_pass_access?: boolean;
  purchase_access?: boolean;
  photo_base64?: string | null;
  department_codes?: string[];  // codes of departments user belongs to
  department_names?: string[];  // full names of departments user belongs to
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

export async function refreshCurrentUser(): Promise<CurrentUser | null> {
  if (typeof window === "undefined" || !getCurrentUser()) return null;
  try {
    const me = await apiFetchJson<CurrentUser>("/api/v1/auth/me");
    const user: CurrentUser = {
      ...me,
      inventory_access: me.inventory_access ?? [],
      inventory_edit: me.inventory_edit ?? [],
      request_departments: me.request_departments ?? [],
      request_inventory: me.request_inventory ?? [],
      grn_access: me.grn_access ?? false,
      dispatch_access: me.dispatch_access ?? false,
      gate_pass_access: me.gate_pass_access ?? false,
      purchase_access: me.purchase_access ?? false,
      department_codes: me.department_codes ?? [],
      department_names: me.department_names ?? [],
    };
    setCurrentUser(user);
    return user;
  } catch {
    return getCurrentUser();
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

/**
 * Returns true if the current user may edit (add/update/remove items) in the
 * given inventory type.
 * - Admins/super_admins always have full edit access.
 * - Managers/workers: must have an explicit grant in inventory_edit.
 *   Empty array (no grant given) = NO edit access.
 */
export function canEditInventory(type: string): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (!user.inventory_edit || user.inventory_edit.length === 0) return false;
  return user.inventory_edit.includes(type);
}

/**
 * Returns true if the current user may raise requests from the given department.
 * Admins always pass. Empty array = all departments allowed.
 */
export function canRequestFromDept(deptId: number): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (!user.request_departments || user.request_departments.length === 0) return true;
  return user.request_departments.includes(deptId);
}

/**
 * Returns true if the current user may raise requests targeting the given
 * inventory type. Admins always pass. Empty array = all types allowed.
 */
export function canRequestInventory(type: string): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (!user.request_inventory || user.request_inventory.length === 0) return true;
  return user.request_inventory.includes(type);
}
