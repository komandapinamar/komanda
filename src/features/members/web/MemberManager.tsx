"use client";

import { FormEvent, useState } from "react";

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
    "rounded-2xl border border-white/12 bg-[#101013]/90 px-3.5 py-2.5 text-sm text-[#f4f3f1] placeholder:text-[#9b9ba4] outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/15";

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3.5 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      <section className="liquid-prism-ring liquid-glass-card rounded-3xl p-6 sm:p-7 space-y-5">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
            Agregar miembro
          </h2>
          <p className="mt-0.5 text-xs text-[#c2c2cc]">
            Se usa la contraseña inicial solo si el email todavía no existe en Komanda.
          </p>
        </div>

        <form onSubmit={addMember} className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#c2c2cc]">Email</label>
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
            <label className="text-xs font-medium text-[#c2c2cc]">
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
                className="absolute right-3 text-xs font-medium text-[#c2c2cc] hover:text-[#f4f3f1]"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <div className="flex items-end gap-2.5">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-[#c2c2cc]">Rol</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "employee")}
                className={inputClass}
              >
                <option value="admin">Admin</option>
                <option value="employee">Employee</option>
              </select>
            </div>

            <button className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#f4f3f1] px-5 text-xs font-medium text-[#141416] transition hover:bg-white">
              Agregar miembro
            </button>
          </div>
        </form>
      </section>

      <section className="liquid-glass-card rounded-3xl p-6 sm:p-7 space-y-4">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
            Miembros activos
          </h2>
          <p className="mt-0.5 text-xs text-[#c2c2cc]">
            Administrá el rol de cada integrante o revocá su acceso al local.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/12 bg-[#101013]/90">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.03] text-left text-xs uppercase tracking-wider text-[#c2c2cc]">
                <th className="px-5 py-3.5 font-medium">Email</th>
                <th className="px-5 py-3.5 font-medium">Rol</th>
                <th className="px-5 py-3.5 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-xs text-[#c2c2cc]">
                    No hay miembros registrados aún.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="transition hover:bg-white/[0.03]">
                    <td className="px-5 py-3.5 font-medium text-[#f4f3f1]">{member.email}</td>
                    <td className="px-5 py-3.5">
                      {member.role === "owner" ? (
                        <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-[#f4f3f1]">
                          Owner
                        </span>
                      ) : (
                        <select
                          value={member.role}
                          onChange={(e) =>
                            changeRole(member.id, e.target.value as "owner" | "admin" | "employee")
                          }
                          className="rounded-full border border-white/15 bg-[#141416] px-3 py-1 text-xs font-medium text-[#f4f3f1] outline-none"
                        >
                          <option value="admin">Admin</option>
                          <option value="employee">Employee</option>
                        </select>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {member.role !== "owner" ? (
                        <button
                          type="button"
                          onClick={() => deleteMember(member.id)}
                          className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
                        >
                          Eliminar
                        </button>
                      ) : (
                        <span className="text-[#9b9ba4]">—</span>
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
