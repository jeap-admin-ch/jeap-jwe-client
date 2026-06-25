# Backend contract

This page describes the backend interface **from the client's perspective** — the discovery
documents the client reads, the headers it sends, and the one error code it acts on.

> **Source of truth.** The full JWE protocol (algorithms, header contract, GET/POST flows, the
> complete error catalogue) is defined and reviewed in the backend starter's
> [Client integration](https://github.com/jeap-admin-ch/jeap-spring-boot-jwe-starter/blob/main/docs/client-integration.md)
> guide. This page only covers what `jeap-jwe-client` consumes and relies on; it does not restate the
> protocol. Where the two differ, the backend documentation wins.

At a glance, the client and the backend agree on: `RSA-OAEP-256` to wrap content-encryption keys,
`A256GCM` for payloads, `dir` for the response body, and `application/jose` on the wire.

## What the client reads from the backend

### Configuration metadata — `/.well-known/jwe-configuration`

Loaded once (cached) before the first protected request, unless backend config loading is disabled.
The endpoint is public and unencrypted. The client reads these fields:

| Field                     | How the client uses it                                                              |
|---------------------------|-------------------------------------------------------------------------------------|
| `contentTypeAllowlist`    | Validates the outgoing request `cty` against it; default `["application/json"]`.     |
| `jwksPath`                | Maps it to the JWKS URL it loads.                                                    |
| `responseKeyHeader`       | Name of the header carrying the response-key envelope (default `JWE-Response-Key`).  |
| `includedPaths`           | Effective include patterns — used as the source of truth for the protect decision.  |
| `excludedPaths`           | Effective exclude patterns (already include the jEAP defaults).                      |
| `keyEncryptionAlgorithm`  | Informational — the client uses `RSA-OAEP-256` regardless.                           |
| `contentEncryptionMethod` | Informational — the client uses `A256GCM` regardless.                               |

`includedPaths`/`excludedPaths` are Spring `PathPattern` strings (no HTTP method): a request is
protected when its path matches an include and no exclude (includes first, excludes win). They — and
`jwksPath` — are **prefixed with the backend's `server.servlet.context-path`** when one is
configured, so they are relative to the origin root and used as-is. See
[Configuration](./configuration.md) for how the client merges these with local patterns, and
[Key rotation](./key-rotation.md) for the JWKS refresh behavior.

The JWKS refresh interval is *not* published by the backend; it is a client-side default (300
seconds).

### JWKS — the `jwksPath` advertised by the metadata

Public encryption keys, served unencrypted. The client enforces that every key is a public RSA
encryption key advertising the expected algorithm, and rejects a JWKS that contains private key
parameters (`JWE_JWKS_INVALID`). It uses **`keys[0]`** for new request encryption and **never sorts
or reorders** the set — backend order is authoritative.

## What the client sends

Every protected request carries `Accept: application/jose` and the response-key envelope in the
`JWE-Response-Key` header; requests with a body add `Content-Type: application/jose`. The client
sets these JWE protected headers:

| JWE                    | `alg`          | `enc`     | other                                        |
|------------------------|----------------|-----------|----------------------------------------------|
| Request body           | `RSA-OAEP-256` | `A256GCM` | `kid` = `keys[0].kid`, `cty` = request type  |
| `JWE-Response-Key`     | `RSA-OAEP-256` | `A256GCM` | `kid` = `keys[0].kid`, `cty` = `application/octet-stream` |

The `JWE-Response-Key` plaintext is a freshly generated 32-byte response CEK, used by the backend to
encrypt the response for this request only (see [Security considerations](./security-considerations.md)).
The backend treats the envelope plaintext as the raw CEK; the `cty` the client sets on it is not
required by the backend.

## Encrypted response

A successful protected response comes back as `application/jose`, a compact JWE with header
`{"alg":"dir","enc":"A256GCM","cty":<original response type>}`, encrypted with the response CEK the
client supplied. The client decrypts it with that CEK and restores the original content type.

## The one error code the client acts on

Of the backend's error catalogue, the client only *acts* on `JWE_UNKNOWN_KEY_ID`: an HTTP `400`
`application/problem+json` whose `code` field equals `JWE_UNKNOWN_KEY_ID`. On it the client refreshes
the JWKS and retries the original request **once** (see [Key rotation](./key-rotation.md)). The
backend guarantees this error is raised before any controller, business logic or side effect runs,
which is what makes the retry safe.

The client only inspects the `code` field; `type`, `title` and `detail` are informational. All other
backend `code` values surface as a typed [`JeapJweError`](./error-handling.md) without an automatic
retry.
