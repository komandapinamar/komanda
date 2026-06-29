"use client";

import type { CreateOrderPayload, CreatedOrder } from "@/types/types";

const ORDERS_API_ROUTE = "/api/orders";

type OrderApiResponse = {
  id?: string;
  orderId?: string;
  status?: string;
  purchaseNumber?: string;
  error?: string;
};

async function parseOrderApiResponse(response: Response): Promise<OrderApiResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as OrderApiResponse;
  }

  const text = await response.text();

  return text ? { error: text } : {};
}

export async function createOrder(
  payload: CreateOrderPayload,
): Promise<CreatedOrder> {
  const response = await fetch(ORDERS_API_ROUTE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await parseOrderApiResponse(response);

  if (!response.ok) {
    throw new Error(data.error || `Order request failed with status ${response.status}`);
  }

  const id = String(data.id ?? data.orderId ?? "");

  if (!id) {
    throw new Error("Order response is missing a valid order id.");
  }

  return {
    id,
    purchaseNumber: String(data.purchaseNumber ?? id),
    status: data.status === "delivered" ? "delivered" : "approved",
  };
}
