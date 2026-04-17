import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { SecretRepository } from "../../../domain/ports/secret.repository.js";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import type { CreateConnectionInput, ConnectionOutput } from "../../dto/provider.dto.js";
import { PROXY } from "../../../shared/constants.js";
import type { ProviderType } from "../../../shared/types.js";

export class CreateConnectionUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly secrets: SecretRepository,
    private readonly crypto: CryptoPort,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    userId: string,
    input: CreateConnectionInput,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<ConnectionOutput> {
    // Resolve base URL for known providers
    const baseUrl =
      input.providerType === "custom"
        ? input.baseUrl!
        : PROXY.KNOWN_PROVIDERS[input.providerType as keyof typeof PROXY.KNOWN_PROVIDERS] ?? input.baseUrl;

    // Encrypt custom headers if provided
    let customHeadersEnc: string | null = null;
    if (input.customHeaders && Object.keys(input.customHeaders).length > 0) {
      const headersJson = JSON.stringify(input.customHeaders);
      const encrypted = this.crypto.encrypt(headersJson);
      customHeadersEnc = JSON.stringify({
        encryptedDek: encrypted.encryptedDek.toString("base64"),
        dekIv: encrypted.dekIv.toString("base64"),
        ciphertext: encrypted.ciphertext.toString("base64"),
        cipherIv: encrypted.cipherIv.toString("base64"),
        authTag: encrypted.authTag.toString("base64"),
        kekVersion: encrypted.kekVersion,
      });
    }

    // Create connection
    const connection = await this.providers.create({
      userId,
      providerType: input.providerType as ProviderType,
      displayName: input.displayName,
      baseUrl,
      customHeadersEnc,
    });

    // Encrypt and store API key
    const encrypted = this.crypto.encrypt(input.apiKey);
    await this.secrets.create({
      connectionId: connection.id,
      secretType: "api_key",
      encryptedDek: encrypted.encryptedDek,
      dekIv: encrypted.dekIv,
      ciphertext: encrypted.ciphertext,
      cipherIv: encrypted.cipherIv,
      authTag: encrypted.authTag,
      kekVersion: encrypted.kekVersion,
    });

    // Audit
    await this.audit.create({
      userId,
      action: "provider.created",
      resourceType: "provider",
      resourceId: connection.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { providerType: input.providerType },
    });

    return toConnectionOutput(connection);
  }
}

export function toConnectionOutput(
  connection: {
    id: string;
    providerType: string;
    displayName: string;
    baseUrl: string | null;
    customHeadersEnc: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
): ConnectionOutput {
  return {
    id: connection.id,
    providerType: connection.providerType,
    displayName: connection.displayName,
    baseUrl: connection.baseUrl,
    hasCustomHeaders: connection.customHeadersEnc !== null,
    isActive: connection.isActive,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}
