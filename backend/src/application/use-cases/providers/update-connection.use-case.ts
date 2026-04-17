import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { SecretRepository } from "../../../domain/ports/secret.repository.js";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import type { UpdateConnectionInput, ConnectionOutput } from "../../dto/provider.dto.js";
import { NotFoundError } from "../../../domain/errors/index.js";
import { toConnectionOutput } from "./create-connection.use-case.js";

export class UpdateConnectionUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly secrets: SecretRepository,
    private readonly crypto: CryptoPort,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    userId: string,
    connectionId: string,
    input: UpdateConnectionInput,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<ConnectionOutput> {
    const connection = await this.providers.findByIdAndUser(
      connectionId,
      userId,
    );
    if (!connection) {
      throw new NotFoundError("Provider connection", connectionId);
    }

    // Update API key if provided
    if (input.apiKey) {
      const existing = await this.secrets.findByConnectionId(connectionId);
      if (existing) {
        const encrypted = this.crypto.encrypt(input.apiKey);
        await this.secrets.update(existing.id, {
          encryptedDek: encrypted.encryptedDek,
          dekIv: encrypted.dekIv,
          ciphertext: encrypted.ciphertext,
          cipherIv: encrypted.cipherIv,
          authTag: encrypted.authTag,
          kekVersion: encrypted.kekVersion,
          rotatedAt: new Date(),
        });
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (input.displayName !== undefined) updateData.displayName = input.displayName;
    if (input.baseUrl !== undefined) updateData.baseUrl = input.baseUrl;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    if (input.customHeaders !== undefined) {
      if (input.customHeaders && Object.keys(input.customHeaders).length > 0) {
        const headersJson = JSON.stringify(input.customHeaders);
        const encrypted = this.crypto.encrypt(headersJson);
        updateData.customHeadersEnc = JSON.stringify({
          encryptedDek: encrypted.encryptedDek.toString("base64"),
          dekIv: encrypted.dekIv.toString("base64"),
          ciphertext: encrypted.ciphertext.toString("base64"),
          cipherIv: encrypted.cipherIv.toString("base64"),
          authTag: encrypted.authTag.toString("base64"),
          kekVersion: encrypted.kekVersion,
        });
      } else {
        updateData.customHeadersEnc = null;
      }
    }

    const updated = await this.providers.update(connectionId, updateData);

    // Audit
    await this.audit.create({
      userId,
      action: "provider.updated",
      resourceType: "provider",
      resourceId: connectionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return toConnectionOutput(updated);
  }
}
