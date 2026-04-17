import { describe, it, expect } from "vitest";
import { validateProviderUrl } from "../src/infrastructure/ai-providers/ssrf-guard.js";
import { ValidationError } from "../src/domain/errors/index.js";

describe("SSRF Guard — validateProviderUrl", () => {
  describe("valid URLs", () => {
    it("should accept standard HTTPS URLs", async () => {
      const url = await validateProviderUrl("https://api.openai.com/v1");
      expect(url.hostname).toBe("api.openai.com");
    });

    it("should accept HTTPS on port 443", async () => {
      const url = await validateProviderUrl("https://api.example.com:443/v1");
      expect(url.hostname).toBe("api.example.com");
    });

    it("should accept HTTPS on port 8443", async () => {
      const url = await validateProviderUrl("https://api.example.com:8443/v1");
      expect(url.port).toBe("8443");
    });
  });

  describe("blocked protocols", () => {
    it("should reject HTTP URLs", async () => {
      await expect(
        validateProviderUrl("http://api.openai.com/v1"),
      ).rejects.toThrow("Only HTTPS URLs are allowed");
    });

    it("should reject file:// URLs", async () => {
      await expect(
        validateProviderUrl("file:///etc/passwd"),
      ).rejects.toThrow("Only HTTPS URLs are allowed");
    });

    it("should reject FTP URLs", async () => {
      await expect(
        validateProviderUrl("ftp://example.com"),
      ).rejects.toThrow("Only HTTPS URLs are allowed");
    });
  });

  describe("private IP blocking", () => {
    it("should reject loopback 127.x.x.x", async () => {
      await expect(
        validateProviderUrl("https://127.0.0.1/v1"),
      ).rejects.toThrow("private/reserved IP");
    });

    it("should reject 10.x.x.x", async () => {
      await expect(
        validateProviderUrl("https://10.0.0.1/v1"),
      ).rejects.toThrow("private/reserved IP");
    });

    it("should reject 172.16.x.x", async () => {
      await expect(
        validateProviderUrl("https://172.16.0.1/v1"),
      ).rejects.toThrow("private/reserved IP");
    });

    it("should reject 192.168.x.x", async () => {
      await expect(
        validateProviderUrl("https://192.168.1.1/v1"),
      ).rejects.toThrow("private/reserved IP");
    });

    it("should reject 0.0.0.0", async () => {
      await expect(
        validateProviderUrl("https://0.0.0.0/v1"),
      ).rejects.toThrow("private/reserved IP");
    });

    it("should reject link-local 169.254.x.x", async () => {
      await expect(
        validateProviderUrl("https://169.254.169.254/latest/meta-data/"),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("cloud metadata blocking", () => {
    it("should reject AWS metadata endpoint", async () => {
      await expect(
        validateProviderUrl("https://169.254.169.254/latest/meta-data/"),
      ).rejects.toThrow(ValidationError);
    });

    it("should reject GCP metadata hostname", async () => {
      await expect(
        validateProviderUrl("https://metadata.google.internal/"),
      ).rejects.toThrow("blocked");
    });

    it("should reject Alibaba metadata endpoint", async () => {
      await expect(
        validateProviderUrl("https://100.100.100.200/"),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("URL safety", () => {
    it("should reject URLs with embedded credentials", async () => {
      await expect(
        validateProviderUrl("https://user:pass@api.example.com/v1"),
      ).rejects.toThrow("embedded credentials");
    });

    it("should reject non-standard ports", async () => {
      await expect(
        validateProviderUrl("https://api.example.com:8080/v1"),
      ).rejects.toThrow("standard HTTPS ports");
    });

    it("should reject invalid URLs", async () => {
      await expect(
        validateProviderUrl("not-a-url"),
      ).rejects.toThrow("Invalid URL");
    });
  });
});
