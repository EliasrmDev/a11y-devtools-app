import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type {
  CryptoPort,
  EncryptionResult,
  EncryptionEnvelope,
} from "../../domain/ports/crypto.port.js";
import {
  DecryptionFailedError,
  InvalidKekVersionError,
} from "../../domain/errors/index.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const DEK_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16;

export class EnvelopeEncryption implements CryptoPort {
  private readonly keks: Map<number, Buffer>;
  private readonly currentVersion: number;

  constructor(kekCurrent: string, kekVersion: number) {
    const kekBuffer = Buffer.from(kekCurrent, "base64");
    if (kekBuffer.length !== 32) {
      throw new Error("KEK must be exactly 32 bytes (base64-encoded)");
    }
    this.currentVersion = kekVersion;
    this.keks = new Map([[kekVersion, kekBuffer]]);
  }

  /** Add a previous KEK version for rotation support */
  addKekVersion(version: number, kekBase64: string): void {
    const kekBuffer = Buffer.from(kekBase64, "base64");
    if (kekBuffer.length !== 32) {
      throw new Error("KEK must be exactly 32 bytes (base64-encoded)");
    }
    this.keks.set(version, kekBuffer);
  }

  encrypt(plaintext: string): EncryptionResult {
    // 1. Generate random DEK
    const dek = randomBytes(DEK_LENGTH);

    // 2. Encrypt DEK with current KEK (wrap)
    const dekIv = randomBytes(IV_LENGTH);
    const kek = this.getKek(this.currentVersion);
    const dekCipher = createCipheriv(ALGORITHM, kek, dekIv);
    const encryptedDek = Buffer.concat([
      dekCipher.update(dek),
      dekCipher.final(),
    ]);
    // Store DEK auth tag appended to encryptedDek
    const dekAuthTag = dekCipher.getAuthTag();
    const encryptedDekWithTag = Buffer.concat([encryptedDek, dekAuthTag]);

    // 3. Encrypt plaintext with DEK
    const cipherIv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, dek, cipherIv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // 4. Zero out DEK from memory
    dek.fill(0);

    return {
      encryptedDek: encryptedDekWithTag,
      dekIv,
      ciphertext,
      cipherIv,
      authTag,
      kekVersion: this.currentVersion,
    };
  }

  decrypt(envelope: EncryptionEnvelope): string {
    try {
      // 1. Unwrap DEK using the KEK version it was encrypted with
      const kek = this.getKek(envelope.kekVersion);
      const dekAuthTag = envelope.encryptedDek.subarray(
        envelope.encryptedDek.length - AUTH_TAG_LENGTH,
      );
      const encDek = envelope.encryptedDek.subarray(
        0,
        envelope.encryptedDek.length - AUTH_TAG_LENGTH,
      );

      const dekDecipher = createDecipheriv(ALGORITHM, kek, envelope.dekIv);
      dekDecipher.setAuthTag(dekAuthTag);
      const dek = Buffer.concat([
        dekDecipher.update(encDek),
        dekDecipher.final(),
      ]);

      // 2. Decrypt ciphertext with DEK
      const decipher = createDecipheriv(ALGORITHM, dek, envelope.cipherIv);
      decipher.setAuthTag(envelope.authTag);
      const plaintext = Buffer.concat([
        decipher.update(envelope.ciphertext),
        decipher.final(),
      ]).toString("utf8");

      // 3. Zero out DEK
      dek.fill(0);

      return plaintext;
    } catch (error) {
      if (error instanceof InvalidKekVersionError) throw error;
      throw new DecryptionFailedError();
    }
  }

  rotateDek(envelope: EncryptionEnvelope, newKekVersion: number): EncryptionResult {
    // Decrypt the plaintext, then re-encrypt with new KEK version
    const plaintext = this.decrypt(envelope);
    const previousCurrentVersion = this.currentVersion;

    // Temporarily set the target version as current for encryption
    (this as unknown as { currentVersion: number }).currentVersion = newKekVersion;
    const result = this.encrypt(plaintext);
    (this as unknown as { currentVersion: number }).currentVersion = previousCurrentVersion;

    return result;
  }

  private getKek(version: number): Buffer {
    const kek = this.keks.get(version);
    if (!kek) {
      throw new InvalidKekVersionError(version);
    }
    return kek;
  }
}
