import { z } from "zod";
import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { SecretRepository } from "../../../domain/ports/secret.repository.js";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type { UsageRepository } from "../../../domain/ports/usage.repository.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import { createAiClient } from "../../../infrastructure/ai-providers/client.factory.js";
import {
  buildAccessibilityPrompt,
  PROMPT_VERSION,
} from "../../../infrastructure/ai-providers/accessibility-prompt.js";
import { NotFoundError, DomainError } from "../../../domain/errors/index.js";
import type { ProviderType, AiBinding } from "../../../shared/types.js";
import type {
  AccessibilitySuggestInput,
  AccessibilitySuggestOutput,
} from "../../dto/accessibility.dto.js";
import { PROXY, ACCESSIBILITY } from "../../../shared/constants.js";

// ---------------------------------------------------------------------------
// Response schema — validates the structured JSON returned by the AI
// ---------------------------------------------------------------------------
const aiResponseSchema = z.object({
  shortExplanation: z.string().max(300),
  userImpact: z.string().max(500),
  recommendedFix: z.string().max(1_000),
  codeExample: z.string().max(2_000).nullable(),
  warnings: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low"]),
});

// ---------------------------------------------------------------------------
// Retry helper — retries on transient provider errors only
// ---------------------------------------------------------------------------
function isTransientError(err: unknown): boolean {
  if (!(err instanceof DomainError)) return true; // network / unknown
  return err.code === "PROVIDER_TIMEOUT" || err.code === "PROVIDER_ERROR_5XX";
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || attempt === maxRetries) throw err;
      // Exponential back-off: 1 s → 2 s
      await new Promise((resolve) =>
        setTimeout(resolve, 1_000 * (attempt + 1)),
      );
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------
export class SuggestAccessibilityUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly secrets: SecretRepository,
    private readonly crypto: CryptoPort,
    private readonly usage: UsageRepository,
    private readonly audit: AuditRepository,
    private readonly ai?: AiBinding,
  ) {}

  async execute(
    userId: string,
    ipAddress: string | null,
    input: AccessibilitySuggestInput,
  ): Promise<AccessibilitySuggestOutput> {
    const startTime = Date.now();

    // 1. Ownership + active check
    const connection = await this.providers.findByIdAndUser(
      input.connectionId,
      userId,
    );
    if (!connection) {
      throw new NotFoundError("Provider connection", input.connectionId);
    }
    if (!connection.isActive) {
      throw new DomainError(
        "PROVIDER_INACTIVE",
        "Provider connection is not active",
      );
    }

    // 2. Decrypt API key
    const secret = await this.secrets.findByConnectionId(connection.id);
    if (!secret) throw new NotFoundError("Provider secret");
    const apiKey = this.crypto.decrypt(secret);

    // 3. Decrypt custom headers if present
    let customHeaders: Record<string, string> | undefined;
    if (connection.customHeadersEnc) {
      const env = JSON.parse(connection.customHeadersEnc);
      const headersJson = this.crypto.decrypt({
        encryptedDek: Buffer.from(env.encryptedDek, "base64"),
        dekIv: Buffer.from(env.dekIv, "base64"),
        ciphertext: Buffer.from(env.ciphertext, "base64"),
        cipherIv: Buffer.from(env.cipherIv, "base64"),
        authTag: Buffer.from(env.authTag, "base64"),
        kekVersion: env.kekVersion,
      });
      customHeaders = JSON.parse(headersJson) as Record<string, string>;
    }

    // 4. Resolve base URL
    const baseUrl =
      connection.baseUrl ??
      PROXY.KNOWN_PROVIDERS[
        connection.providerType as keyof typeof PROXY.KNOWN_PROVIDERS
      ];
    if (!baseUrl) {
      throw new DomainError("NO_BASE_URL", "No base URL configured for provider");
    }

    // 5. Build injection-safe prompt
    const messages = buildAccessibilityPrompt(input);
    const client = createAiClient(connection.providerType as ProviderType, this.ai);

    // 6. AI call with retry on transient errors
    const result = await withRetry(
      () =>
        client.complete({
          baseUrl,
          apiKey,
          model: input.model,
          messages,
          maxTokens: ACCESSIBILITY.MAX_TOKENS,
          temperature: ACCESSIBILITY.TEMPERATURE,
          customHeaders,
        }),
      ACCESSIBILITY.SUGGEST_MAX_RETRIES,
    );

    const latencyMs = Date.now() - startTime;

    // 7. Parse + validate structured AI response
    let parsed: z.infer<typeof aiResponseSchema>;
    try {
      const rawJson = JSON.parse(result.content.trim()) as unknown;
      parsed = aiResponseSchema.parse(rawJson);
    } catch {
      throw new DomainError(
        "INVALID_AI_RESPONSE",
        "AI provider returned an unexpected response format. Please try again.",
      );
    }

    // 8. Record usage — non-blocking; failures must not fail the request
    this.usage
      .create({
        userId,
        connectionId: connection.id,
        modelId: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        latencyMs,
        status: "success",
      })
      .catch(() => {
        /* intentionally swallowed */
      });

    // 9. Audit — no AI-generated content recorded, only metadata
    this.audit
      .create({
        userId,
        action: "ai.accessibility_suggest",
        resourceType: "provider_connection",
        resourceId: connection.id,
        ipAddress,
        metadata: {
          provider: connection.providerType,
          model: result.model,
          latencyMs,
          promptVersion: PROMPT_VERSION,
          ruleId: input.ruleId,
          status: "success",
        },
      })
      .catch(() => {
        /* intentionally swallowed */
      });

    return {
      ...parsed,
      provider: connection.providerType,
      model: result.model,
      latencyMs,
      promptVersion: PROMPT_VERSION,
    };
  }
}
