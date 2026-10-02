export function orderTrackingPath(tenantId: string, orderId: string) {
  return `/orders/status/${encodeURIComponent(tenantId)}/${encodeURIComponent(orderId)}`;
}

export function orderTrackingUrl(baseUrl: string, tenantId: string, orderId: string) {
  return `${baseUrl.replace(/\/+$/, "")}${orderTrackingPath(tenantId, orderId)}`;
}