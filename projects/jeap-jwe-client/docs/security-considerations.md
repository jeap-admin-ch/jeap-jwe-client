# Security considerations

This library handles sensitive cryptographic material during request and response processing. The following rules apply to implementation, tests, diagnostics, and operations.

## Never log sensitive values

Do not log:

- plaintext request bodies,
- plaintext response bodies,
- compact JWE values,
- CEKs,
- private keys,
- decrypted `JWE-Response-Key` values,
- full JWK key material.

Review traces and test logs must use redacted placeholders:

```text
<compact-jwe length=...>
<redacted 32 bytes>
<redacted>
```

## Public JWKS only

The JWKS endpoint must only publish public keys.

The client rejects invalid JWKS data, including keys with private parameters.

## Supported algorithms

Request body JWE and `JWE-Response-Key` use:

```text
alg: RSA-OAEP-256
enc: A256GCM
```

Encrypted backend responses use:

```text
alg: dir
enc: A256GCM
```

Unsupported algorithms are rejected.

## Request-local response CEK

The response CEK is generated per protected request.

It must not be:

- reused across requests,
- stored in local storage or session storage,
- cached globally,
- logged,
- exposed to application code.

## Transport content type

Protected payloads use:

```http
Content-Type: application/jose
```

Protected responses use:

```http
Content-Type: application/jose
```

The original content type is carried in the JWE `cty` protected header.
