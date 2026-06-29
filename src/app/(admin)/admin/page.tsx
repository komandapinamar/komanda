import { redirect } from "next/navigation";
import AdminLoginForm from "@/features/admin-panel/components/AdminLoginForm";
import { getAuthenticatedAdminSession } from "@/features/admin-panel/server/auth.service";

export default async function AdminPage() {
  const adminSession = await getAuthenticatedAdminSession();

  if (adminSession) {
    redirect("/admin/dashboard");
  }

  return (
    <main className="bg-[var(--color-accent-primary)]">
      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md items-center justify-center px-6 py-12 bg-[var(--color-accent-primary)]">

      <AdminLoginForm />

      </div>
    </main>
  );
}
