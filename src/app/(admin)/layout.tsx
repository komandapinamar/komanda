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

  return <>
    {children}
    {isAdminLoggedIn ? (
        <footer className="bg-[var(--color-accent-primary)] text-[var(--color-accent-secondary)] underline p-2 text-center">
          <form action={logoutAdmin} className="inline">
            <button type="submit" className="hover:opacity-80 transition-opacity duration-200">
              Cerrar sesion
            </button>
          </form>
        </footer>
    ) : null}
  </>;
}