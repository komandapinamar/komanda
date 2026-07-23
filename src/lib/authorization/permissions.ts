import type { Role } from "@/db/schema/platform";

export type Section =
  | "estado"
  | "pedidos"
  | "catalog"
  | "configuracion"
  | "integraciones"
  | "members";

const SECTION_PERMISSIONS: Record<Section, Role[]> = {
  estado: ["owner", "admin", "employee"],
  pedidos: ["owner", "admin", "employee"],
  catalog: ["owner", "admin"],
  configuracion: ["owner"],
  integraciones: ["owner"],
  members: ["owner"],
};

export function canAccess(role: Role, section: Section): boolean {
  return SECTION_PERMISSIONS[section].includes(role);
}

export function canWriteCatalog(role: Role): boolean {
  return role === "owner" || role === "admin";
}
