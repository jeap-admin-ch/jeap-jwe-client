# Backend contract

This document describes the HTTP and JWE contract between the Angular client and the backend service.

## Backend configuration endpoint

The client loads the backend JWE configuration from:

```http
GET /.well-known/jwe-config
Accept: application/json
```

This endpoint must be public and unencrypted. It must not require `Accept: application/jose` and must not require `JWE-Response-Key`.

Example response:

```json
{
  "jwksUri": "/.well-known/jwks.json",
  "refreshIntervalSeconds": 300,
  "exclude": [
    {
      "method": "*",
      "path": "/actuator/**"
    },
    {
      "method": "GET",
      "path": "/public/**"
    }
  ]
}
```

Fields:

| Field                    | Meaning                                                   |
|--------------------------|-----------------------------------------------------------|
| `jwksUri`                | Relative or absolute URI of the public JWKS endpoint      |
| `refreshIntervalSeconds` | Recommended JWKS refresh interval                         |
| `exclude`                | Backend-provided paths that do not require JWE protection |

## JWKS endpoint

The client loads public encryption keys from the configured `jwksUri`.

```http
GET /.well-known/jwks.json
Accept: application/json
```

This endpoint must be public and unencrypted.

Example response:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "transit-key-2026-06",
      "use": "enc",
      "alg": "RSA-OAEP-256",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

Rules:

- Only public JWKs are allowed.
- Private JWK parameters must never be published.
- Keys must be ordered by backend preference.
- The first key in `keys` is used by the client for new request encryption.
- The client must not sort or reorder keys.

## Protected request headers

Every protected request contains:

```http
Accept: application/jose
JWE-Response-Key: <compact-jwe>
```

Requests with an encrypted body additionally contain:

```http
Content-Type: application/jose
```

## Request body encryption

Request bodies are encrypted as compact JWE.

Protected header:

```json
{
  "alg": "RSA-OAEP-256",
  "enc": "A256GCM",
  "kid": "<backend-public-key-id>",
  "cty": "application/json"
}
```

The `cty` value contains the original request content type.

## Response key envelope

`JWE-Response-Key` carries a request-local CEK for the response.

Protected header:

```json
{
  "alg": "RSA-OAEP-256",
  "enc": "A256GCM",
  "kid": "<backend-public-key-id>",
  "cty": "application/octet-stream"
}
```

The plaintext of this JWE is a 32-byte CEK. This CEK is used by the backend to encrypt the response for this request only.

## Encrypted response

Successful protected responses use:

```http
Content-Type: application/jose
```

The response body is a compact JWE encrypted with the request-local response CEK.

Protected header:

```json
{
  "alg": "dir",
  "enc": "A256GCM",
  "cty": "application/json"
}
```

The `cty` value contains the original response content type.

## Retryable backend error

The backend only needs one retryable error code for automatic client retry:

```text
JWE_UNKNOWN_KID
```

Meaning:

```text
The key identifier used by the client is unknown or no longer accepted by this service.
```

The backend returns:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json
```

```json
{
  "type": "urn:problem-type:jwe-unknown-kid",
  "title": "Unknown JWE key identifier",
  "status": 400,
  "detail": "The JWE key identifier is unknown or no longer accepted by this service.",
  "code": "JWE_UNKNOWN_KID"
}
```

The client only inspects the `code` field to decide whether to retry. The `type`,
`title`, and `detail` fields are informational and are not interpreted by the client.

Backend guarantee:

The backend must return this error before controller logic, business logic, database writes, event publishing, messaging, or external calls start. This makes it safe for the client to refresh JWKS and retry the original request once.

