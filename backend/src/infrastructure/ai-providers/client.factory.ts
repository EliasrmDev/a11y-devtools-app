import type { AiClientPort } from "../../domain/ports/ai-client.port.js";
import type { ProviderType } from "../../shared/types.js";
import { OpenAiCompatibleClient } from "./openai-compatible.client.js";
import { AnthropicClient } from "./anthropic.client.js";

const openAiClient = new OpenAiCompatibleClient();
const anthropicClient = new AnthropicClient();

export function createAiClient(providerType: ProviderType): AiClientPort {
  switch (providerType) {
    case "anthropic":
      return anthropicClient;
    case "openai":
    case "openrouter":
    case "custom":
      return openAiClient;
    default:
      return openAiClient;
  }
}
