# Backend contract

This document describes the HTTP and JWE contract between the Angular client and the backend service.

## Backend configuration endpoint

The client loads the backend JWE configuration from:

```http
GET /.well-known/jwe-configuration
Accept: application/json
```

This endpoint must be public and unencrypted. It must not require `Accept: application/jose` and must not require `JWE-Response-Key`.

Example response:

```json
{
  "contentTypeAllowlist": ["application/json"],
  "keyEncryptionAlgorithm": "RSA-OAEP-256",
  "contentEncryptionMethod": "A256GCM",
  "jwksPath": "/.well-known/jwks.json",
  "responseKeyHeader": "JWE-Response-Key"
}
```

Fields:

| Field                     | Meaning                                                                  |
|---------------------------|--------------------------------------------------------------------------|
| `contentTypeAllowlist`    | Content types the backend accepts as JWE payloads (the `cty` value)      |
| `keyEncryptionAlgorithm`  | Advertised key management algorithm (informational)                      |
| `contentEncryptionMethod` | Advertised content encryption method (informational)                     |
| `jwksPath`                | Path of the JWKS endpoint serving the public keys                        |
| `responseKeyHeader`       | Name of the header carrying the response-key envelope                    |

The backend does not publish exclude rules or a JWKS refresh interval. Exclude rules are owned by the client, and the JWKS refresh interval is a client-side default (300 seconds). The client maps `jwksPath` to the JWKS URL it loads.

The client validates the outgoing request `cty` against `contentTypeAllowlist`. When the backend metadata does not advertise an allowlist, the client uses the default `["application/json"]`. A request body whose content type is not allowlisted fails locally with `JWE_UNSUPPORTED_MEDIA_TYPE` before any request is sent.

## JWKS endpoint

The client loads public encryption keys from the JWKS path advertised by the backend (or the local `jwksPath`).

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
JWE_UNKNOWN_KEY_ID
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
  "type": "urn:problem-type:jwe-unknown-key-id",
  "title": "Unknown JWE key identifier",
  "status": 400,
  "detail": "The JWE key identifier is unknown or no longer accepted by this service.",
  "code": "JWE_UNKNOWN_KEY_ID"
}
```

The client retries automatically only on an HTTP 400 problem+json response whose `code` field equals `JWE_UNKNOWN_KEY_ID`.

The client only inspects the `code` field to decide whether to retry. The `type`,
`title`, and `detail` fields are informational and are not interpreted by the client.

Backend guarantee:

The backend must return this error before controller logic, business logic, database writes, event publishing, messaging, or external calls start. This makes it safe for the client to refresh JWKS and retry the original request once.

