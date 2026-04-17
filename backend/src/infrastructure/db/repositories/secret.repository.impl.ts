import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { encryptedSecrets } from "../schema/encrypted-secrets.js";
import type {
  SecretRepository,
  EncryptedSecret,
  CreateSecretData,
  UpdateSecretData,
} from "../../../domain/ports/secret.repository.js";

export class SecretRepositoryImpl implements SecretRepository {
  constructor(private readonly db: Database) {}

  async findByConnectionId(
    connectionId: string,
  ): Promise<EncryptedSecret | null> {
    const rows = await this.db
      .select()
      .from(encryptedSecrets)
      .where(eq(encryptedSecrets.connectionId, connectionId))
      .limit(1);

    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async create(data: CreateSecretData): Promise<EncryptedSecret> {
    const rows = await this.db
      .insert(encryptedSecrets)
      .values({
        connectionId: data.connectionId,
        secretType: data.secretType ?? "api_key",
        encryptedDek: data.encryptedDek,
        dekIv: data.dekIv,
        ciphertext: data.ciphertext,
        cipherIv: data.cipherIv,
        authTag: data.authTag,
        kekVersion: data.kekVersion,
      })
      .returning();

    return this.toDomain(rows[0]);
  }

  async update(id: string, data: UpdateSecretData): Promise<void> {
    await this.db
      .update(encryptedSecrets)
      .set({
        encryptedDek: data.encryptedDek,
        dekIv: data.dekIv,
        ciphertext: data.ciphertext,
        cipherIv: data.cipherIv,
        authTag: data.authTag,
        kekVersion: data.kekVersion,
        rotatedAt: data.rotatedAt,
      })
      .where(eq(encryptedSecrets.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(encryptedSecrets)
      .where(eq(encryptedSecrets.id, id));
  }

  async findByKekVersion(
    version: number,
    limit: number,
  ): Promise<EncryptedSecret[]> {
    const rows = await this.db
      .select()
      .from(encryptedSecrets)
      .where(eq(encryptedSecrets.kekVersion, version))
      .limit(limit);

    return rows.map(this.toDomain);
  }

  private toDomain(
    row: typeof encryptedSecrets.$inferSelect,
  ): EncryptedSecret {
    return {
      id: row.id,
      connectionId: row.connectionId,
      secretType: row.secretType,
      encryptedDek: Buffer.from(row.encryptedDek as unknown as ArrayBuffer),
      dekIv: Buffer.from(row.dekIv as unknown as ArrayBuffer),
      ciphertext: Buffer.from(row.ciphertext as unknown as ArrayBuffer),
      cipherIv: Buffer.from(row.cipherIv as unknown as ArrayBuffer),
      authTag: Buffer.from(row.authTag as unknown as ArrayBuffer),
      kekVersion: row.kekVersion,
      createdAt: row.createdAt,
      rotatedAt: row.rotatedAt,
    };
  }
}
