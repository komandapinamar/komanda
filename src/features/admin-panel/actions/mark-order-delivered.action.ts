"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedAdminSession } from "@/features/admin-panel/server/auth.service";
import { markOrderAsDelivered } from "@/features/shop/checkout/server/order.service";

export async function markOrderDelivered(formData: FormData) {
  const adminSession = await getAuthenticatedAdminSession();

  if (!adminSession) {
    throw new Error("Unauthorized.");
  }

  const orderId = formData.get("orderId");

  if (typeof orderId !== "string" || !orderId.trim()) {
    throw new Error("Order id is required.");
  }

  await markOrderAsDelivered(orderId.trim());
  revalidatePath("/admin/dashboard");
}
