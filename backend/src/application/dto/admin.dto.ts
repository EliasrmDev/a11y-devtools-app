import { z } from "zod";
import { JOB_NAMES } from "../../infrastructure/jobs/job-queue.js";

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  role: z.enum(["user", "admin"]).optional(),
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
});

export const manageModelInputSchema = z.object({
  providerType: z.string().min(1).max(50),
  modelId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100),
  isAvailable: z.boolean().default(true),
  maxTokens: z.number().int().positive().optional(),
  supportsStreaming: z.boolean().default(true),
});

export const blockUserSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const listJobsQuerySchema = z.object({
  name: z.string().optional(),
  status: z
    .enum(["pending", "running", "completed", "failed", "dead"])
    .optional(),
});

export const runJobSchema = z.object({
  name: z.enum(JOB_NAMES),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type ManageModelInput = z.infer<typeof manageModelInputSchema>;
export type BlockUserInput = z.infer<typeof blockUserSchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
export type RunJobInput = z.infer<typeof runJobSchema>;
