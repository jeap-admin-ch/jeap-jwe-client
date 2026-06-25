# Configuration

The library uses one backend configuration. Requests to this backend origin are protected unless they match an exclude rule. Requests to other origins are ignored.

Start with [Getting started](./getting-started.md) if you have not configured the client yet.

## Configuration overview

```ts
export interface JeapJweClientConfig {
  enabled?: boolean;
  origin: string;
  jwksPath?: string;
  jweConfigPath?: string;
  loadBackendConfig?: boolean;
  exclude?: JeapJweExcludeRule[];
  useDefaultExcludes?: boolean;
}

export interface JeapJweExcludeRule {
  method?: string;
  path: string;
}
```

Minimal configuration:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
});
```

## Configuration modes

You can either load protocol metadata from the backend or define the client-side configuration fully in the frontend. Exclude rules are always owned by the client in both modes.

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
  "responseKeyHeader": "JWE-Response-Key"
}
```

The client maps the backend `jwksPath` to the JWKS URL it loads. The backend does not publish exclude rules or a JWKS refresh interval.

Use this mode when the backend should centrally manage JWE protocol settings such as the JWKS path, the content-type allowlist, and the response-key header.

### Frontend-only configuration

Set `loadBackendConfig` to `false` when the Angular application should define all client-side JWE configuration itself.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  loadBackendConfig: false,
  jwksPath: '/.well-known/jwks.json',
  exclude: [
    {method: '*', path: '/public/**'},
  ],
});
```

In this mode:

- no request to `jweConfigPath` is made
- the local `jwksPath` is used
- local exclude rules are used
- default excludes are still used unless `useDefaultExcludes` is set to `false`

The backend still needs to provide the JWKS endpoint and support encrypted requests and responses.

## Defaults

| Option               |                         Default | Description                                                                        |
|----------------------|--------------------------------:|------------------------------------------------------------------------------------|
| `enabled`            |                          `true` | Enables or disables JWE protection globally                                        |
| `jweConfigPath`      | `/.well-known/jwe-configuration` | Backend JWE configuration endpoint                                                 |
| `jwksPath`           |        `/.well-known/jwks.json` | JWKS endpoint used when backend config loading is disabled or does not override it |
| `loadBackendConfig`  |                          `true` | Loads JWE configuration from the backend                                           |
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
- local exclude rules and default excludes apply

Exclude rules are owned by the client in either mode, so disabling backend configuration loading does not change how exclusions are determined.

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

## Exclude rules

Exclude rules are owned entirely by the client. The backend does not publish exclude rules. Define application-specific exclusions with the `exclude` option; default excludes apply unless `useDefaultExcludes` is set to `false`.

Exclude rules use blacklist semantics:

- requests are protected by default
- a request is excluded only when a rule matches
- excluded requests are forwarded unchanged

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  exclude: [
    {method: '*', path: '/public/**'},
    {method: 'GET', path: '/status'},
  ],
});
```

### Method matching

| Rule             | Meaning             |
|------------------|---------------------|
| `method` omitted | Matches all methods |
| `method: '*'`    | Matches all methods |
| `method: 'GET'`  | Matches only `GET`  |

Method matching is case-insensitive.

### Path matching

| Pattern      | Meaning                    | Matches                                  |
|--------------|----------------------------|------------------------------------------|
| `/status`    | Exact path                 | `/status`                                |
| `/public/*`  | One path segment           | `/public/info`                           |
| `/public/**` | Zero or more path segments | `/public`, `/public/info`, `/public/a/b` |

Query parameters are ignored for exclude matching.

For example, this rule:

```ts
{
  method: 'GET', path: '/status'
}
```

matches both:

```text
/status
/status?verbose=true
```

## Default excludes

The default excludes are:

```ts
[
  {method: '*', path: '/.well-known/**'},
  {method: '*', path: '/actuator/**'},
  {method: '*', path: '/health'},
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

Disabling default excludes does not risk a protocol bootstrap loop. The configuration and JWKS requests always bypass the interceptor because the client issues them through Angular's `HttpBackend` directly, so those requests are never encrypted regardless of excludes. Default excludes only protect your application discovery and health endpoints; removing them simply means those endpoints would be protected like any other.

## Server-Sent Events

The client does not exclude jEAP Server-Sent Events (SSE) endpoints by default. If your application consumes SSE endpoints on the protected origin, add them to `exclude` so they are forwarded unchanged:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  exclude: [
    {method: 'GET', path: '/sse/**'},
  ],
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
  exclude: [
    {method: '*', path: '/public/**'},
  ],
});
```

Use this when some application endpoints should stay unprotected.

### Define excludes without default excludes

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  useDefaultExcludes: false,
  exclude: [
    {method: '*', path: '/public/**'},
    {method: '*', path: '/health'},
  ],
});
```

Use this when the Angular application must fully control the exclude list without the built-in defaults.
