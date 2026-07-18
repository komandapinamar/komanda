export type ProblemDetails = {
  status: number;
  title: string;
  code: string;
  detail?: string;
  correlationId?: string;
  errors?: Array<{ path: string; message: string }>;
};

function codeToSlug(code: string) {
  return code.toLowerCase().replace(/_/g, "-");
}

function getProblemTypeBaseUrl() {
  const value = process.env.KOMANDA_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!value?.trim()) {
    throw new Error(
      "Missing KOMANDA_PUBLIC_BASE_URL or NEXT_PUBLIC_API_URL environment variable.",
    );
  }
  return value.trim().replace(/\/+$/, "");
}

function problemTypeUrl(code: string) {
  return new URL(`problems/${codeToSlug(code)}`, `${getProblemTypeBaseUrl()}/`).toString();
}

export function problemResponse(problem: ProblemDetails): Response {
  const body = {
    type: problemTypeUrl(problem.code),
    title: problem.title,
    status: problem.status,
    code: problem.code,
    ...(problem.detail ? { detail: problem.detail } : {}),
    ...(problem.correlationId
      ? { correlationId: problem.correlationId }
      : {}),
    ...(problem.errors ? { errors: problem.errors } : {}),
  };

  return Response.json(body, {
    status: problem.status,
    headers: {
      "Content-Type": "application/problem+json",
      ...(problem.correlationId
        ? { "X-Correlation-Id": problem.correlationId }
        : {}),
    },
  });
}

export function nonDisclosingNotFound(correlationId?: string) {
  return problemResponse({
    status: 404,
    title: "Not Found",
    code: "RESOURCE_NOT_FOUND",
    correlationId,
  });
}
