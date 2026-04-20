import { MODEL_CACHE } from "../../../shared/constants.js";

/**
 * Thin wrapper around `fetch` that enforces a timeout and normalises errors
 * into a simple `null` return so callers never have to try/catch.
 */
export async function safeFetch<T>(
  url: string,
  init: RequestInit,
  timeoutMs = MODEL_CACHE.FETCH_TIMEOUT_MS,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Like `safeFetch` but throws on non-OK responses instead of returning null.
 * Use this when the caller needs to know *why* a request failed (e.g. admin sync).
 */
export async function fetchJsonOrThrow<T>(
  url: string,
  init: RequestInit,
  timeoutMs = MODEL_CACHE.FETCH_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
