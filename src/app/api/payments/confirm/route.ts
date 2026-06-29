import { NextResponse } from "next/server";
import {
  confirmMercadoPagoPaymentById,
  type PaymentConfirmationResult,
} from "@/features/shop/payments/server/payment-confirmation.service";

export const runtime = "nodejs";
export const revalidate = 0;

function getStatusCode(result: PaymentConfirmationResult) {
  switch (result.kind) {
    case "error":
      return 500;
    case "missing_attempt":
      return 404;
    default:
      return 200;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get("paymentId")?.trim() ?? "";

  if (!paymentId) {
    return NextResponse.json(
      {
        ok: false,
        error: "paymentId is required.",
      },
      { status: 400 },
    );
  }

  const result = await confirmMercadoPagoPaymentById(paymentId);

  return NextResponse.json(
    {
      ok: result.kind !== "error",
      result,
    },
    { status: getStatusCode(result) },
  );
}
