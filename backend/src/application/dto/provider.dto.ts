import { z } from "zod";
import { SIZE_LIMITS } from "../../shared/constants.js";

const customHeaderSchema = z
  .record(z.string(), z.string().max(SIZE_LIMITS.MAX_HEADER_VALUE_LENGTH))
  .refine(
    (headers) =>
      Object.keys(headers).length <= SIZE_LIMITS.MAX_CUSTOM_HEADERS,
    `Maximum ${SIZE_LIMITS.MAX_CUSTOM_HEADERS} custom headers allowed`,
  )
  .refine(
    (headers) =>
      Object.keys(headers).every(
        (key) => key.length <= SIZE_LIMITS.MAX_HEADER_NAME_LENGTH,
      ),
    `Header names must be ${SIZE_LIMITS.MAX_HEADER_NAME_LENGTH} characters or less`,
  )
  .optional();

export const createConnectionInputSchema = z
  .object({
    providerType: z.enum(["openai", "anthropic", "openrouter", "custom"]),
    displayName: z.string().min(1).max(100),
    apiKey: z.string().min(1),
    baseUrl: z.string().url().optional(),
    customHeaders: customHeaderSchema,
  })
  .refine(
    (data) => {
      if (data.providerType === "custom" && !data.baseUrl) {
        return false;
      }
      return true;
    },
    { message: "baseUrl is required for custom providers", path: ["baseUrl"] },
  );

export const updateConnectionInputSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional().nullable(),
  customHeaders: customHeaderSchema,
  isActive: z.boolean().optional(),
});

export type CreateConnectionInput = z.infer<typeof createConnectionInputSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionInputSchema>;

export interface ConnectionOutput {
  id: string;
  providerType: string;
  displayName: string;
  baseUrl: string | null;
  hasCustomHeaders: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
