/**
 * A status link is the only thing between a stranger and a customer's
 * application, so the core never invents one itself — and tests need seeded,
 * reproducible values. The same generator also supplies the randomness behind
 * order references and idempotency keys.
 *
 * Guarantees every adapter must honour:
 * - URL-safe: only `[A-Za-z0-9_-]`, so a token survives a path segment unescaped.
 * - At least `TOKEN_MIN_LENGTH` characters, carrying 256 bits of entropy in the
 *   real adapter.
 * - Never returns the same value twice.
 */
export interface TokenGenerator {
  /**
   * A fresh token on every call. Uniqueness holds within one generator: the
   * fake is a counter, so two instances repeat each other's values.
   */
  generate(): string
}

/** 32 bytes, base64url-encoded. */
export const TOKEN_MIN_LENGTH = 43

/** What a token may contain: the base64url alphabet, safe in a URL path as it is. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/
