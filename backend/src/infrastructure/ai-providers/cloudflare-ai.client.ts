import type {
  AiClientPort,
  AiCompletionParams,
  AiCompletionResult,
} from "../../domain/ports/ai-client.port.js";
import { DomainError } from "../../domain/errors/index.js";
import type { AiBinding } from "../../shared/types.js";

/**
 * Cloudflare Workers AI client.
 * Uses the `env.AI` Workers binding — no HTTP call, no API key needed.
 * Supports any model available in the Cloudflare AI catalog.
 */
export class CloudflareAiClient implements AiClientPort {
  constructor(private readonly ai: AiBinding) {}

  async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
    try {
      const response = await this.ai.run(params.model, {
        messages: params.messages,
        max_tokens: params.maxTokens ?? 1024,
      });

      const content: string =
        typeof response === "object" && response !== null && "response" in response
          ? String(response.response ?? "")
          : "";

      return {
        content,
        model: params.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
    } catch (err) {
      throw new DomainError(
        "AI_PROVIDER_ERROR",
        `Cloudflare AI error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async completeStream(params: AiCompletionParams): Promise<ReadableStream<Uint8Array>> {
    let response: unknown;

    try {
      response = await this.ai.run(params.model, {
        messages: params.messages,
        max_tokens: params.maxTokens ?? 1024,
        stream: true,
      });
    } catch (err) {
      throw new DomainError(
        "AI_PROVIDER_ERROR",
        `Cloudflare AI stream error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response || !(response instanceof ReadableStream)) {
      throw new DomainError("AI_PROVIDER_ERROR", "No stream returned from Cloudflare AI");
    }

    return response as ReadableStream<Uint8Array>;
  }
}
