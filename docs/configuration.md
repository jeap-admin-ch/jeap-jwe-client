# Configuration

The library uses one backend configuration. A request to this backend origin is protected when its path matches an **include** pattern and no **exclude** pattern (includes are evaluated first, excludes win). Requests to other origins are ignored.

This mirrors the jEAP backend (`jeap-spring-boot-jwe-starter`), which decides encryption from an include list (default `/*api*/**`) and an exclude list. The backend now publishes both lists in its `/.well-known/jwe-configuration` metadata, so the client can apply the exact same decision.

Start with [Getting started](./getting-started.md) if you have not configured the client yet.

## Configuration overview

```ts
export interface JeapJweClientConfig {
  enabled?: boolean;
  origin: string;
  jwksPath?: string;
  jweConfigPath?: string;
  loadBackendConfig?: boolean;
  include?: string[];
  exclude?: string[];
  useDefaultExcludes?: boolean;
}
```

`include` and `exclude` are simple path patterns (strings), aligned with the backend's `includedPaths`/`excludedPaths`. They do **not** carry an HTTP method — the backend filter is method-agnostic, so a path is either protected or not regardless of the HTTP method.

Minimal configuration:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
});
```

## Configuration modes

You can either load protocol metadata from the backend or define the client-side configuration fully in the frontend.

### Backend-provided configuration

This is the default mode.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
});
```

The client loads backend metadata from:

```text
https://api.example.ch/.well-known/jwe-configuration
```

The backend can provide values such as:

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

When the backend publishes `includedPaths` and `excludedPaths`, those are used as the source of truth for the protect/skip decision — the client mirrors the server exactly. The backend's `excludedPaths` already contains the jEAP defaults (actuator, the JWKS and protocol-metadata endpoints, SSE), so the client does not add its own default excludes on top; it only appends any extra patterns from the local `exclude` option. The client maps the backend `jwksPath` to the JWKS URL it loads. The JWKS refresh interval is a client-side default (300 seconds) and is not published by the backend.

> **Context path:** the backend prefixes `includedPaths`, `excludedPaths` and `jwksPath` with its `server.servlet.context-path` when one is configured (e.g. `/myapp/*api*/**`). The client matches request paths relative to the origin root, so these published paths are used as-is — the context path is not a concern the client has to handle separately.

Use this mode when the backend should centrally manage the JWE protocol settings, including which paths are encrypted.

### Frontend-only configuration

Set `loadBackendConfig` to `false` when the Angular application should define all client-side JWE configuration itself.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  loadBackendConfig: false,
  jwksPath: '/.well-known/jwks.json',
  include: ['/*api*/**'],
  exclude: ['/api/public/**'],
});
```

In this mode:

- no request to `jweConfigPath` is made
- the local `jwksPath` is used
- the local `include` patterns are used (or the default `/*api*/**` when none are given)
- local exclude patterns are used
- default excludes are still applied unless `useDefaultExcludes` is set to `false`

The backend still needs to provide the JWKS endpoint and support encrypted requests and responses.

## Defaults

| Option               |                         Default | Description                                                                        |
|----------------------|--------------------------------:|------------------------------------------------------------------------------------|
| `enabled`            |                          `true` | Enables or disables JWE protection globally                                        |
| `jweConfigPath`      | `/.well-known/jwe-configuration` | Backend JWE configuration endpoint                                                 |
| `jwksPath`           |        `/.well-known/jwks.json` | JWKS endpoint used when backend config loading is disabled or does not override it |
| `loadBackendConfig`  |                          `true` | Loads JWE configuration from the backend                                           |
| `include`            |                    `/*api*/**` | Include patterns used when the backend does not publish `includedPaths`            |
| `useDefaultExcludes` |                          `true` | Adds default excludes for discovery and health endpoints                           |

## `enabled`

Use `enabled: false` to disable JWE protection without removing the provider setup.

```ts
provideJeapJweClient({
  enabled: false,
  origin: 'https://api.example.ch',
});
```

When disabled, requests are forwarded unchanged.

This can be useful for local development, feature toggles, or staged rollouts.

## `origin`

`origin` defines which backend is protected.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
});
```

Protected:

```text
https://api.example.ch/api/persons
```

Ignored:

```text
https://other.example.ch/api/persons
```

Relative Angular requests are resolved against the current browser origin.

For example, this Angular request:

```ts
http.get('/api/persons/123');
```

is resolved by the browser before origin matching is applied.

## `jweConfigPath`

`jweConfigPath` defines where the client loads the backend JWE configuration from.

Default:

```text
/.well-known/jwe-configuration
```

Example:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  jweConfigPath: '/custom/jwe-configuration',
});
```

The final URL is resolved against `origin`:

```text
https://api.example.ch/custom/jwe-configuration
```

This setting is only used when `loadBackendConfig` is enabled.

## `loadBackendConfig`

By default, the client loads backend configuration before the first protected request.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  loadBackendConfig: true,
});
```

Disable backend configuration loading when all client-side configuration should come from the Angular application:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  loadBackendConfig: false,
  jwksPath: '/.well-known/jwks.json',
});
```

When `loadBackendConfig` is disabled:

- no request to `jweConfigPath` is made
- the local `jwksPath` is used
- the local `include` patterns (or the default `/*api*/**`) and the local + default excludes apply

When `loadBackendConfig` is enabled and the backend publishes `includedPaths`/`excludedPaths`, those take precedence over the local `include` and the default excludes; the local `exclude` patterns are still appended on top.

## `jwksPath`

`jwksPath` defines where the client loads the JSON Web Key Set from.

Default:

```text
/.well-known/jwks.json
```

Example:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  jwksPath: '/security/jwks.json',
});
```

The final URL is resolved against `origin`:

```text
https://api.example.ch/security/jwks.json
```

If backend configuration loading is enabled, the backend metadata may provide a `jwksPath`, which the client maps to the JWKS URL it loads.

## Content-type allowlist

The backend advertises a `contentTypeAllowlist` in its metadata. The client validates the outgoing request `cty` against this allowlist. The default allowlist is `["application/json"]`, used when the backend metadata does not advertise one.

A request body whose content type is not in the allowlist fails locally with `JWE_UNSUPPORTED_MEDIA_TYPE` before any request is sent.

## Include patterns

The `include` option lists the paths that are candidates for encryption, mirroring the backend's `includedPaths`. A request is protected only when its path matches an include pattern (and no exclude pattern).

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  include: ['/*api*/**'],
});
```

When backend configuration loading is enabled and the backend publishes `includedPaths`, those take precedence over the local `include`. When neither the backend nor the local configuration provide include patterns, the default `/*api*/**` is used — the same default as the backend (`jeap.jwe.filter.included-paths`).

## Exclude patterns

The `exclude` option lists paths that are never encrypted even when they match an include, mirroring the backend's `excludedPaths`. Define application-specific exclusions with the `exclude` option; the client default excludes apply unless `useDefaultExcludes` is set to `false`.

The include/exclude decision is:

- a request is protected only when its path matches an include pattern
- a request is skipped when it matches an exclude pattern (excludes win)
- excluded or non-included requests are forwarded unchanged

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  exclude: [
    '/api/public/**',
    '/api/status',
  ],
});
```

When the backend publishes `excludedPaths`, that list (which already includes the jEAP defaults) is used as the base and the local `exclude` patterns are appended on top.

### Path matching

Patterns use Spring-style `PathPattern` syntax and apply to both `include` and `exclude`:

| Pattern       | Meaning                              | Matches                                  |
|---------------|--------------------------------------|------------------------------------------|
| `/status`     | Exact path                           | `/status`                                |
| `/public/*`   | One path segment                     | `/public/info`                           |
| `/public/**`  | The prefix and any descendant paths  | `/public`, `/public/info`, `/public/a/b` |
| `/*api*/**`   | First segment containing `api`       | `/api`, `/api/orders`, `/v1api/x`        |

Query parameters are ignored for path matching. For example, the pattern `/api/status` matches both:

```text
/api/status
/api/status?verbose=true
```

## Default excludes

The client default excludes (used when the backend does not publish its own `excludedPaths`) are:

```ts
[
  '/.well-known/**',
  '/actuator/**',
  '/health',
]
```

These keep application discovery and technical health endpoints from being protected with encryption.

Disable default excludes only when you explicitly want full control:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  useDefaultExcludes: false,
});
```

Disabling default excludes does not risk a protocol bootstrap loop. The configuration and JWKS requests always bypass the interceptor because the client issues them through Angular's `HttpBackend` directly, so those requests are never encrypted regardless of excludes. Default excludes only protect your application discovery and health endpoints; removing them simply means those endpoints would be protected when they match an include pattern.

## Server-Sent Events

When the backend publishes its `excludedPaths`, the jEAP SSE endpoint is already on that list and the client honors it automatically. When you configure paths only on the client (e.g. with `loadBackendConfig: false`) and your application consumes SSE endpoints on the protected origin, add them to `exclude` so they are forwarded unchanged:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  exclude: ['/api/sse/**'],
});
```

## Configuration recipes

### Use backend-managed configuration

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
});
```

Use this when the backend exposes the default discovery endpoints.

### Use only local Angular configuration

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  loadBackendConfig: false,
  jwksPath: '/.well-known/jwks.json',
});
```

Use this when no backend JWE configuration endpoint should be called.

### Add local public endpoints

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  exclude: ['/api/public/**'],
});
```

Use this when some application endpoints should stay unprotected.

### Define include and excludes without default excludes

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  useDefaultExcludes: false,
  include: ['/*api*/**'],
  exclude: [
    '/api/public/**',
    '/health',
  ],
});
```

Use this when the Angular application must fully control the include and exclude lists without the built-in defaults.
