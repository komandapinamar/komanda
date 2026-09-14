import { headers } from "next/headers";
import { redirect } from "next/navigation";

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

  return <>{children}</>;
}