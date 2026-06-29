import { NextResponse } from "next/server";
import { claimNextPrintJob } from "@/features/shop/payments/server/print-job.store";
import { verifyPrintServiceRequest } from "@/features/shop/payments/server/print-service-auth";
import { updateCheckoutPaymentAttempt } from "@/features/shop/payments/server/payment.store";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(request: Request) {
  const auth = verifyPrintServiceRequest(request);

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });
  }

  const job = await claimNextPrintJob();

  if (!job) {
    return new NextResponse(null, { status: 204 });
  }

  await updateCheckoutPaymentAttempt(job.checkoutPaymentId, {
    printJobId: job.id,
    printStatus: "processing",
    printRequestedAt: job.createdAt,
    lastPrintError: null,
  });

  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      orderId: job.orderId,
      checkoutPaymentId: job.checkoutPaymentId,
      paymentId: job.paymentId,
      attemptCount: job.attemptCount,
      payload: job.payload,
    },
  });
}
