import { redirect } from "next/navigation";

export default async function TenantIntegrationsRedirectPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  redirect(`/admin/${tenantId}/settings`);
}
