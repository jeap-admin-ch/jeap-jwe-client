# Architecture

`jeap-jwe-client` is organized around a functional Angular HTTP interceptor and a small set of focused services.

## High-level flow

```text
Angular HttpClient
  -> jeapJweInterceptor
  -> Endpoint matcher
  -> Config service
  -> JWKS cache / key selector
  -> Request encryptor
  -> Backend
  -> Response decryptor
  -> Angular application
```

## Components

### `jeapJweInterceptor`

The interceptor is the main entry point. It decides whether a request is protected, delegates encryption, forwards the request, and decrypts encrypted responses.

It also handles the retry flow for the retryable backend error `JWE_UNKNOWN_KID`.

### Endpoint matcher

The matcher checks:

- whether the request targets the configured backend origin,
- whether the path is excluded,
- whether the HTTP method matches an exclude rule.

It ignores query parameters for path matching.

### Config service

The config service combines local Angular configuration with optional backend configuration from `/.well-known/jwe-config`.

It caches the backend config load and avoids loading backend config for locally excluded endpoints.

### JWKS client

The JWKS client loads public JWKs through `HttpBackend` so JWKS loading does not trigger the JWE interceptor.

It validates that keys are public RSA encryption keys using the expected algorithm.

### JWKS cache

The cache stores the latest valid JWKS snapshot. Refreshes are atomic: the current snapshot is replaced only after a valid JWKS response was loaded and validated.

### Key selector

The key selector uses `keys[0]` as the current key for new requests. It never sorts or reorders backend keys.

For unknown key situations it can refresh JWKS and select from the updated snapshot.

### Request encryptor

The request encryptor:

- serializes supported JSON bodies,
- creates a request-local response CEK,
- encrypts `JWE-Response-Key`,
- encrypts the request body when present,
- forces transport response type to `text`,
- stores the original Angular response type in request context.

### Response decryptor

The response decryptor only decrypts responses with `Content-Type: application/jose`.

It validates response JWE algorithms, decrypts with the request-local CEK, deserializes JSON/text responses, and restores the original content type.

## Request context

Every protected request carries a request-local context internally:

```text
original response type
original request content type
response CEK
matched endpoint information
```

The response CEK must never be logged, persisted, cached globally, or exposed outside the request/response pipeline.

## Retry flow

```text
protected request
  -> backend returns 400 application/problem+json code=JWE_UNKNOWN_KID
  -> client refreshes JWKS
  -> client encrypts original request again
  -> client creates a new response CEK
  -> client retries once
  -> second failure is returned to the application
```

There is no retry loop.
