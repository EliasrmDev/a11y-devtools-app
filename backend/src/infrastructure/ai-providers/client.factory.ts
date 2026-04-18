import type { AiClientPort } from "../../domain/ports/ai-client.port.js";
import type { ProviderType, AiBinding } from "../../shared/types.js";
import { OpenAiCompatibleClient } from "./openai-compatible.client.js";
import { AnthropicClient } from "./anthropic.client.js";
import { CloudflareAiClient } from "./cloudflare-ai.client.js";
import { GeminiClient } from "./gemini.client.js";
import { GroqClient } from "./groq.client.js";
import { DomainError } from "../../domain/errors/index.js";

const openAiClient = new OpenAiCompatibleClient();
const anthropicClient = new AnthropicClient();
const geminiClient = new GeminiClient();
const groqClient = new GroqClient();

export function createAiClient(providerType: ProviderType, ai?: AiBinding): AiClientPort {
  switch (providerType) {
    case "anthropic":
      return anthropicClient;
    case "cloudflare":
      if (!ai) throw new DomainError("CONFIGURATION_ERROR", "Cloudflare AI binding not available");
      return new CloudflareAiClient(ai);
    case "gemini":
      return geminiClient;
    case "groq":
      return groqClient;
    case "openai":
    case "openrouter":
    case "custom":
    default:
      return openAiClient;
  }
}
