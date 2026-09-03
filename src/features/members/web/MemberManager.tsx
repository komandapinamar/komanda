"use client";

import { FormEvent, useState } from "react";

type Member = {
  id: string;
  email: string;
  role: "owner" | "admin" | "employee";
  password?: string | null;
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  function copyPassword(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const inputClass =
    "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-400 focus:outline-none";

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-md border border-red-700 bg-red-950/60 p-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <form onSubmit={addMember} className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-400">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@ejemplo.com"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-400">Contraseña</label>
          <div className="relative flex items-center">
            <input
              required
              type={showPassword ? "text" : "password"}
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className={`${inputClass} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-2 text-xs text-zinc-400 hover:text-zinc-200"
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-400">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "employee")}
            className={inputClass}
          >
            <option value="admin">Admin</option>
            <option value="employee">Employee</option>
          </select>
        </div>

        <button className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 transition">
          Agregar miembro
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-zinc-400">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Contraseña</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {members.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                  No hay miembros registrados aún.
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id} className="hover:bg-zinc-900/30 transition">
                  <td className="px-4 py-3 font-medium text-zinc-200">{member.email}</td>
                  <td className="px-4 py-3">
                    {member.role === "owner" ? (
                      <span className="rounded bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-400">
                        Owner
                      </span>
                    ) : (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          changeRole(member.id, e.target.value as "owner" | "admin" | "employee")
                        }
                        className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                      >
                        <option value="admin">Admin</option>
                        <option value="employee">Employee</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {member.password ? (
                      <div className="flex items-center gap-2">
                        <code className="rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-xs text-amber-300">
                          {member.password}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyPassword(member.id, member.password!)}
                          className="text-xs text-zinc-400 hover:text-zinc-200"
                        >
                          {copiedId === member.id ? "Copiado!" : "Copiar"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-500 font-mono">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {member.role !== "owner" ? (
                      <button
                        type="button"
                        onClick={() => deleteMember(member.id)}
                        className="text-sm font-medium text-red-400 hover:text-red-300 transition"
                      >
                        Eliminar
                      </button>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
