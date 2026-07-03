# Error handling

The library exposes typed errors through `JeapJweError`.

```ts
export class JeapJweError extends Error {
  constructor(
    public readonly code: JeapJweErrorCode,
    message: string,
    public readonly retryable = false,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'JeapJweError';
  }
}
```

The `cause` may carry transport-level detail, such as an HTTP error response. Applications that handle sensitive data should not log it verbatim.

## Error codes

The client surfaces both codes raised on the client and codes reported by the backend in the problem+json `code` field as typed `JeapJweError` instances.

### Codes reported by the backend

| Code                              | Meaning                                                                 |
|-----------------------------------|-------------------------------------------------------------------------|
| `JWE_REQUEST_ENCRYPTION_REQUIRED` | The backend requires the request to be encrypted                        |
| `JWE_RESPONSE_ENCRYPTION_REQUIRED`| The backend requires the response to be encrypted                       |
| `JWE_RESPONSE_KEY_REQUIRED`       | The backend requires a `JWE-Response-Key`                               |
| `JWE_RESPONSE_KEY_INVALID`        | The `JWE-Response-Key` was rejected by the backend                      |
| `JWE_INVALID_CONTENT_TYPE`        | The backend rejected the request content type                           |
| `JWE_PAYLOAD_TOO_LARGE`           | The encrypted payload exceeds the backend limit                         |
| `JWE_UNKNOWN_KEY_ID`              | Backend rejected the key identifier and the request may be retried once |

### Codes shared by the backend and the client, or raised on the client

| Code                               | Meaning                                                |
|------------------------------------|--------------------------------------------------------|
| `JWE_MALFORMED`                    | JWE data is syntactically invalid                      |
| `JWE_UNSUPPORTED_ALGORITHM`        | JWE uses an unsupported `alg` or `enc`                 |
| `JWE_UNSUPPORTED_MEDIA_TYPE`       | Request or response media type is not supported        |
| `JWE_REQUEST_SERIALIZATION_FAILED` | Request body could not be serialized                   |
| `JWE_REQUEST_ENCRYPTION_FAILED`    | Request protection failed                              |
| `JWE_DECRYPTION_FAILED`            | Response decryption or authentication failed           |
| `JWE_CONFIG_LOAD_FAILED`           | Backend JWE configuration could not be loaded          |
| `JWE_KEY_RETRIEVAL_FAILED`         | JWKS could not be loaded                               |
| `JWE_JWKS_INVALID`                 | JWKS is structurally invalid or contains invalid keys  |

## Failing closed on configuration errors

`JWE_CONFIG_LOAD_FAILED` is raised for every request to the backend origin that is not excluded when the backend configuration cannot be loaded. The client never falls back to sending such requests unprotected: without the backend-published include patterns it cannot know whether the backend considers a path protected, and a potentially protected payload must not leave the browser in plaintext. The error is retryable — a failed configuration load is not cached, so the next request triggers a new load.

## Automatic retry

The client retries a request automatically only on an HTTP 400 problem+json response whose body field `code` equals `JWE_UNKNOWN_KEY_ID`. The client refreshes JWKS and retries the original request once. If the retry fails again, the typed error is returned to the application.

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
