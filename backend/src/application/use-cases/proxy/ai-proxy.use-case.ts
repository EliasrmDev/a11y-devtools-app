import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { SecretRepository } from "../../../domain/ports/secret.repository.js";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type { UsageRepository } from "../../../domain/ports/usage.repository.js";
import { createAiClient } from "../../../infrastructure/ai-providers/client.factory.js";
import { NotFoundError, DomainError } from "../../../domain/errors/index.js";
import type { ProviderType, AiBinding } from "../../../shared/types.js";
import type { AiProxyInput, AiProxyOutput } from "../../dto/proxy.dto.js";
import { PROXY } from "../../../shared/constants.js";

export class AiProxyUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly secrets: SecretRepository,
    private readonly crypto: CryptoPort,
    private readonly usage: UsageRepository,
    private readonly ai?: AiBinding,
  ) {}

  async execute(
    userId: string,
    input: AiProxyInput,
  ): Promise<AiProxyOutput | ReadableStream<Uint8Array>> {
    const startTime = Date.now();

    // 1. Get connection (with ownership check)
    const connection = await this.providers.findByIdAndUser(
      input.connectionId,
      userId,
    );
    if (!connection) {
      throw new NotFoundError("Provider connection", input.connectionId);
    }
    if (!connection.isActive) {
      throw new DomainError("PROVIDER_INACTIVE", "Provider connection is not active");
    }

    // 2. Decrypt API key
    const secret = await this.secrets.findByConnectionId(connection.id);
    if (!secret) {
      throw new NotFoundError("Provider secret");
    }
    const apiKey = this.crypto.decrypt(secret);

    // 3. Decrypt custom headers if present
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

    // 4. Resolve base URL
    const baseUrl =
      connection.baseUrl ??
      PROXY.KNOWN_PROVIDERS[
        connection.providerType as keyof typeof PROXY.KNOWN_PROVIDERS
      ];
    if (!baseUrl) {
      throw new DomainError("NO_BASE_URL", "No base URL configured for provider");
    }

    // 5. Create AI client and execute
    const client = createAiClient(connection.providerType as ProviderType, this.ai);

    try {
      if (input.stream) {
        const stream = await client.completeStream({
          baseUrl,
          apiKey,
          model: input.model,
          messages: input.messages,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
          customHeaders,
        });

        // Record usage (approximate for streaming)
        this.usage
          .create({
            userId,
            connectionId: connection.id,
            modelId: input.model,
            status: "success",
            latencyMs: Date.now() - startTime,
          })
          .catch(() => {/* non-blocking */});

        return stream;
      }

      const result = await client.complete({
        baseUrl,
        apiKey,
        model: input.model,
        messages: input.messages,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        customHeaders,
      });

      // Record usage
      await this.usage.create({
        userId,
        connectionId: connection.id,
        modelId: input.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        latencyMs: Date.now() - startTime,
        status: "success",
      });

      return {
        content: result.content,
        model: result.model,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
        },
      };
    } catch (error) {
      // Record failed usage
      await this.usage
        .create({
          userId,
          connectionId: connection.id,
          modelId: input.model,
          latencyMs: Date.now() - startTime,
          status: "error",
          errorCode:
            error instanceof DomainError ? error.code : "UNKNOWN_ERROR",
        })
        .catch(() => {/* non-blocking */});

      throw error;
    }
  }
}
