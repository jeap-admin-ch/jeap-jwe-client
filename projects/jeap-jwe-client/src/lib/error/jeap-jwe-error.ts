/**
 * Error codes exposed by the JWE client library.
 *
 * Codes are intentionally stable so applications can make explicit decisions
 * without parsing implementation-specific error messages.
 */
export type JeapJweErrorCode =
  | 'JWE_UNKNOWN_KID'
  | 'JWE_MALFORMED'
  | 'JWE_UNSUPPORTED_ALGORITHM'
  | 'JWE_UNSUPPORTED_MEDIA_TYPE'
  | 'JWE_REQUEST_SERIALIZATION_FAILED'
  | 'JWE_REQUEST_ENCRYPTION_FAILED'
  | 'JWE_DECRYPTION_FAILED'
  | 'JWE_CONFIG_LOAD_FAILED'
  | 'JWE_KEY_RETRIEVAL_FAILED'
  | 'JWE_JWKS_INVALID';

/**
 * Typed error used by all public JWE client operations.
 *
 * The message must be safe for application logs. It must never contain
 * plaintext payloads, compact JWE values, CEKs, private keys, or JWK modulus data.
 */
export class JeapJweError extends Error {
  constructor(
    public readonly code: JeapJweErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public override readonly cause?: unknown
  ) {
    super(message);

    this.name = 'JeapJweError';

    /**
     * Restores the proper prototype chain when targeting older runtimes.
     */
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
