export interface CryptoPort {
  /** Encrypt a plaintext secret using envelope encryption (DEK/KEK) */
  encrypt(plaintext: string): EncryptionResult;

  /** Decrypt an envelope-encrypted secret */
  decrypt(envelope: EncryptionEnvelope): string;

  /** Re-encrypt a DEK with a new KEK version (for key rotation) */
  rotateDek(envelope: EncryptionEnvelope, newKekVersion: number): EncryptionResult;
}

export interface EncryptionResult {
  encryptedDek: Buffer;
  dekIv: Buffer;
  ciphertext: Buffer;
  cipherIv: Buffer;
  authTag: Buffer;
  kekVersion: number;
}

export interface EncryptionEnvelope {
  encryptedDek: Buffer;
  dekIv: Buffer;
  ciphertext: Buffer;
  cipherIv: Buffer;
  authTag: Buffer;
  kekVersion: number;
}
