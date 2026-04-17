import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnvelopeEncryption } from "../src/infrastructure/crypto/envelope-encryption.js";
import { DecryptionFailedError, InvalidKekVersionError } from "../src/domain/errors/index.js";
import { randomBytes } from "node:crypto";

describe("EnvelopeEncryption", () => {
  const kekBase64 = randomBytes(32).toString("base64");
  let crypto: EnvelopeEncryption;

  beforeEach(() => {
    crypto = new EnvelopeEncryption(kekBase64, 1);
  });

  describe("constructor", () => {
    it("should throw if KEK is not 32 bytes", () => {
      const shortKey = randomBytes(16).toString("base64");
      expect(() => new EnvelopeEncryption(shortKey, 1)).toThrow(
        "KEK must be exactly 32 bytes",
      );
    });

    it("should accept valid 32-byte base64 KEK", () => {
      expect(() => new EnvelopeEncryption(kekBase64, 1)).not.toThrow();
    });
  });

  describe("encrypt + decrypt", () => {
    it("should roundtrip a simple string", () => {
      const plaintext = "sk-test-123456";
      const envelope = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(envelope);
      expect(decrypted).toBe(plaintext);
    });

    it("should roundtrip unicode content", () => {
      const plaintext = "API키: こんにちは 🔐";
      const envelope = crypto.encrypt(plaintext);
      expect(crypto.decrypt(envelope)).toBe(plaintext);
    });

    it("should roundtrip empty string", () => {
      const envelope = crypto.encrypt("");
      expect(crypto.decrypt(envelope)).toBe("");
    });

    it("should roundtrip large payload", () => {
      const plaintext = "x".repeat(10_000);
      const envelope = crypto.encrypt(plaintext);
      expect(crypto.decrypt(envelope)).toBe(plaintext);
    });

    it("should produce different ciphertext each time (random DEK + IV)", () => {
      const plaintext = "same-plaintext";
      const e1 = crypto.encrypt(plaintext);
      const e2 = crypto.encrypt(plaintext);

      expect(e1.ciphertext).not.toEqual(e2.ciphertext);
      expect(e1.encryptedDek).not.toEqual(e2.encryptedDek);
      expect(e1.dekIv).not.toEqual(e2.dekIv);
      expect(e1.cipherIv).not.toEqual(e2.cipherIv);
    });

    it("should set kekVersion to current version", () => {
      const envelope = crypto.encrypt("test");
      expect(envelope.kekVersion).toBe(1);
    });
  });

  describe("decrypt errors", () => {
    it("should throw DecryptionFailedError for tampered ciphertext", () => {
      const envelope = crypto.encrypt("test");
      envelope.ciphertext[0] ^= 0xff; // flip a byte
      expect(() => crypto.decrypt(envelope)).toThrow(DecryptionFailedError);
    });

    it("should throw DecryptionFailedError for tampered authTag", () => {
      const envelope = crypto.encrypt("test");
      envelope.authTag[0] ^= 0xff;
      expect(() => crypto.decrypt(envelope)).toThrow(DecryptionFailedError);
    });

    it("should throw DecryptionFailedError for tampered encryptedDek", () => {
      const envelope = crypto.encrypt("test");
      envelope.encryptedDek[0] ^= 0xff;
      expect(() => crypto.decrypt(envelope)).toThrow(DecryptionFailedError);
    });

    it("should throw InvalidKekVersionError for unknown KEK version", () => {
      const envelope = crypto.encrypt("test");
      envelope.kekVersion = 999;
      expect(() => crypto.decrypt(envelope)).toThrow(InvalidKekVersionError);
    });
  });

  describe("KEK rotation", () => {
    it("should rotate DEK to new KEK version", () => {
      const kek2Base64 = randomBytes(32).toString("base64");
      crypto.addKekVersion(2, kek2Base64);

      const original = crypto.encrypt("secret-data");
      expect(original.kekVersion).toBe(1);

      const rotated = crypto.rotateDek(original, 2);
      expect(rotated.kekVersion).toBe(2);

      // Decrypting rotated envelope should yield original plaintext
      expect(crypto.decrypt(rotated)).toBe("secret-data");
    });

    it("should throw for invalid new KEK version in rotation", () => {
      const envelope = crypto.encrypt("test");
      expect(() => crypto.rotateDek(envelope, 99)).toThrow(
        InvalidKekVersionError,
      );
    });

    it("should reject addKekVersion with wrong size", () => {
      expect(() =>
        crypto.addKekVersion(2, randomBytes(16).toString("base64")),
      ).toThrow("KEK must be exactly 32 bytes");
    });

    it("should decrypt with old KEK after adding new version", () => {
      const envelope = crypto.encrypt("old-data");
      const kek2 = randomBytes(32).toString("base64");
      crypto.addKekVersion(2, kek2);

      // Should still decrypt v1 envelopes
      expect(crypto.decrypt(envelope)).toBe("old-data");
    });
  });
});
