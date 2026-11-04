import {cookies, headers} from "next/headers";
import { redirect } from "next/navigation";
import {logoutAdmin} from "@/features/identity/web/logout.action";
import {coreSessionService} from "@/features/identity/web/authenticated-session";
import {SESSION_COOKIE_NAME} from "@/features/identity/web/session-cookie";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenantSlug = (await headers()).get("x-komanda-tenant-slug");

  // Si hay un slug de comercio (ej. negocio.komanda.com), 
  // redirigimos al usuario al menú principal del comercio.
  if (tenantSlug) {
    redirect("/");
  }

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  const isAdminLoggedIn = token
      ? await coreSessionService().resolve(token).then(() => true).catch(() => false)
      : false;

  return (
    <div className="dark bui-admin flex min-h-dvh flex-col bg-background-full text-text-primary antialiased">
      <div className="flex-1">{children}</div>
      {isAdminLoggedIn ? (
        <footer className="border-t border-separator-border bg-background-secondary-default px-4 py-3 text-center">
          <form action={logoutAdmin} className="inline">
            <button
              type="submit"
              className="cursor-pointer rounded-lg px-3 py-1 text-body-2-medium text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
            >
              Cerrar sesion
            </button>
          </form>
        </footer>
      ) : null}
    </div>
  );
}