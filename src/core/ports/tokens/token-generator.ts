export interface TokenGenerator {
  generate(): string
}

export const TOKEN_MIN_LENGTH = 43

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/
