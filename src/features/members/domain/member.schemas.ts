import { z } from "zod";

export const RoleSchema = z.enum(["owner", "admin", "employee"]);

export const AddMemberSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: RoleSchema,
});

export const ChangeRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: RoleSchema,
});

export const DeleteMemberSchema = z.object({
  membershipId: z.string().uuid(),
});

export const RevokeMemberSchema = DeleteMemberSchema;

export type AddMemberInput = z.infer<typeof AddMemberSchema>;
export type ChangeRoleInput = z.infer<typeof ChangeRoleSchema>;
export type DeleteMemberInput = z.infer<typeof DeleteMemberSchema>;
export type RevokeMemberInput = DeleteMemberInput;

export type MemberOutput = {
  id: string;
  email: string;
  role: "owner" | "admin" | "employee";
  status: "active" | "revoked";
  password?: string | null;
  createdAt: Date;
};
