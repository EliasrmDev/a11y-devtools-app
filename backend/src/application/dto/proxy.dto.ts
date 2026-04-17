import { z } from "zod";
import { SIZE_LIMITS } from "../../shared/constants.js";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(SIZE_LIMITS.MAX_REQUEST_BODY_BYTES),
});

export const aiProxyInputSchema = z.object({
  connectionId: z.string().uuid(),
  model: z.string().min(1).max(100),
  messages: z.array(messageSchema).min(1).max(20),
  maxTokens: z.number().int().positive().max(16384).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().default(false),
});

export type AiProxyInput = z.infer<typeof aiProxyInputSchema>;

export interface AiProxyOutput {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
