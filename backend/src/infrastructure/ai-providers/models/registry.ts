import type { ProviderModelsClient } from "../../../domain/ports/provider-models.port.js";
import type { ProviderType } from "../../../shared/types.js";
import { OpenAIModelsClient } from "./openai.models.js";
import { AnthropicModelsClient } from "./anthropic.models.js";
import { GroqModelsClient } from "./groq.models.js";
import { OpenRouterModelsClient } from "./openrouter.models.js";
import { GeminiModelsClient } from "./gemini.models.js";

const clients = new Map<ProviderType, ProviderModelsClient>([
  ["openai", new OpenAIModelsClient()],
  ["anthropic", new AnthropicModelsClient()],
  ["groq", new GroqModelsClient()],
  ["openrouter", new OpenRouterModelsClient()],
  ["gemini", new GeminiModelsClient()],
]);

/** Supported provider types for model listing */
export const SUPPORTED_MODEL_PROVIDERS: ReadonlySet<ProviderType> = new Set(clients.keys());

export function getModelsClient(provider: ProviderType): ProviderModelsClient | null {
  return clients.get(provider) ?? null;
}
