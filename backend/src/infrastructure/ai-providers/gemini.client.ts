import type {
  AiClientPort,
  AiCompletionParams,
  AiCompletionResult,
} from "../../domain/ports/ai-client.port.js";
import { DomainError } from "../../domain/errors/index.js";
import { validateProviderUrl } from "./ssrf-guard.js";
import { PROXY } from "../../shared/constants.js";

// Allows alphanumeric, dots, hyphens, and @ — covers all known Gemini model IDs
const SAFE_MODEL_RE = /^[\w.\-@]+$/;

/**
 * Native Gemini REST API client.
 * Uses the `generateContent` / `streamGenerateContent` endpoints, not the
 * OpenAI compatibility layer. Auth is via the `x-goog-api-key` header.
 */
export class GeminiClient implements AiClientPort {
  async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
    const endpoint = await this.buildEndpoint(params, false);
    const headers = this.buildHeaders(params);
    const body = this.buildBody(params);

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
        `Gemini returned ${response.status}: ${errorBody}`,
      );
    }

    const data = (await response.json()) as GeminiResponse;

    const content =
      data.candidates?.[0]?.content?.parts
        ?.filter((p) => p.text !== undefined)
        .map((p) => p.text)
        .join("") ?? "";

    return {
      content,
      model: data.modelVersion ?? params.model,
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
    };
  }

  async completeStream(
    params: AiCompletionParams,
  ): Promise<ReadableStream<Uint8Array>> {
    const endpoint = await this.buildEndpoint(params, true);
    const headers = this.buildHeaders(params);
    const body = this.buildBody(params);

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
        `Gemini returned ${response.status}: ${errorBody}`,
      );
    }

    if (!response.body) {
      throw new DomainError("AI_PROVIDER_ERROR", "No response body from Gemini");
    }

    return response.body;
  }

  private async buildEndpoint(
    params: AiCompletionParams,
    stream: boolean,
  ): Promise<string> {
    if (!SAFE_MODEL_RE.test(params.model)) {
      throw new DomainError("INVALID_MODEL", "Invalid Gemini model identifier");
    }

    const url = await validateProviderUrl(params.baseUrl);
    const base = `${url.origin}${url.pathname.replace(/\/$/, "")}`;

    if (stream) {
      return `${base}/${params.model}:streamGenerateContent?alt=sse`;
    }
    return `${base}/${params.model}:generateContent`;
  }

  private buildHeaders(params: AiCompletionParams): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": params.apiKey,
    };
  }

  private buildBody(params: AiCompletionParams): GeminiRequest {
    // Separate system message from conversation messages
    const systemMessage = params.messages.find((m) => m.role === "system");
    const conversationMessages = params.messages.filter(
      (m) => m.role !== "system",
    );

    const body: GeminiRequest = {
      contents: conversationMessages.map((m) => ({
        // Gemini uses "model" instead of "assistant"
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {},
    };

    if (systemMessage) {
      body.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }

    if (params.maxTokens !== undefined) {
      body.generationConfig.maxOutputTokens = params.maxTokens;
    }

    if (params.temperature !== undefined) {
      body.generationConfig.temperature = params.temperature;
    }

    return body;
  }
}

// ── Request / response types ──────────────────────────────────────────────────

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig: {
    maxOutputTokens?: number;
    temperature?: number;
  };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiPart {
  text: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
      role?: string;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
}
