/**
 * A one-time status link is the only thing between a stranger and a customer's
 * application, so the core never invents one itself — and tests need seeded,
 * reproducible values.
 *
 * Guarantees every adapter must honour:
 * - URL-safe: only `[A-Za-z0-9_-]`, so a token survives a path segment unescaped.
 * - At least `TOKEN_MIN_LENGTH` characters, carrying 256 bits of entropy in the
 *   real adapter.
 * - Never returns the same value twice.
 */
export interface TokenGenerator {
  generate(): string
}

/** 32 bytes, base64url-encoded. */
export const TOKEN_MIN_LENGTH = 43

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/
