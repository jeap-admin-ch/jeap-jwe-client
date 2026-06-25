/**
 * Error codes exposed by the JWE client library.
 *
 * Codes are intentionally stable so applications can make explicit decisions
 * without parsing implementation-specific error messages.
 */
export type JeapJweErrorCode =
  // Codes reported by the backend in the problem+json `code` field.
  | 'JWE_REQUEST_ENCRYPTION_REQUIRED'
  | 'JWE_RESPONSE_ENCRYPTION_REQUIRED'
  | 'JWE_RESPONSE_KEY_REQUIRED'
  | 'JWE_RESPONSE_KEY_INVALID'
  | 'JWE_INVALID_CONTENT_TYPE'
  | 'JWE_PAYLOAD_TOO_LARGE'
  | 'JWE_UNKNOWN_KEY_ID'
  // Codes shared by the backend and the client, or raised on the client.
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
    /**
     * The originating error, when available. It may carry transport-level
     * detail (such as an HTTP error response) and should not be logged
     * verbatim by applications that handle sensitive data.
     */
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
