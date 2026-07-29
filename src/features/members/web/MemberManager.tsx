"use client";

import { FormEvent, useState } from "react";

type Member = {
  id: string;
  email: string;
  role: "owner" | "admin" | "employee";
  status: "active" | "revoked";
  userStatus?: "active" | "pending_verification" | "suspended" | string;
};

export function MemberManager({
  tenantId,
  initialMembers,
}: {
  tenantId: string;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [error, setError] = useState<string | null>(null);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.title ?? "Error adding member");
      }
      const member: Member = await res.json();
      setMembers((prev) => [...prev, member]);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
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
        throw new Error(body.title ?? "Error changing role");
      }
      setMembers((prev) =>
        prev.map((m) => (m.id === membershipId ? { ...m, role: newRole } : m)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    }
  }

  async function revokeMember(membershipId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.title ?? "Error revoking member");
      }
      setMembers((prev) => prev.filter((m) => m.id !== membershipId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    }
  }

  const inputClass =
    "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-md border border-red-700 bg-red-950 p-3 text-sm">
          {error}
        </p>
      ) : null}

      <form onSubmit={addMember} className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "employee")}
            className={inputClass}
          >
            <option value="admin">Admin</option>
            <option value="employee">Employee</option>
          </select>
        </div>
        <button className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950">
          Agregar
        </button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-zinc-400">
            <th className="pb-2 font-medium">Email</th>
            <th className="pb-2 font-medium">Rol</th>
            <th className="pb-2 font-medium">Estado</th>
            <th className="pb-2 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b border-zinc-800">
              <td className="py-2">{member.email}</td>
              <td className="py-2">
                <select
                  value={member.role}
                  onChange={(e) =>
                    changeRole(member.id, e.target.value as "owner" | "admin" | "employee")
                  }
                  className={inputClass}
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="employee">Employee</option>
                </select>
              </td>
              <td className="py-2">
                {member.status === "revoked" ? (
                  <span className="text-red-400">Revocado</span>
                ) : member.userStatus === "pending_verification" ? (
                  <span className="text-amber-400">Pendiente</span>
                ) : (
                  <span className="text-emerald-400">Activo</span>
                )}
              </td>
              <td className="py-2">
                {member.status === "active" && member.role !== "owner" ? (
                  <button
                    type="button"
                    onClick={() => revokeMember(member.id)}
                    className="text-sm text-red-300"
                  >
                    Revocar
                  </button>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
