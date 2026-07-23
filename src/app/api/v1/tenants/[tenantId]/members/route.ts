import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { requireOwner } from "@/lib/authorization/role-guard";
import {
  MemberService,
  UserNotFoundError,
  LastOwnerError,
} from "@/features/members/application/member.service";
import {
  AddMemberSchema,
  ChangeRoleSchema,
  RevokeMemberSchema,
} from "@/features/members/domain/member.schemas";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwner(context);
    const members = await new MemberService().listMembers(context);
    return Response.json({ data: members });
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return problemResponse({
        status: 400,
        title: "User not found",
        code: "USER_NOT_FOUND",
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
    if (error instanceof UserNotFoundError) {
      return problemResponse({
        status: 400,
        title: "User not found",
        code: "USER_NOT_FOUND",
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
    return nonDisclosingNotFound(correlationId);
  }
}
