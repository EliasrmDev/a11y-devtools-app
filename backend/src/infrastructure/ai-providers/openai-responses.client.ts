import type {
  AiClientPort,
  AiCompletionParams,
  AiCompletionResult,
} from "../../domain/ports/ai-client.port.js";
import { DomainError } from "../../domain/errors/index.js";
import { validateProviderUrl } from "./ssrf-guard.js";
import { PROXY } from "../../shared/constants.js";

/**
 * OpenAI client using the Responses API (POST /responses).
 * See: https://developers.openai.com/api/reference/resources/responses/methods/create
 *
 * Key differences from Chat Completions:
 * - Endpoint: /responses (not /v1/chat/completions)
 * - system messages → `instructions` parameter
 * - user/assistant messages → `input` array (EasyInputMessage format)
 * - `max_tokens` → `max_output_tokens`
 * - Response uses `output_text`, `usage.input_tokens`, `usage.output_tokens`
 */
export class OpenAiResponsesClient implements AiClientPort {
  async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
    const url = await validateProviderUrl(params.baseUrl);
    const endpoint = `${url.origin}${url.pathname.replace(/\/$/, "")}/responses`;

    const headers = this.buildHeaders(params);
    const body = this.buildBody(params, false);

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROXY.STREAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new DomainError(
        "AI_PROVIDER_ERROR",
        `Provider returned ${response.status}: ${errorBody.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as OpenAiResponsesResult;

    return {
      content: data.output_text ?? "",
      model: data.model,
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    };
  }

  async completeStream(
    params: AiCompletionParams,
  ): Promise<ReadableStream<Uint8Array>> {
    const url = await validateProviderUrl(params.baseUrl);
    const endpoint = `${url.origin}${url.pathname.replace(/\/$/, "")}/responses`;

    const headers = this.buildHeaders(params);
    const body = this.buildBody(params, true);

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROXY.STREAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new DomainError(
        "AI_PROVIDER_ERROR",
        `Provider returned ${response.status}: ${errorBody.slice(0, 200)}`,
      );
    }

    if (!response.body) {
      throw new DomainError("AI_PROVIDER_ERROR", "No response body from provider");
    }

    return response.body;
  }

  private buildHeaders(
    params: AiCompletionParams,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    };

    if (params.customHeaders) {
      for (const [key, value] of Object.entries(params.customHeaders)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "host" || lowerKey === "content-length") continue;
        headers[key] = value;
      }
    }

    return headers;
  }

  private buildBody(
    params: AiCompletionParams,
    stream: boolean,
  ): Record<string, unknown> {
    // Separate system messages (→ instructions) from user/assistant (→ input)
    const systemParts: string[] = [];
    const input: Array<{ role: string; content: string }> = [];

    for (const msg of params.messages) {
      if (msg.role === "system") {
        systemParts.push(msg.content);
      } else {
        input.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model: params.model,
      input,
      store: false,
    };

    if (systemParts.length > 0) {
      body.instructions = systemParts.join("\n\n");
    }

    if (params.maxTokens !== undefined) body.max_output_tokens = Math.max(16, params.maxTokens);
    if (params.temperature !== undefined) body.temperature = params.temperature;
    if (stream) body.stream = true;

    return body;
  }
}

/** Shape of the Responses API result (non-streaming). */
interface OpenAiResponsesResult {
  id: string;
  model: string;
  output_text: string | null;
  output: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}
