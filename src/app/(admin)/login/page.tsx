import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import AdminLoginForm from "@/features/identity/web/AdminLoginForm";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";

export default async function AdminPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    try {
      await coreSessionService().listTenants(token);
      redirect("/admin/select-business");
    } catch {
      // Expired sessions are treated as anonymous.
    }
  }

  return (
    <main className="bg-background-full">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md items-center justify-center px-4 py-12 sm:px-6">
        <AdminLoginForm />
      </div>
    </main>
  );
}
