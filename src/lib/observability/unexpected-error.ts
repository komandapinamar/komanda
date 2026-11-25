import { safeLogFields } from "@/lib/observability/request-context";

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
};

function errorDetails(error: unknown) {
  const outer = (error ?? {}) as ErrorLike;
  const inner = (outer.cause ?? {}) as ErrorLike;
  const candidate = typeof outer.code === "string" ? outer : inner;

  return {
    errorType:
      typeof outer.name === "string" && outer.name !== ""
        ? outer.name
        : "UnknownError",
    databaseCode:
      typeof candidate.code === "string" ? candidate.code : undefined,
    constraint:
      typeof candidate.constraint === "string" ? candidate.constraint : undefined,
  };
}

export function logUnexpectedError(
  correlationId: string,
  operation: string,
  error: unknown,
) {
  console.error(
    JSON.stringify(
      safeLogFields(
        { correlationId, operation },
        {
          ...errorDetails(error),
          // En producción nunca se registra el mensaje: los errores de Drizzle
          // incluyen la consulta y sus parámetros, que pueden contener PII.
          debugMessage:
            process.env.NODE_ENV === "development" && error instanceof Error
              ? error.message
              : undefined,
        },
      ),
    ),
  );
}
