import type { ProviderModelsClient, NormalizedModel } from "../../../domain/ports/provider-models.port.js";
import { fetchJsonOrThrow } from "./safe-fetch.js";

interface AnthropicModel {
  id: string;
  display_name: string;
  type: string;
}

interface AnthropicListResponse {
  data: AnthropicModel[];
  has_more?: boolean;
  last_id?: string;
}

export class AnthropicModelsClient implements ProviderModelsClient {
  readonly provider = "anthropic" as const;

  async fetchModels(apiKey: string): Promise<NormalizedModel[]> {
    const allModels: AnthropicModel[] = [];
    let afterId: string | undefined;

    // Anthropic paginates via has_more / last_id
    do {
      const url = afterId
        ? `https://api.anthropic.com/v1/models?limit=100&after_id=${encodeURIComponent(afterId)}`
        : "https://api.anthropic.com/v1/models?limit=100";

      const data = await fetchJsonOrThrow<AnthropicListResponse>(url, {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });

      allModels.push(...(data.data ?? []));
      afterId = data.has_more ? data.last_id ?? undefined : undefined;
    } while (afterId);

    return allModels.map((m) => ({
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
