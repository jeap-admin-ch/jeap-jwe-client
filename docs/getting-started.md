# Getting started

`jeap-jwe-client` adds transparent JWE request and response protection to Angular `HttpClient` calls.

Your application code keeps using normal Angular request and response types. The library changes only the HTTP transport format between the Angular application and the configured backend.

For all configuration options, see [Configuration](./configuration.md).

## What you get

With `jeap-jwe-client` enabled:

- requests to the configured backend origin are protected when their path matches an include pattern and no exclude pattern
- request bodies are encrypted when a body is present
- every protected request sends a `JWE-Response-Key`
- encrypted `application/jose` responses are decrypted automatically
- non-included and excluded endpoints are forwarded unchanged
- requests to other backend origins are ignored

Your Angular code still looks like normal `HttpClient` code.

```ts
http.post<Person>('/api/persons', {
  name: 'Alice',
});
```

The library handles the JWE transport internally.

## Installation

```bash
npm install @jeap/jeap-jwe-client
```

`jose` is pulled in automatically as a bundled runtime dependency.

## Minimal setup

Register the JWE client configuration and the functional Angular HTTP interceptor. The library does not call `provideHttpClient` itself: the consuming application owns its `HttpClient` setup and must register the `jeapJweInterceptor`, as shown below.

```ts
import {ApplicationConfig} from '@angular/core';
import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {
  jeapJweInterceptor,
  provideJeapJweClient,
} from '@jeap/jeap-jwe-client';

export const appConfig: ApplicationConfig = {
  providers: [
    provideJeapJweClient({
      origin: 'https://api.example.ch',
    }),
    provideHttpClient(withInterceptors([jeapJweInterceptor])),
  ],
};
```

This is enough when the backend exposes the default discovery endpoints:

```text
GET /.well-known/jwe-configuration
GET /.well-known/jwks.json
```

Both URLs are resolved against the configured `origin`.

For example, with this configuration:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
});
```

the client loads:

```text
https://api.example.ch/.well-known/jwe-configuration
https://api.example.ch/.well-known/jwks.json
```

## Backend requirements

The backend must provide:

1. a JWE configuration endpoint, unless backend configuration loading is disabled
2. a JWKS endpoint with public encryption keys
3. support for protected `application/jose` requests and responses

By default, the Angular client first loads:

```text
GET /.well-known/jwe-configuration
```

The backend metadata tells the client where the JWKS is located, which protocol settings to use, and which paths are encrypted (the include/exclude path patterns).

A typical backend metadata response looks like this:

```json
{
  "contentTypeAllowlist": ["application/json"],
  "keyEncryptionAlgorithm": "RSA-OAEP-256",
  "contentEncryptionMethod": "A256GCM",
  "jwksPath": "/.well-known/jwks.json",
  "responseKeyHeader": "JWE-Response-Key",
  "includedPaths": ["/*api*/**"],
  "excludedPaths": ["/actuator/**", "/.well-known/jwks.json", "/.well-known/jwe-configuration", "/ui-api/sse/events/**"]
}
```

## Frontend-only configuration or backend-provided configuration

You can configure the client in two main ways.

### Backend-provided configuration

This is the default mode.

The Angular application provides only the backend `origin`. The client then loads additional protocol metadata from the backend.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
});
```

Use this mode when the backend should centrally publish JWE protocol settings such as the JWKS path and the content-type allowlist.

### Frontend-only configuration

You can also configure the Angular client fully in the frontend.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  loadBackendConfig: false,
  jwksPath: '/.well-known/jwks.json',
  include: ['/*api*/**'],
  exclude: ['/api/public/**'],
});
```

In this mode, the client does not call `/.well-known/jwe-configuration`. The Angular configuration defines the JWKS path and the local include/exclude path patterns.

The backend is still responsible for exposing the JWKS endpoint and for processing encrypted requests and responses.

### Adding include and exclude patterns

When backend configuration loading is enabled, the backend publishes its `includedPaths`/`excludedPaths` and the client uses them as the source of truth. You can still add application-specific excludes through the `exclude` option (they are appended on top); the client default excludes apply only when the backend does not publish its own and are kept unless `useDefaultExcludes` is set to `false`.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  exclude: ['/api/local-public/**'],
});
```

For details, see [Include patterns](./configuration.md#include-patterns) and [Exclude patterns](./configuration.md#exclude-patterns).

## What happens on the first protected request

For a protected request to the configured backend origin, the client performs this flow:

```mermaid
flowchart TD
  A[Angular HttpClient request] --> B[Check whether the request matches the configured origin]
  B --> C[Check whether the path matches an include and no exclude]
  C --> D[Load backend JWE configuration, if enabled]
  D --> E[Load JWKS]
  E --> F[Select an encryption key]
  F --> G[Create a request-local response CEK]
  G --> H[Encrypt the JWE-Response-Key]
  H --> I[Encrypt the request body, if present]
  I --> J[Send the protected HTTP request]
  J --> K["Decrypt the application/jose response"]
  K --> L[Return the plain Angular response]
```

The application receives the same type it requested. The encrypted transport format is not exposed to application code.

## Example POST

Application code:

```ts
http.post<Person>('/api/persons', {
  name: 'Alice',
});
```

Transport request sent to the backend:

```http
POST /api/persons
Accept: application/jose
Content-Type: application/jose
JWE-Response-Key: <compact-jwe>

<compact-jwe-request-body>
```

The original JSON payload is encrypted into the request body. The backend decrypts it and processes normal JSON internally.

The `JWE-Response-Key` contains a request-local content encryption key. The backend uses this key to encrypt the response for this request.

## Example GET

Application code:

```ts
http.get<Person>('/api/persons/123');
```

Transport request sent to the backend:

```http
GET /api/persons/123
Accept: application/jose
JWE-Response-Key: <compact-jwe>
```

There is no encrypted request body for `GET`, but the backend still needs the `JWE-Response-Key` to encrypt the response.

## HTTP headers vs JWE protected headers

The transport request contains normal HTTP headers, for example:

```http
Accept: application/jose
Content-Type: application/jose
JWE-Response-Key: <compact-jwe>
```

These headers are part of the HTTP request.

Inside each compact JWE, there is also a JWE protected header. It contains cryptographic metadata such as:

```json
{
  "alg": "RSA-OAEP-256",
  "enc": "A256GCM",
  "kid": "test-key-1",
  "cty": "application/json"
}
```

The JWE protected header describes how the JWE was encrypted. It is authenticated as part of the JWE. If it is changed, decryption or validation fails.

Common fields are:

| Field | Meaning                               |
|-------|---------------------------------------|
| `alg` | Key management algorithm              |
| `enc` | Content encryption algorithm          |
| `kid` | Key identifier from the JWKS          |
| `cty` | Content type of the encrypted payload |

## Non-protected endpoints

A request is protected only when its path matches an include pattern and no exclude pattern. By default the include pattern is `/*api*/**` (or whatever the backend publishes), so non-API paths are not protected. In addition, the client default excludes (used when the backend does not publish its own `excludedPaths`) are:

```text
/.well-known/**
/actuator/**
/health
```

Non-included and excluded requests are forwarded unchanged.

For these endpoints:

- no backend JWE configuration is loaded
- no JWKS is loaded
- no `Accept: application/jose` header is added
- no `JWE-Response-Key` header is added
- no request body encryption is performed

Default excludes protect application discovery and health endpoints from encryption. They are not what prevents a bootstrap loop for the protocol endpoints: the configuration and JWKS requests always bypass the interceptor because the client issues them through Angular's `HttpBackend` directly, so there is never a recursive bootstrap loop regardless of excludes.

## Next steps

After the minimal setup works, see [Configuration](./configuration.md) for:

- changing discovery paths
- disabling backend configuration loading
- adding include and exclude patterns
- understanding origin matching
