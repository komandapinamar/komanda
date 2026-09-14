import { randomUUID } from "node:crypto";

export type RequestContext = {
  correlationId: string;
  tenantId?: string;
  actor?: string;
  operation?: string;
};

const sensitiveKey =
  /^(access_?token|refresh_?token|authorization|cookie|password|secret|email|phone|name|customer)$/i;

export function redactSensitiveData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveData);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      sensitiveKey.test(key) && key !== "customer"
        ? "[REDACTED]"
        : key === "customer"
          ? redactSensitiveData(nested)
          : redactSensitiveData(nested),
    ]).map(([key, nested]) => [
      key,
      key === "customer" && nested && typeof nested === "object"
        ? Object.fromEntries(
            Object.keys(nested as Record<string, unknown>).map((field) => [
              field,
              ["email", "phone", "name"].includes(field)
                ? "[REDACTED]"
                : redactSensitiveData(
                    (nested as Record<string, unknown>)[field],
                  ),
            ]),
          )
        : nested,
    ]),
  );
}

export function correlationIdFromRequest(request: Request) {
  const candidate = request.headers.get("x-correlation-id")?.trim();
  return candidate && /^[0-9a-f-]{36}$/i.test(candidate)
    ? candidate
    : randomUUID();
}

export function safeLogFields(
  context: RequestContext,
  fields: Record<string, unknown> = {},
) {
  return redactSensitiveData({
    correlationId: context.correlationId,
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
    ...(context.actor ? { actor: context.actor } : {}),
    ...(context.operation ? { operation: context.operation } : {}),
    ...fields,
  });
}
