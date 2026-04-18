import type { ProviderModelsClient, NormalizedModel } from "../../../domain/ports/provider-models.port.js";
import { safeFetch } from "./safe-fetch.js";

interface AnthropicModel {
  id: string;
  display_name: string;
  type: string;
}

interface AnthropicListResponse {
  data: AnthropicModel[];
}

export class AnthropicModelsClient implements ProviderModelsClient {
  readonly provider = "anthropic" as const;

  async fetchModels(apiKey: string): Promise<NormalizedModel[]> {
    const data = await safeFetch<AnthropicListResponse>(
      "https://api.anthropic.com/v1/models",
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      },
    );
    if (!data?.data) return [];

    return data.data.map((m) => ({
      id: m.id,
      name: m.display_name || m.id,
      provider: this.provider,
      contextWindow: null,
      maxOutputTokens: null,
      supportsStreaming: true,
      supportsVision: m.id.includes("claude-3") || m.id.includes("claude-sonnet") || m.id.includes("claude-opus"),
      pricing: null,
    }));
  }
}
