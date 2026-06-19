# Error handling

The library exposes typed errors through `JeapJweError`.

```ts
export class JeapJweError extends Error {
  constructor(
    public readonly code: JeapJweErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly cause?: unknown
  ) {
    super(message);
  }
}
```

## Client error codes

The Angular client may use more error codes internally than the backend has to implement.

Typical client-side codes:

| Code                               | Meaning                                                                 |
|------------------------------------|-------------------------------------------------------------------------|
| `JWE_CONFIG_LOAD_FAILED`           | Backend JWE configuration could not be loaded                           |
| `JWE_KEY_RETRIEVAL_FAILED`         | JWKS could not be loaded                                                |
| `JWE_JWKS_INVALID`                 | JWKS is structurally invalid or contains invalid keys                   |
| `JWE_UNKNOWN_KID`                  | Backend rejected the key identifier and the request may be retried once |
| `JWE_MALFORMED`                    | JWE data is syntactically invalid                                       |
| `JWE_UNSUPPORTED_ALGORITHM`        | JWE uses an unsupported `alg` or `enc`                                  |
| `JWE_UNSUPPORTED_MEDIA_TYPE`       | Request or response media type is not supported                         |
| `JWE_REQUEST_SERIALIZATION_FAILED` | Request body could not be serialized                                    |
| `JWE_REQUEST_ENCRYPTION_FAILED`    | Request protection failed                                               |
| `JWE_DECRYPTION_FAILED`            | Response decryption or authentication failed                            |

## Safe error messages

Error messages must not contain:

- plaintext payloads,
- compact JWE values,
- CEKs,
- private keys,
- full JWK key material,
- decrypted response data.

Good example:

```ts
new JeapJweError(
  'JWE_DECRYPTION_FAILED',
  'Failed to decrypt the protected JWE response.'
);
```

Bad example:

```ts
new JeapJweError(
  'JWE_DECRYPTION_FAILED',
  `Failed to decrypt ${compactJwe} with CEK ${cek}`
);
```
