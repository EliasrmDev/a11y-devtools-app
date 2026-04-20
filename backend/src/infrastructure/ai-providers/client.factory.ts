import type { AiClientPort } from "../../domain/ports/ai-client.port.js";
import type { ProviderType } from "../../shared/types.js";
import { OpenAiCompatibleClient } from "./openai-compatible.client.js";
import { OpenAiResponsesClient } from "./openai-responses.client.js";
import { AnthropicClient } from "./anthropic.client.js";
import { GeminiClient } from "./gemini.client.js";
import { GroqClient } from "./groq.client.js";

const openAiResponsesClient = new OpenAiResponsesClient();
const openAiCompatibleClient = new OpenAiCompatibleClient();
const anthropicClient = new AnthropicClient();
const geminiClient = new GeminiClient();
const groqClient = new GroqClient();

export function createAiClient(providerType: ProviderType): AiClientPort {
  switch (providerType) {
    case "openai":
      return openAiResponsesClient;
    case "anthropic":
      return anthropicClient;
    case "gemini":
      return geminiClient;
    case "groq":
      return groqClient;
    case "openrouter":
    case "custom":
    default:
      return openAiCompatibleClient;
  }
}
