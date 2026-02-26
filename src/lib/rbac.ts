import type { Role } from "./types";

type Permission =
  | "leads:read"
  | "leads:write"
  | "leads:delete"
  | "leads:assign"
  | "contacts:read"
  | "contacts:write"
  | "dialer:use"
  | "settings:read"
  | "settings:write"
  | "analytics:read"
  | "campaigns:read"
  | "campaigns:write"
  | "team:manage"
  | "audit:read"
  | "ingest:manage"
  | "ghost_mode:use";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "leads:read", "leads:write", "leads:delete", "leads:assign",
    "contacts:read", "contacts:write",
    "dialer:use",
    "settings:read", "settings:write",
    "analytics:read",
    "campaigns:read", "campaigns:write",
    "team:manage",
    "audit:read",
    "ingest:manage",
    "ghost_mode:use",
  ],
  agent: [
    "leads:read", "leads:write",
    "contacts:read", "contacts:write",
    "dialer:use",
    "settings:read",
    "analytics:read",
    "campaigns:read",
  ],
  viewer: [
    "leads:read",
    "contacts:read",
    "analytics:read",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Role "${role}" lacks permission "${permission}"`);
  }
}

export function getPermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function canAccessRoute(role: Role, path: string): boolean {
  const routePermissions: Record<string, Permission> = {
    "/settings": "settings:read",
    "/analytics": "analytics:read",
    "/campaigns": "campaigns:read",
    "/dialer": "dialer:use",
  };

  const requiredPermission = routePermissions[path];
  if (!requiredPermission) return true;
  return hasPermission(role, requiredPermission);
}
