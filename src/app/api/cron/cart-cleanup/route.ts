import { lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { temporaryCarts } from "@/db/schema";

export const revalidate = 0; // Prevent caching

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_CART_CLEANUP_SECRET;

  if (!cronSecret) {
    return true;
  }

  const authorizationHeader = request.headers.get("authorization");
  const bearerToken = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length)
    : null;

  return bearerToken === cronSecret;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized, set the CRON_CART_CLEANUP_SECRET environment variable." }, { status: 401 });
    }

    const now = new Date();
    const deletedCarts = await db
      .delete(temporaryCarts)
      .where(lte(temporaryCarts.expiresAt, now))
      .returning({ id: temporaryCarts.id });

    return NextResponse.json({
      ok: true,
      deletedCount: deletedCarts.length,
      cleanedAt: now.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while cleaning expired carts.",
      },
      { status: 500 },
    );
  }
}