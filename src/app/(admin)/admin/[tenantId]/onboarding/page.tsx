import { redirect } from "next/navigation";

export default async function TenantOnboardingRedirectPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  redirect(`/admin/${tenantId}/settings`);
}
