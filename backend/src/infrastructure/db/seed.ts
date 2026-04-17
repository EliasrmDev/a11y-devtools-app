/**
 * Seed script for provider_models table.
 * Run with: npx tsx src/infrastructure/db/seed.ts
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { providerModels } from "./schema/provider-models";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

const models = [
  // ── OpenAI ──────────────────────────────────────────────────────────────
  {
    providerType: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    maxTokens: 128000,
    supportsStreaming: true,
  },
  {
    providerType: "openai",
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    maxTokens: 128000,
    supportsStreaming: true,
  },
  {
    providerType: "openai",
    modelId: "gpt-4-turbo",
    displayName: "GPT-4 Turbo",
    maxTokens: 128000,
    supportsStreaming: true,
  },
  // ── Anthropic ───────────────────────────────────────────────────────────
  {
    providerType: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4",
    maxTokens: 200000,
    supportsStreaming: true,
  },
  {
    providerType: "anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    displayName: "Claude 3.5 Sonnet",
    maxTokens: 200000,
    supportsStreaming: true,
  },
  {
    providerType: "anthropic",
    modelId: "claude-3-5-haiku-20241022",
    displayName: "Claude 3.5 Haiku",
    maxTokens: 200000,
    supportsStreaming: true,
  },
  // ── OpenRouter ──────────────────────────────────────────────────────────
  {
    providerType: "openrouter",
    modelId: "google/gemini-2.5-flash-preview",
    displayName: "Gemini 2.5 Flash (OpenRouter)",
    maxTokens: 1000000,
    supportsStreaming: true,
  },
  {
    providerType: "openrouter",
    modelId: "meta-llama/llama-4-maverick",
    displayName: "Llama 4 Maverick (OpenRouter)",
    maxTokens: 1000000,
    supportsStreaming: true,
  },
  {
    providerType: "openrouter",
    modelId: "deepseek/deepseek-r1",
    displayName: "DeepSeek R1 (OpenRouter)",
    maxTokens: 163840,
    supportsStreaming: true,
  },
] as const;

async function seed() {
  console.log("Seeding provider_models...");

  for (const model of models) {
    await db
      .insert(providerModels)
      .values(model)
      .onConflictDoNothing({ target: [providerModels.providerType, providerModels.modelId] });
    console.log(`  ✓ ${model.providerType}/${model.modelId}`);
  }

  console.log("Done.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
