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
  excludeMergeStrategy?: 'extend' | 'override';
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

You can either load configuration from the backend, define it fully in the frontend, or combine both approaches.

### Backend-provided configuration

This is the default mode.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
});
```

The client loads backend configuration from:

```text
https://api.example.ch/.well-known/jwe-config
```

The backend can provide values such as:

```json
{
  "jwksUri": "/.well-known/jwks.json",
  "refreshIntervalSeconds": 300,
  "exclude": [
    {
      "method": "*",
      "path": "/actuator/**"
    }
  ]
}
```

Use this mode when the backend should centrally manage JWE discovery information and backend-owned exclude rules.

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

### Combined configuration

By default, backend excludes and local excludes are combined.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  exclude: [
    {method: 'GET', path: '/local-public/**'},
  ],
});
```

This allows the backend to publish shared or platform-level excludes while the frontend adds application-specific excludes.

The behavior is controlled with [`excludeMergeStrategy`](#exclude-merge-strategy).

## Defaults

| Option                 |                   Default | Description                                                                        |
|------------------------|--------------------------:|------------------------------------------------------------------------------------|
| `enabled`              |                    `true` | Enables or disables JWE protection globally                                        |
| `jweConfigPath`        | `/.well-known/jwe-config` | Backend JWE configuration endpoint                                                 |
| `jwksPath`             |  `/.well-known/jwks.json` | JWKS endpoint used when backend config loading is disabled or does not override it |
| `loadBackendConfig`    |                    `true` | Loads JWE configuration from the backend                                           |
| `useDefaultExcludes`   |                    `true` | Adds default excludes for discovery and health endpoints                           |
| `excludeMergeStrategy` |                  `extend` | Combines local and backend exclude rules by default                                |

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
/.well-known/jwe-config
```

Example:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  jweConfigPath: '/custom/jwe-config',
});
```

The final URL is resolved against `origin`:

```text
https://api.example.ch/custom/jwe-config
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
- backend-provided excludes are not loaded
- local exclude rules and default excludes apply

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

If backend configuration loading is enabled, the backend configuration may provide the JWKS URI.

## Exclude rules

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

These prevent protocol bootstrapping endpoints and technical health endpoints from being protected.

Disable default excludes only when you explicitly want full control:

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  useDefaultExcludes: false,
});
```

Be careful when disabling default excludes. The client must still be able to load the JWE configuration and JWKS without creating a protected-request bootstrap loop.

## Exclude merge strategy

Backend configuration can also provide exclude rules.

`excludeMergeStrategy` controls how backend excludes and local excludes are combined.

### `extend`

This is the default.

Backend excludes and local excludes are combined.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  excludeMergeStrategy: 'extend',
  exclude: [
    {method: 'GET', path: '/local-public/**'},
  ],
});
```

Use `extend` when the backend owns shared protocol or platform exclusions and the Angular application adds application-specific exclusions.

### `override`

Only local excludes are used. Backend excludes are ignored.

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  excludeMergeStrategy: 'override',
  exclude: [
    {method: '*', path: '/only-this/**'},
  ],
});
```

Use `override` when the Angular application must fully control the exclude list.

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

### Combine backend and frontend excludes

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  excludeMergeStrategy: 'extend',
  exclude: [
    {method: 'GET', path: '/frontend-public/**'},
  ],
});
```

Use this when the backend provides shared excludes and the frontend adds its own excludes.

### Replace backend excludes completely

```ts
provideJeapJweClient({
  origin: 'https://api.example.ch',
  excludeMergeStrategy: 'override',
  exclude: [
    {method: '*', path: '/public/**'},
    {method: '*', path: '/health'},
  ],
});
```

Use this when backend-provided excludes should not be applied.
