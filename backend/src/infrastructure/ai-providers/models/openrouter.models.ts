import type { ProviderModelsClient, NormalizedModel } from "../../../domain/ports/provider-models.port.js";
import { safeFetch } from "./safe-fetch.js";

interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { max_completion_tokens?: number };
}

interface OpenRouterListResponse {
  data: OpenRouterModel[];
}

export class OpenRouterModelsClient implements ProviderModelsClient {
  readonly provider = "openrouter" as const;

  async fetchModels(apiKey: string): Promise<NormalizedModel[]> {
    const data = await safeFetch<OpenRouterListResponse>(
      "https://openrouter.ai/api/v1/models",
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!data?.data) return [];

    return data.data.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      provider: this.provider,
      contextWindow: m.context_length ?? null,
      maxOutputTokens: m.top_provider?.max_completion_tokens ?? null,
      supportsStreaming: true,
      supportsVision: false,
      pricing:
        m.pricing?.prompt != null || m.pricing?.completion != null
          ? {
              inputPer1M: m.pricing.prompt ? parseFloat(m.pricing.prompt) * 1_000_000 : null,
              outputPer1M: m.pricing.completion ? parseFloat(m.pricing.completion) * 1_000_000 : null,
            }
          : null,
    }));
  }
}
