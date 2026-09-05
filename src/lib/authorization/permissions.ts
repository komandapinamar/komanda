import type { Role } from "@/db/schema/platform";

export type Section =
  | "estado"
  | "pedidos"
  | "catalog"
  | "configuracion"
  | "integraciones"
  | "members"
  | "analytics";

const SECTION_PERMISSIONS: Record<Section, Role[]> = {
  estado: ["owner"],
  pedidos: ["owner", "admin", "employee"],
  catalog: ["owner", "admin"],
  configuracion: ["owner"],
  integraciones: ["owner"],
  members: ["owner"],
  analytics: ["owner", "admin"],
};

export function canAccess(role: Role, section: Section): boolean {
  return SECTION_PERMISSIONS[section].includes(role);
}

export function canWriteCatalog(role: Role): boolean {
  return role === "owner" || role === "admin";
}
