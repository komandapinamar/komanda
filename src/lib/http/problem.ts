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

export function problemResponse(problem: ProblemDetails): Response {
  const body = {
    type: `https://komanda.app/problems/${codeToSlug(problem.code)}`,
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
