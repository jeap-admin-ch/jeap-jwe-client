# Key rotation

The backend controls key rotation through the JWKS endpoint.

## Key ordering

The client uses the first key in the JWKS response for new request encryption.

```json
{
  "keys": [
    { "kid": "current-key", "alg": "RSA-OAEP-256", "use": "enc", "kty": "RSA" },
    { "kid": "previous-key", "alg": "RSA-OAEP-256", "use": "enc", "kty": "RSA" }
  ]
}
```

The client must not sort or reorder keys. Backend order is authoritative.

## Normal rotation

Recommended backend behavior:

1. Publish a new public key as the first JWKS key.
2. Keep previous keys available for a transition period.
3. Reject requests encrypted with keys that are no longer accepted for new requests by returning `JWE_UNKNOWN_KEY_ID`.

## Client refresh

The client refreshes JWKS:

- periodically, based on a client-side refresh interval (default 300 seconds),
- on demand when the backend returns `JWE_UNKNOWN_KEY_ID`.

## Retry behavior

When the backend returns:

```json
{
  "status": 400,
  "code": "JWE_UNKNOWN_KEY_ID"
}
```

The client:

1. Refreshes JWKS.
2. Selects the first key from the refreshed JWKS.
3. Creates a new request JWE.
4. Creates a new request-local response CEK.
5. Creates a new `JWE-Response-Key`.
6. Retries the original request once.

If the retry fails again with `JWE_UNKNOWN_KEY_ID`, the typed error is returned to the application. No third request is sent.

## Why one backend retry code is enough

The client action is identical for these backend situations:

- the `kid` is truly unknown,
- the `kid` is known but no longer accepted,
- the client cached an outdated JWKS,
- the client talks to a backend instance with newer key state.

For all these cases, the client should refresh JWKS and retry once. Therefore the backend can use one code:

```text
JWE_UNKNOWN_KEY_ID
```
