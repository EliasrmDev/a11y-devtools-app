import type { ProviderModelsClient, NormalizedModel } from "../../../domain/ports/provider-models.port.js";
import { safeFetch } from "./safe-fetch.js";

interface OpenAIModel {
  id: string;
  object: string;
  owned_by?: string;
}

interface OpenAIListResponse {
  data: OpenAIModel[];
}

export class OpenAIModelsClient implements ProviderModelsClient {
  readonly provider = "openai" as const;

  async fetchModels(apiKey: string): Promise<NormalizedModel[]> {
    const data = await safeFetch<OpenAIListResponse>(
      "https://api.openai.com/v1/models",
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!data?.data) return [];

    return data.data
      .filter((m) => m.id.startsWith("gpt-") || m.id.startsWith("o"))
      .map((m) => ({
        id: m.id,
        name: m.id,
        provider: this.provider,
        contextWindow: null,
        maxOutputTokens: null,
        supportsStreaming: true,
        supportsVision: m.id.includes("vision") || m.id.includes("gpt-4o") || m.id.includes("gpt-4-turbo"),
        pricing: null,
      }));
  }
}
