import { ValidationError } from "../../domain/errors/index.js";

/**
 * SSRF guard: validates URLs before making requests to AI providers.
 * Blocks private IPs, metadata endpoints, and non-HTTPS schemes.
 */

const BLOCKED_IP_RANGES = [
  // Loopback
  /^127\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
  // Private RFC 1918
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // Link-local
  /^169\.254\./,
  /^fe80:/i,
  // Cloud metadata
  /^100\.100\.100\.200$/, // Alibaba
  /^fd00:/i, // ULA
];

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.google.com",
  "169.254.169.254", // AWS/GCP metadata
  "100.100.100.200", // Alibaba metadata
  "[fd00::1]",
]);

export async function validateProviderUrl(urlString: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new ValidationError(`Invalid URL: ${urlString}`);
  }

  // Only HTTPS allowed
  if (url.protocol !== "https:") {
    throw new ValidationError("Only HTTPS URLs are allowed for AI providers");
  }

  // Block known metadata hostnames
  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new ValidationError("URL hostname is blocked (metadata endpoint)");
  }

  // Resolve DNS and check for private IPs
  // In CF Workers, fetch() handles DNS resolution internally
  // We validate the hostname pattern here as a first pass
  if (isPrivateIp(url.hostname)) {
    throw new ValidationError(
      "URL resolves to a private/reserved IP address",
    );
  }

  // Block URLs with authentication in the URL itself
  if (url.username || url.password) {
    throw new ValidationError("URLs with embedded credentials are not allowed");
  }

  // Block non-standard ports commonly used for internal services
  if (url.port && !["443", "8443"].includes(url.port)) {
    throw new ValidationError(
      "Only standard HTTPS ports (443, 8443) are allowed",
    );
  }

  return url;
}

function isPrivateIp(hostname: string): boolean {
  return BLOCKED_IP_RANGES.some((pattern) => pattern.test(hostname));
}
