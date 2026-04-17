import { z } from "zod";

export const updateProfileInputSchema = z.object({
  displayName: z.string().max(100).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export interface ProfileOutput {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface UsageStatsOutput {
  totalRequests: number;
  totalTokens: number;
  avgLatencyMs: number;
  successRate: number;
  period: string;
}
