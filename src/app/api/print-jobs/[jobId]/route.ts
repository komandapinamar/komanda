import { NextResponse } from "next/server";
import {
  markPrintJobFailed,
  markPrintJobPrinted,
} from "@/features/shop/payments/server/print-job.store";
import { verifyPrintServiceRequest } from "@/features/shop/payments/server/print-service-auth";
import { updateCheckoutPaymentAttempt } from "@/features/shop/payments/server/payment.store";

export const runtime = "nodejs";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

type PrintJobUpdatePayload = {
  status?: "printed" | "failed";
  error?: string;
};

function isValidStatus(status: unknown): status is NonNullable<PrintJobUpdatePayload["status"]> {
  return status === "printed" || status === "failed";
}

export async function POST(request: Request, context: RouteContext) {
  const auth = verifyPrintServiceRequest(request);

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });
  }

  const { jobId } = await context.params;
  const body = (await request.json()) as PrintJobUpdatePayload;

  if (!isValidStatus(body.status)) {
    return NextResponse.json(
      { ok: false, error: "status must be either 'printed' or 'failed'." },
      { status: 400 },
    );
  }

  if (body.status === "printed") {
    const job = await markPrintJobPrinted(jobId);

    if (!job) {
      return NextResponse.json({ ok: false, error: "Print job was not found." }, { status: 404 });
    }

    await updateCheckoutPaymentAttempt(job.checkoutPaymentId, {
      printJobId: job.id,
      printStatus: "printed",
      printCompletedAt: job.printedAt,
      lastPrintError: null,
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status: job.status,
      printedAt: job.printedAt,
    });
  }

  const errorMessage = typeof body.error === "string" && body.error.trim()
    ? body.error.trim()
    : "The print worker reported a failed print attempt.";
  const result = await markPrintJobFailed(jobId, errorMessage);

  if (!result) {
    return NextResponse.json({ ok: false, error: "Print job was not found." }, { status: 404 });
  }

  await updateCheckoutPaymentAttempt(result.job.checkoutPaymentId, {
    printJobId: result.job.id,
    printStatus: result.willRetry ? "queued" : "failed",
    lastPrintError: errorMessage,
  });

  return NextResponse.json({
    ok: true,
    jobId: result.job.id,
    status: result.job.status,
    willRetry: result.willRetry,
    nextAttemptAt: result.job.nextAttemptAt,
  });
}
