import type { ProviderModelsClient, NormalizedModel } from "../../../domain/ports/provider-models.port.js";
import { safeFetch } from "./safe-fetch.js";

interface GeminiModel {
  name: string;
  displayName: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

interface GeminiListResponse {
  models: GeminiModel[];
}

export class GeminiModelsClient implements ProviderModelsClient {
  readonly provider = "gemini" as const;

  async fetchModels(apiKey: string): Promise<NormalizedModel[]> {
    const data = await safeFetch<GeminiListResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      {},
    );
    if (!data?.models) return [];

    return data.models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => {
        const id = m.name.replace("models/", "");
        return {
          id,
          name: m.displayName || id,
          provider: this.provider,
          contextWindow: m.inputTokenLimit ?? null,
          maxOutputTokens: m.outputTokenLimit ?? null,
          supportsStreaming: m.supportedGenerationMethods?.includes("streamGenerateContent") ?? false,
          supportsVision: id.includes("vision") || id.includes("gemini-pro") || id.includes("gemini-1.5") || id.includes("gemini-2"),
          pricing: null,
        };
      });
  }
}
