import { ZodError } from "zod";
import { NextResponse } from "next/server";
import {
  InvalidOnboardingHandoffError,
  OnboardingHandoffService,
} from "@/features/identity/application/identity-verification.service";
import { onboardingHandoffConsumeSchema } from "@/features/provisioning/domain/provisioning.schemas";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/features/identity/web/session-cookie";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const input = onboardingHandoffConsumeSchema.parse(await request.json());
    const session = await new OnboardingHandoffService().consume({
      ...input,
      metadata: {
        source: "onboarding_handoff",
        userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
    });
    const response = new NextResponse(null, {
      status: 204,
      headers: { "X-Correlation-Id": correlationId },
    });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(),
    );
    return response;
  } catch (error) {
    if (error instanceof ZodError) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        correlationId,
      });
    }
    if (error instanceof InvalidOnboardingHandoffError) {
      return problemResponse({
        status: 409,
        title: "Onboarding handoff unavailable",
        code: "ONBOARDING_HANDOFF_UNAVAILABLE",
        correlationId,
      });
    }
    return problemResponse({
      status: 500,
      title: "Internal Server Error",
      code: "INTERNAL_ERROR",
      correlationId,
    });
  }
}
