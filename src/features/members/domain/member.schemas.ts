import { z } from "zod";

export const RoleSchema = z.enum(["owner", "admin", "employee"]);

export const AddMemberSchema = z.object({
  email: z.string().email(),
  role: RoleSchema,
});

export const ChangeRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: RoleSchema,
});

export const RevokeMemberSchema = z.object({
  membershipId: z.string().uuid(),
});

export type AddMemberInput = z.infer<typeof AddMemberSchema>;
export type ChangeRoleInput = z.infer<typeof ChangeRoleSchema>;
export type RevokeMemberInput = z.infer<typeof RevokeMemberSchema>;

export type MemberOutput = {
  id: string;
  email: string;
  role: "owner" | "admin" | "employee";
  status: "active" | "revoked";
  userStatus?: "active" | "pending_verification" | "suspended" | string;
  createdAt: Date;
};
