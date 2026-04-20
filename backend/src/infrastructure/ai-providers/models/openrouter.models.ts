import type { ProviderModelsClient, NormalizedModel } from "../../../domain/ports/provider-models.port.js";
import { fetchJsonOrThrow } from "./safe-fetch.js";

interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { max_completion_tokens?: number };
  architecture?: { modality?: string };
}

interface OpenRouterListResponse {
  data: OpenRouterModel[];
}

export class OpenRouterModelsClient implements ProviderModelsClient {
  readonly provider = "openrouter" as const;

  async fetchModels(apiKey: string): Promise<NormalizedModel[]> {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const data = await fetchJsonOrThrow<OpenRouterListResponse>(
      "https://openrouter.ai/api/v1/models",
      { headers },
    );

    // Only include models that output text (e.g. "text->text", "text+image->text")
    const textModels = (data.data ?? []).filter((m) => {
      const modality = m.architecture?.modality;
      return !modality || modality.includes("->text");
    });

    return textModels.map((m) => ({
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
