import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { SecretRepository } from "../../../domain/ports/secret.repository.js";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import { createAiClient } from "../../../infrastructure/ai-providers/client.factory.js";
import { validateProviderUrl } from "../../../infrastructure/ai-providers/ssrf-guard.js";
import { NotFoundError, DomainError } from "../../../domain/errors/index.js";
import { PROXY } from "../../../shared/constants.js";
import type { ProviderType, AiBinding } from "../../../shared/types.js";

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

export class TestConnectionUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly secrets: SecretRepository,
    private readonly crypto: CryptoPort,
    private readonly audit: AuditRepository,
    private readonly ai?: AiBinding,
  ) {}

  async execute(
    userId: string,
    connectionId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<TestConnectionResult> {
    const startTime = Date.now();

    // 1. Get connection (with ownership check)
    const connection = await this.providers.findByIdAndUser(
      connectionId,
      userId,
    );
    if (!connection) {
      throw new NotFoundError("Provider connection", connectionId);
    }

    // 2. Resolve and validate base URL (SSRF guard)
    // Cloudflare AI uses the Workers AI binding — no HTTP base URL needed.
    const isCloudflare = connection.providerType === "cloudflare";
    const baseUrl = isCloudflare
      ? ""
      : (connection.baseUrl ??
        PROXY.KNOWN_PROVIDERS[
          connection.providerType as keyof typeof PROXY.KNOWN_PROVIDERS
        ]);
    if (!isCloudflare && !baseUrl) {
      throw new DomainError("NO_BASE_URL", "No base URL configured for provider");
    }
    if (!isCloudflare) {
      await validateProviderUrl(baseUrl);
    }

    // 3. Decrypt API key
    const secret = await this.secrets.findByConnectionId(connection.id);
    if (!secret) {
      throw new NotFoundError("Provider secret");
    }
    const apiKey = this.crypto.decrypt(secret);

    // 4. Decrypt custom headers if present
    let customHeaders: Record<string, string> | undefined;
    if (connection.customHeadersEnc) {
      const headersEnvelope = JSON.parse(connection.customHeadersEnc);
      const headersJson = this.crypto.decrypt({
        encryptedDek: Buffer.from(headersEnvelope.encryptedDek, "base64"),
        dekIv: Buffer.from(headersEnvelope.dekIv, "base64"),
        ciphertext: Buffer.from(headersEnvelope.ciphertext, "base64"),
        cipherIv: Buffer.from(headersEnvelope.cipherIv, "base64"),
        authTag: Buffer.from(headersEnvelope.authTag, "base64"),
        kekVersion: headersEnvelope.kekVersion,
      });
      customHeaders = JSON.parse(headersJson);
    }

    // 5. Test connection with a minimal request
    const client = createAiClient(connection.providerType as ProviderType, this.ai);
    const testModels: Record<string, string> = {
      openai: "gpt-4o-mini",
      anthropic: "claude-3-5-haiku-20241022",
      openrouter: "openai/gpt-4o-mini",
      custom: "gpt-4o-mini",
    };
    const testModel = testModels[connection.providerType] ?? "gpt-4o-mini";

    try {
      await client.complete({
        baseUrl,
        apiKey,
        model: testModel,
        messages: [{ role: "user", content: "Hi" }],
        maxTokens: 1,
        customHeaders,
      });

      const latencyMs = Date.now() - startTime;

      // Audit successful test
      await this.audit.create({
        userId,
        action: "provider.test_success",
        resourceType: "provider",
        resourceId: connectionId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: { latencyMs },
      });

      return { success: true, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Audit failed test
      await this.audit.create({
        userId,
        action: "provider.test_failed",
        resourceType: "provider",
        resourceId: connectionId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: { latencyMs, error: errorMessage },
      });

      return { success: false, latencyMs, error: errorMessage };
    }
  }
}
