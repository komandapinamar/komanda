import { cookies } from "next/headers";
import { SessionService } from "@/features/identity/application/session.service";
import { DatabaseSessionRepository } from "@/features/identity/infrastructure/session.repository";
import {
  bearerToken,
  SESSION_COOKIE_NAME,
} from "@/features/identity/web/session-cookie";

export async function sessionTokenFromRequest(request: Request) {
  const cookieStore = await cookies();
  return (
    bearerToken(request) ?? cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null
  );
}

export function coreSessionService() {
  return new SessionService(new DatabaseSessionRepository(), async () => false);
}
