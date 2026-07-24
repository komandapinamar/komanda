import { ZodError } from "zod";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { requireOwner } from "@/lib/authorization/role-guard";
import {
  MemberService,
  LastOwnerError,
  UserAlreadyMemberError,
} from "@/features/members/application/member.service";
import {
  AddMemberSchema,
  ChangeRoleSchema,
  RevokeMemberSchema,
} from "@/features/members/domain/member.schemas";
import {
  correlationIdFromRequest,
  safeLogFields,
} from "@/lib/observability/request-context";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

type RouteContext = { params: Promise<{ tenantId: string }> };

function logUnexpectedError(
  correlationId: string,
  operation: string,
  error: unknown,
) {
  const databaseError = error as {
    code?: unknown;
    constraint?: unknown;
    name?: unknown;
  };
  console.error(
    JSON.stringify(
      safeLogFields(
        { correlationId, operation },
        {
          errorType:
            typeof databaseError.name === "string"
              ? databaseError.name
              : "UnknownError",
          databaseCode:
            typeof databaseError.code === "string"
              ? databaseError.code
              : undefined,
          constraint:
            typeof databaseError.constraint === "string"
              ? databaseError.constraint
              : undefined,
          debugMessage:
            process.env.NODE_ENV === "development" && error instanceof Error
              ? error.message
              : undefined,
        },
      ),
    ),
  );
}

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwner(context);
    const members = await new MemberService().listMembers(context);
    return Response.json({ data: members });
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return problemResponse({
        status: 400,
        title: "Cannot remove the last owner",
        code: "LAST_OWNER",
        correlationId,
      });
    }
    if (error instanceof ZodError) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        correlationId,
        errors: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    logUnexpectedError(correlationId, "members.list", error);
    return nonDisclosingNotFound(correlationId);
  }
}

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwner(context);
    const input = AddMemberSchema.parse(await request.json());
    const member = await new MemberService().addMember(context, input);
    return Response.json(member, { status: 201 });
  } catch (error) {
    if (error instanceof UserAlreadyMemberError) {
      return problemResponse({
        status: 409,
        title: "User is already a member",
        code: "USER_ALREADY_MEMBER",
        correlationId,
      });
    }
    if (error instanceof LastOwnerError) {
      return problemResponse({
        status: 400,
        title: "Cannot remove the last owner",
        code: "LAST_OWNER",
        correlationId,
      });
    }
    if (error instanceof ZodError) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        correlationId,
        errors: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    logUnexpectedError(correlationId, "members.add", error);
    return nonDisclosingNotFound(correlationId);
  }
}

export async function PATCH(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwner(context);
    const input = ChangeRoleSchema.parse(await request.json());
    await new MemberService().changeRole(context, input);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return problemResponse({
        status: 400,
        title: "Cannot change role of the last owner",
        code: "LAST_OWNER",
        correlationId,
      });
    }
    if (error instanceof ZodError) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        correlationId,
        errors: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    logUnexpectedError(correlationId, "members.changeRole", error);
    return nonDisclosingNotFound(correlationId);
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwner(context);
    const input = RevokeMemberSchema.parse(await request.json());
    await new MemberService().revokeMember(context, input);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return problemResponse({
        status: 400,
        title: "Cannot revoke the last owner",
        code: "LAST_OWNER",
        correlationId,
      });
    }
    if (error instanceof ZodError) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        correlationId,
        errors: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    logUnexpectedError(correlationId, "members.revoke", error);
    return nonDisclosingNotFound(correlationId);
  }
}
