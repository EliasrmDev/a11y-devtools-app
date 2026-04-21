import type {
  AiClientPort,
  AiCompletionParams,
  AiCompletionResult,
} from "../../domain/ports/ai-client.port.js";
import { DomainError } from "../../domain/errors/index.js";
import { validateProviderUrl } from "./ssrf-guard.js";
import { PROXY } from "../../shared/constants.js";

/**
 * OpenAI-compatible client. Works with OpenAI, OpenRouter, and custom
 * providers that follow the OpenAI API format.
 */
export class OpenAiCompatibleClient implements AiClientPort {
  async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
    const url = await validateProviderUrl(params.baseUrl);
    const endpoint = `${url.origin}${url.pathname.replace(/\/$/, "")}/chat/completions`;

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
        `Provider returned ${response.status}: ${errorBody}`,
      );
    }

    const data = (await response.json()) as OpenAiResponse;

    return {
      content: data.choices[0]?.message?.content ?? "",
      model: data.model,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    };
  }

  async completeStream(
    params: AiCompletionParams,
  ): Promise<ReadableStream<Uint8Array>> {
    const url = await validateProviderUrl(params.baseUrl);
    const endpoint = `${url.origin}${url.pathname.replace(/\/$/, "")}/chat/completions`;

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
        `Provider returned ${response.status}: ${errorBody}`,
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
        // Prevent overriding critical headers
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
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      stream,
    };

    if (params.maxTokens !== undefined) body.max_tokens = Math.max(16, params.maxTokens);
    if (params.temperature !== undefined) body.temperature = params.temperature;

    if (stream) {
      body.stream_options = { include_usage: true };
    }

    return body;
  }
}

interface OpenAiResponse {
  choices: Array<{
    message?: { content: string };
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
