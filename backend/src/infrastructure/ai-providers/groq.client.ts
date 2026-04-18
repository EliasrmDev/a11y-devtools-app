import type {
  AiClientPort,
  AiCompletionParams,
  AiCompletionResult,
} from "../../domain/ports/ai-client.port.js";
import { OpenAiCompatibleClient } from "./openai-compatible.client.js";

const inner = new OpenAiCompatibleClient();

/**
 * Groq client — Groq's API is fully OpenAI-compatible.
 * The only difference: Groq rejects an exact temperature of 0.
 * This wrapper clamps it to 1e-8 before forwarding.
 */
export class GroqClient implements AiClientPort {
  complete(params: AiCompletionParams): Promise<AiCompletionResult> {
    return inner.complete(fixTemperature(params));
  }

  completeStream(params: AiCompletionParams): Promise<ReadableStream<Uint8Array>> {
    return inner.completeStream(fixTemperature(params));
  }
}

function fixTemperature(params: AiCompletionParams): AiCompletionParams {
  if (params.temperature === 0) {
    return { ...params, temperature: 1e-8 };
  }
  return params;
}
