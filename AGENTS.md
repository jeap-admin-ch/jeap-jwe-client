# AGENTS.md

Guidance for AI coding agents working **in this repository**. For how to *use* the library in a
consuming Angular application, read [README.md](README.md) and the
[docs/](docs/) folder instead.

## Project

jEAP JWE Client is an Angular library that transparently protects HTTP communication between an
Angular frontend and a jEAP backend service using JSON Web Encryption (JWE). It is implemented as an
Angular functional `HttpClient` interceptor plus supporting services for endpoint matching,
configuration loading, JWKS loading and caching, request encryption, response decryption, and
retry handling.

The application continues to use ordinary Angular `HttpClient` calls and typed JSON responses. The
library transforms protected requests into `application/jose` transport requests and decrypts
encrypted backend responses back into normal Angular responses.

The library does not call `provideHttpClient` itself. The consuming application owns its `HttpClient`
setup and registers the `jeapJweInterceptor` via
`provideHttpClient(withInterceptors([jeapJweInterceptor]))` alongside `provideJeapJweClient({...})`.

## Repository layout

```text
package.json                                            # Workspace package; private; scripts, dev tooling and dependencies
package-lock.json                                       # Workspace dependency lock file
angular.json                                            # Angular workspace configuration
tsconfig.json                                           # Workspace TypeScript configuration
tsconfig.spec.json                                      # Test TypeScript configuration
README.md                                              # Workspace-level project overview; jEAP docs-site landing page
publiccode.yml                                          # publiccode.yml metadata (jEAP OSS distribution checklist)
.github/workflows/build-and-release.yml                       # Single workflow: CI checks + release/publish on main

docs/                                                  # Focused documentation files (repo root for jEAP docs pipeline + GitHub)
  getting-started.md                                   # Consumer setup
  development.md                                        # Local development: scripts, pre-commit checks, CI
  configuration.md                                     # Client configuration reference
  backend-contract.md                                  # Backend HTTP/JWE contract
  architecture.md                                      # Internal architecture
  key-rotation.md                                      # JWKS order, refresh and retry behavior
  error-handling.md                                    # Client and backend error handling
  testing.md                                           # Test strategy and protocol trace
  security-considerations.md                           # Security and logging rules
  publishing-and-versioning.md                         # Release, versioning and publishing process
  npm-publishing-setup.md                              # One-time npm org / trusted-publishing setup

projects/
  jeap-jwe-client/                                     # The publishable Angular library project
    package.json                                       # Library package metadata and published version
    ng-package.json                                    # ng-packagr configuration for the library package
    README.md                                          # Library (npm) package README; links to public docs
    CHANGELOG.md                                       # Library changelog
    src/
      public-api.ts                                    # Public API entry point
      lib/
        config/                                        # Client config types, token and config service
        crypto/                                        # JWE algorithm constants, request encryptor, response decryptor
        error/                                         # JeapJweError and backend error mapping
        interceptor/                                   # Functional Angular HTTP interceptor and integration tests
        jwks/                                          # JWKS client, cache, refresh service, key selector and models
        matcher/                                       # Endpoint matching and include/exclude path handling
        provider/                                      # provideJeapJweClient provider setup
        testing/                                       # Test fixtures, test keys and mocked JWE backend helpers

dist/
  jeap-jwe-client/                                     # Built publishable package after `npm run build:lib`
```

## Build & test

```bash
npm ci
npm run format        # Prettier --write (or format:check to verify only)
npm run lint
npm run test
npm run build:lib
npm run pack:lib
npm run publish:lib:dry-run
```

**Before every commit, run `npm run format` and `npm run lint`.** CI (`.github/workflows/build-and-release.yml`,
"Lint and format" job) runs `npm run format:check` followed by `npm run lint` and fails the build on any
Prettier or ESLint deviation, so an unformatted file blocks the whole pipeline. Running `npm run format`
locally (it writes the fixes in place) avoids this. New or rewritten spec/source files are the usual
culprits — format them before committing.

Recommended workspace scripts:

```json
{
  "scripts": {
    "ng": "ng",
    "build": "ng build jeap-jwe-client",
    "build:lib": "ng build jeap-jwe-client",
    "test": "ng test jeap-jwe-client --watch=false --browsers=ChromeHeadless",
    "test:watch": "ng test jeap-jwe-client",
    "lint": "eslint \"projects/jeap-jwe-client/src/**/*.ts\"",
    "format": "prettier --write \"projects/jeap-jwe-client/src/**/*.ts\"",
    "format:check": "prettier --check \"projects/jeap-jwe-client/src/**/*.ts\"",
    "pack:lib": "cd dist/jeap-jwe-client && npm pack",
    "publish:lib:dry-run": "cd dist/jeap-jwe-client && npm publish --dry-run --access public",
    "publish:lib": "cd dist/jeap-jwe-client && npm publish --access public"
  }
}
```

The workspace uses Angular 22 and Node.js 24 (the CI workflow pins `NODE_VERSION` — keep it in
sync with the Angular CLI's minimum). Keep TypeScript, Angular CLI, Angular compiler, ng-packagr and
Angular runtime packages aligned.

## Angular library conventions

- The publishable package is `projects/jeap-jwe-client`.
- The published npm package name is `@jeap/jeap-jwe-client` — public and scoped under the `@jeap`
  org. The Angular workspace/project id stays `jeap-jwe-client` (used by `ng build jeap-jwe-client`,
  `angular.json`, `dist/jeap-jwe-client/` and the CI env vars); do not confuse the two.
- The library version is managed in `projects/jeap-jwe-client/package.json`.
- The workspace root `package.json` is private and is not the published package.
- Public exports must go through `projects/jeap-jwe-client/src/public-api.ts`.
- Angular and RxJS must remain peer dependencies of the library.
- `jose` is a runtime dependency because the library uses it for JWE encryption and decryption.
- `tslib` is a runtime dependency.
- Keep `sideEffects: false` unless a future change introduces top-level side effects.
- Keep `jose` listed in `allowedNonPeerDependencies` in `ng-package.json`.
- Package the library README, changelog and third-party license notices through `ng-package.json`
  assets. Documentation lives in the repository root `docs/` directory and is not bundled into the
  npm package; the library README links to the public documentation instead.

Recommended `ng-package.json` assets:

```json
{
  "assets": [
    "README.md",
    "CHANGELOG.md",
    "THIRD-PARTY-LICENSES.md"
  ]
}
```

## JWE protocol conventions

The library protects requests to a single configured backend origin. Requests to other origins are
ignored. A request to the configured origin is protected only when its path matches an **include**
pattern and no **exclude** pattern (includes evaluated first, excludes win) — the same decision the
jEAP backend filter makes. Include/exclude patterns are simple paths (`PathPattern` syntax, no HTTP
method).

Default include pattern (used when the backend does not publish `includedPaths`):

```ts
['/*api*/**']
```

Client default excluded paths (used when the backend does not publish `excludedPaths`):

```ts
[
  '/.well-known/**',
  '/actuator/**',
  '/health',
]
```

When backend configuration loading is enabled, the backend publishes its effective
`includedPaths`/`excludedPaths` (already containing the jEAP defaults, and prefixed with the backend
context path when one is configured). Those take precedence; the client matches them relative to the
origin root and only appends the local `exclude` patterns on top.

Important protocol rules:

- Backend config endpoint: `/.well-known/jwe-configuration`
- Default JWKS endpoint: `/.well-known/jwks.json`
- Protected request media type: `application/jose`
- Response key header: `JWE-Response-Key`
- Request body JWE: `alg: RSA-OAEP-256`, `enc: A256GCM`
- Response key JWE: `alg: RSA-OAEP-256`, `enc: A256GCM`
- Backend response JWE: `alg: dir`, `enc: A256GCM`
- Response CEK length: 32 bytes
- Backend retry error code: `JWE_UNKNOWN_KEY_ID`

The backend publishes public JWKS keys only. The client uses the first JWKS key, `keys[0]`, for new
request encryption and must not reorder keys.

## Configuration conventions

The local Angular configuration uses `JeapJweClientConfig`.

Key behavior:

- `origin` is required.
- `enabled` defaults to `true`.
- `loadBackendConfig` defaults to `true`.
- `jweConfigPath` defaults to `/.well-known/jwe-configuration`.
- `jwksPath` defaults to `/.well-known/jwks.json`.
- `include` defaults to `['/*api*/**']` when the backend publishes none.
- `useDefaultExcludes` defaults to `true`.

Include/exclude patterns are simple string paths aligned with the backend's
`includedPaths`/`excludedPaths`. The backend publishes both lists; when present they are the source of
truth. The client may add extra `exclude` patterns on top.

Protection is include/exclude based:

```text
Ignored for other origins.
For the configured origin: protected only when the path matches an include and no exclude.
Includes evaluated first, excludes win.
```

When `loadBackendConfig` is enabled, the client must not load backend config for requests that are not
protected locally (not included, or locally excluded).

## Error handling conventions

Client errors use `JeapJweError`.

Keep error messages safe. Do not include:

- Plaintext payloads
- Compact JWE values
- CEKs
- Private keys
- Full JWK key material
- Authentication tokens

The backend only needs one retryable client-recognized code:

```text
JWE_UNKNOWN_KEY_ID
```

This means the key identifier is unknown, stale, inactive, or no longer accepted by the backend.
The client refreshes JWKS and retries the original request once. If the retry also fails with
`JWE_UNKNOWN_KEY_ID`, the typed error is returned to the application. Do not introduce retry loops.

## Security conventions

This repository contains cryptographic transport code. Be conservative.

Never log, persist, snapshot or expose:

- Plaintext request or response payloads from real systems
- Compact JWE values from real systems
- CEKs
- Private keys
- Full JWK modulus values
- Authentication tokens
- User data

Test protocol traces must redact sensitive data. It is acceptable to log JOSE protected header
metadata in tests, such as `alg`, `enc`, `kid`, `cty`, and compact JWE length.

Do not weaken algorithm checks. Unsupported algorithms must fail with typed errors.

Do not accept private key material in public JWKS responses.

## Testing conventions

Tests should cover both isolated units and real integration behavior.

Integration tests should use:

- Angular `HttpTestingController`
- Real JWE encryption/decryption through `jose`
- Generated test RSA key pairs
- A mocked backend helper
- Typed error assertions

For protocol walkthroughs in Sprint Reviews, use an explicit local trace switch such as:

```ts
const ENABLE_PROTOCOL_TRACE = false;
```

Keep it disabled by default. Do not commit enabled noisy traces.

The trace may show:

- Plain test fixtures, such as `{ name: 'Alice' }`
- The fact that backend config was loaded
- The fact that JWKS was loaded
- Request method and URL
- `Accept: application/jose`
- `Content-Type: application/jose`
- Existence and compact-JWE length of `JWE-Response-Key`
- JOSE protected header metadata

The trace must not show real plaintext, CEKs, private keys, or full compact JWE values.

## Docs

When changing public behavior, update the matching focused file under
[docs/](docs/) and the documentation table in
[README.md](README.md).

Update docs when changing:

- Public Angular API
- Client configuration
- Backend configuration response
- JWKS behavior
- JWE algorithms
- Required HTTP headers
- Retry behavior
- Error codes
- Security-sensitive behavior
- Testing helpers or protocol trace behavior

Keep one topic per documentation file.

## Versioning

- The library follows [Semantic Versioning](https://semver.org/). It is past `1.0.0`, so breaking
  changes require a **major** version bump and must be documented explicitly.
- The library version is managed in `projects/jeap-jwe-client/package.json`.
- Keep `publiccode.yml` in sync: `softwareVersion` must match the library version and `releaseDate`
  must be the release date.
- All notable changes are documented in `projects/jeap-jwe-client/CHANGELOG.md`. Keep entries concise
  and grouped by version.
- Release tags use the format `vX.Y.Z` (for example `v1.0.0`) and are created automatically by CI.
- The root package version is not the library version.

## Releasing and publishing

The package is published to the public npm registry as `@jeap/jeap-jwe-client` **by CI**, from the
single `build-and-release.yml` workflow, using npm trusted publishing (OIDC) — no long-lived npm token is
stored in CI. **Releasing is driven by the library version:** when a new version lands on `main`, the
`release` job (gated to `main`, in the `release` environment) publishes `dist/jeap-jwe-client/` and
then pushes a `vX.Y.Z` record tag with the default `GITHUB_TOKEN`. The tag is a marker and
idempotency guard, not a release trigger, so no PAT is needed; a merge without a version bump is a
no-op. Do not publish manually in normal operation. The one-time npm org, `release` environment and
trusted-publisher setup is documented in [docs/npm-publishing-setup.md](docs/npm-publishing-setup.md).

Release checklist:

```text
1. Update projects/jeap-jwe-client/package.json (version)
2. Update projects/jeap-jwe-client/CHANGELOG.md
3. Update publiccode.yml (softwareVersion, releaseDate)
4. Update docs if needed
5. Run npm ci && npm run test && npm run build:lib
6. Verify dist/jeap-jwe-client contents (npm run publish:lib:dry-run)
7. Merge the version bump to main
8. The release job publishes and pushes the vX.Y.Z tag
```

## Commit and branch conventions

Keep commit messages short and concrete.

If the branch name contains a JIRA issue id, use it as the commit prefix.

Example:

```text
JEAP-1234 Added JWE response decryption
```

Do not use generated commit messages that include long summaries, tool traces, or unrelated context.

## AI agent rules

When editing this repository:

- Prefer small, focused changes.
- Keep code comments in English.
- Do not add production logging for sensitive protocol data.
- Do not change protocol constants without updating backend contract docs and tests.
- Do not broaden dependency ranges without checking Angular compatibility.
- Do not move library versioning to the workspace root package.
- Do not publish from the workspace root.
- Do not add private JWK examples to docs or tests.
- Do not silently change retry semantics.
- Update tests and docs together with behavior changes.
- Run `npm run format` and `npm run lint` before committing; CI fails on any Prettier or ESLint
  deviation.
