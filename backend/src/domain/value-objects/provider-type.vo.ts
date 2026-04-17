import type { ProviderType } from "../../shared/types.js";

const VALID_TYPES: ReadonlySet<string> = new Set<ProviderType>([
  "openai",
  "anthropic",
  "openrouter",
  "custom",
]);

export function isValidProviderType(value: string): value is ProviderType {
  return VALID_TYPES.has(value);
}
