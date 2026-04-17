import { describe, it, expect } from "vitest";
import { sha256, constantTimeCompare } from "../src/infrastructure/crypto/hash.js";

describe("sha256", () => {
  it("should produce a 64-char hex string", () => {
    const hash = sha256("test-input");
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });

  it("should produce deterministic output", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
  });

  it("should produce different hashes for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });
});

describe("constantTimeCompare", () => {
  it("should return true for identical strings", () => {
    expect(constantTimeCompare("abc", "abc")).toBe(true);
  });

  it("should return false for different strings of same length", () => {
    expect(constantTimeCompare("abc", "abd")).toBe(false);
  });

  it("should return false for different length strings", () => {
    expect(constantTimeCompare("abc", "abcd")).toBe(false);
  });
});
