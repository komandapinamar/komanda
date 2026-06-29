import { NextResponse } from "next/server";
import type { CreateOrderPayload } from "@/types/types";

function getOrdersApiBaseUrl() {
  const value = process.env.ORDER_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  return value?.replace(/\/$/, "") ?? null;
}

export async function POST(request: Request) {
  const baseUrl = getOrdersApiBaseUrl();

  if (!baseUrl) {
    return NextResponse.json(
      {
        error:
          "Missing ORDER_API_URL or NEXT_PUBLIC_API_URL. Configure the orders backend before creating orders.",
      },
      { status: 500 },
    );
  }

  let payload: CreateOrderPayload;

  try {
    payload = (await request.json()) as CreateOrderPayload;
  } catch {
    return NextResponse.json({ error: "Invalid order payload." }, { status: 400 });
  }

  try {
    const response = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "application/json";
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach orders backend.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
