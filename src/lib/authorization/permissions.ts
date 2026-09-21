import type { Role } from "@/db/schema/platform";

export type Section =
  | "pedidos"
  | "catalog"
  | "configuracion"
  | "members"
  | "analytics"
  | "promociones";

const SECTION_PERMISSIONS: Record<Section, Role[]> = {
  pedidos: ["owner", "admin", "employee"],
  catalog: ["owner", "admin"],
  configuracion: ["owner"],
  members: ["owner"],
  analytics: ["owner"],
  promociones: ["owner", "admin"],
};

export function canAccess(role: Role, section: Section): boolean {
  return SECTION_PERMISSIONS[section].includes(role);
}

export function canWriteCatalog(role: Role): boolean {
  return role === "owner" || role === "admin";
}
