"use client";

import { FormEvent, useState } from "react";
import { RiUserAddLine, RiDeleteBinLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";

type Member = {
  id: string;
  email: string;
  role: "owner" | "admin" | "employee";
  createdAt?: Date | string;
};

export function MemberManager({
  tenantId,
  initialMembers,
}: {
  tenantId: string;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [error, setError] = useState<string | null>(null);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.title ?? "Error al agregar miembro");
      }
      const member: Member = await res.json();
      setMembers((prev) => {
        const filtered = prev.filter((m) => m.id !== member.id && m.email !== member.email);
        return [...filtered, member];
      });
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  async function changeRole(membershipId: string, newRole: "owner" | "admin" | "employee") {
    setError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.title ?? "Error al cambiar rol");
      }
      setMembers((prev) =>
        prev.map((m) => (m.id === membershipId ? { ...m, role: newRole } : m)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  async function deleteMember(membershipId: string) {
    if (!window.confirm("¿Seguro que querés eliminar a este miembro del restaurante?")) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.title ?? "Error al eliminar miembro");
      }
      setMembers((prev) => prev.filter((m) => m.id !== membershipId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  const inputClass =
    "rounded-2lg border border-border-button-default bg-background-tertiary-default px-3.5 py-2 text-body-regular text-text-primary placeholder:text-text-tertiary";

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-2lg border border-red-500/30 bg-status-rose-background p-3.5 text-body-2-medium text-status-rose-text">
          {error}
        </p>
      ) : null}

      <section className="space-y-5 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-7">
        <div>
          <h2 className="text-title-3-semibold text-text-primary">
            Agregar miembro
          </h2>
          <p className="mt-0.5 text-body-2-regular text-text-secondary">
            Se usa la contraseña inicial solo si el email todavía no existe en Komanda.
          </p>
        </div>

        <form onSubmit={addMember} className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-body-medium text-text-primary">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@ejemplo.com"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-body-medium text-text-primary">
              Contraseña inicial
            </label>
            <div className="relative flex items-center">
              <input
                required
                type={showPassword ? "text" : "password"}
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className={`${inputClass} w-full pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 cursor-pointer text-caption-1-semibold text-text-secondary hover:text-text-primary"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <div className="flex items-end gap-2.5">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-body-medium text-text-primary">Rol</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "employee")}
                className={inputClass}
              >
                <option value="admin">Admin</option>
                <option value="employee">Employee</option>
              </select>
            </div>

            <Button type="submit" leadingIcon={RiUserAddLine}>
              Agregar miembro
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-4 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-7">
        <div>
          <h2 className="text-title-3-semibold text-text-primary">
            Miembros activos
          </h2>
          <p className="mt-0.5 text-body-2-regular text-text-secondary">
            Administrá el rol de cada integrante o revocá su acceso al local.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2lg border border-border-table bg-background-primary-default/50">
          <table className="bui-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Rol</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-body-2-regular text-text-secondary">
                    No hay miembros registrados aún.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="hover:bg-background-primary-hover">
                    <td className="font-medium text-text-primary">{member.email}</td>
                    <td>
                      {member.role === "owner" ? (
                        <Chip variant="caption" color="blue">
                          Owner
                        </Chip>
                      ) : (
                        <select
                          value={member.role}
                          onChange={(e) =>
                            changeRole(member.id, e.target.value as "owner" | "admin" | "employee")
                          }
                          className="rounded-lg border border-border-button-default bg-background-tertiary-default px-2.5 py-1 text-caption-1-semibold text-text-primary"
                        >
                          <option value="admin">Admin</option>
                          <option value="employee">Employee</option>
                        </select>
                      )}
                    </td>
                    <td className="text-right">
                      {member.role !== "owner" ? (
                        <Button
                          type="button"
                          variant="danger"
                          size="xs"
                          leadingIcon={RiDeleteBinLine}
                          onClick={() => deleteMember(member.id)}
                        >
                          Eliminar
                        </Button>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
