import type {
  AiClientPort,
  AiCompletionParams,
  AiCompletionResult,
} from "../../domain/ports/ai-client.port.js";
import { DomainError } from "../../domain/errors/index.js";
import { validateProviderUrl } from "./ssrf-guard.js";
import { PROXY } from "../../shared/constants.js";

/**
 * Anthropic-specific client. Handles the Anthropic Messages API
 * format which differs from OpenAI's API.
 */
export class AnthropicClient implements AiClientPort {
  async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
    const url = await validateProviderUrl(params.baseUrl);
    const endpoint = `${url.origin}${url.pathname.replace(/\/$/, "")}/messages`;

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
        response.status >= 500 ? "PROVIDER_ERROR_5XX" : "AI_PROVIDER_ERROR",
        `Anthropic returned ${response.status}: ${errorBody}`,
      );
    }

    const data = (await response.json()) as AnthropicResponse;

    const content = data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      content,
      model: data.model,
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    };
  }

  async completeStream(
    params: AiCompletionParams,
  ): Promise<ReadableStream<Uint8Array>> {
    const url = await validateProviderUrl(params.baseUrl);
    const endpoint = `${url.origin}${url.pathname.replace(/\/$/, "")}/messages`;

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
        response.status >= 500 ? "PROVIDER_ERROR_5XX" : "AI_PROVIDER_ERROR",
        `Anthropic returned ${response.status}: ${errorBody}`,
      );
    }

    if (!response.body) {
      throw new DomainError("AI_PROVIDER_ERROR", "No response body from Anthropic");
    }

    return response.body;
  }

  private buildHeaders(
    params: AiCompletionParams,
  ): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  private buildBody(
    params: AiCompletionParams,
    stream: boolean,
  ): Record<string, unknown> {
    // Anthropic separates system from messages
    const systemMessage = params.messages.find((m) => m.role === "system");
    const messages = params.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      max_tokens: params.maxTokens ?? 4096,
      stream,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }

    return body;
  }
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
