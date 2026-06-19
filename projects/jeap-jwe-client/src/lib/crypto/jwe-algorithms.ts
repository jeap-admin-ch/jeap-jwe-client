/**
 * The key management algorithm used to encrypt request bodies
 * and request-local response keys for the backend.
 */
export const JEAP_JWE_REQUEST_ALGORITHM = 'RSA-OAEP-256' as const;

/**
 * The content encryption algorithm used for all JWE payloads.
 */
export const JEAP_JWE_CONTENT_ENCRYPTION = 'A256GCM' as const;

/**
 * The direct key management algorithm used by the backend for encrypted responses.
 */
export const JEAP_JWE_RESPONSE_ALGORITHM = 'dir' as const;

/**
 * HTTP media type used for compact JWE payloads.
 */
export const JEAP_JWE_MEDIA_TYPE = 'application/jose';

/**
 * HTTP header carrying the encrypted response CEK.
 */
export const JEAP_JWE_RESPONSE_KEY_HEADER = 'JWE-Response-Key';

/**
 * A256GCM uses a 256-bit content encryption key.
 */
export const JEAP_JWE_RESPONSE_CEK_BYTES = 32;
