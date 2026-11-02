import { cookies } from "next/headers";
import BusinessRegistrationWizard from "@/features/identity/web/BusinessRegistrationWizard";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";

export default async function RegisterPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  let authenticatedEmail: string | undefined;
  if (token) {
    try {
      authenticatedEmail = (await coreSessionService().resolve(token)).email;
    } catch {
      // Expired or invalid session proceeds to register
    }
  }

  return (
    <main className="flex min-h-[calc(100dvh-4rem)] flex-col justify-center bg-background-full px-4 py-12 text-text-primary sm:px-6 lg:px-8">
      <BusinessRegistrationWizard authenticatedEmail={authenticatedEmail} />
    </main>
  );
}
