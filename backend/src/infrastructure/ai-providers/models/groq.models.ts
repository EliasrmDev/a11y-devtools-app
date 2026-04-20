import type { ProviderModelsClient, NormalizedModel } from "../../../domain/ports/provider-models.port.js";
import { fetchJsonOrThrow } from "./safe-fetch.js";

interface GroqModel {
  id: string;
  object: string;
  owned_by?: string;
  context_window?: number;
}

interface GroqListResponse {
  data: GroqModel[];
}

export class GroqModelsClient implements ProviderModelsClient {
  readonly provider = "groq" as const;

  async fetchModels(apiKey: string): Promise<NormalizedModel[]> {
    const data = await fetchJsonOrThrow<GroqListResponse>(
      "https://api.groq.com/openai/v1/models",
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    // Exclude non-text models (speech-to-text, text-to-speech, embeddings)
    const textModels = (data.data ?? []).filter(
      (m) =>
        !m.id.startsWith("whisper-") &&
        !m.id.startsWith("distil-whisper-") &&
        !m.id.startsWith("playai-tts-"),
    );

    return textModels.map((m) => ({
      id: m.id,
      name: m.id,
      provider: this.provider,
      contextWindow: m.context_window ?? null,
      maxOutputTokens: null,
      supportsStreaming: true,
      supportsVision: m.id.includes("vision") || m.id.includes("llava"),
      pricing: null,
    }));
  }
}
