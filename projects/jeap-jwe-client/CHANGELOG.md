# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-08-18

### Added

- The client now follows the backend's master switch: when `enabled` is not set locally, the
  `enabled` field published by the backend's `/.well-known/jwe-configuration` decides. One frontend
  build therefore runs against a stage with JWE turned on and a stage with it turned off. An explicit
  local `enabled` still wins, so an application can pin the switch. Requires
  `jeap-spring-boot-jwe-starter` 1.19.0 or newer, which keeps serving the metadata endpoint while
  disabled; older backends answer `404` there and still need `enabled: false` configured locally.
  A failed metadata load is deliberately *not* read as "encryption is off" — the client keeps failing
  closed with `JWE_CONFIG_LOAD_FAILED`.

### Changed

- `JeapJweResolvedClientConfig.enabled` is now a required `boolean` (it carries the effective,
  merged switch). This only affects code that constructs the resolved configuration itself; reading
  it is unchanged.

## [1.2.0] - 2026-07-03

### Added

- Zero-configuration setup: `provideJeapJweClient()` now works without options for the standard
  jEAP SCS deployment where the frontend is served by its backend's web server. The backend
  `origin` defaults to the frontend's own origin, and `jweConfigPath`/`jwksPath` default to the
  application base path (the Angular base href, which matches the backend's servlet context path
  in that deployment) plus the well-known paths. The base-path prefix applies only when the
  backend origin is the frontend's own origin; an explicitly configured cross-origin backend
  keeps the root well-known defaults. The base href is resolved like Angular's `Location`: an
  `APP_BASE_HREF` provider wins over the `<base>` element.
- The environment-dependent defaults are resolved identically whether the configuration is
  registered via `provideJeapJweClient()` or by providing `JEAP_JWE_CLIENT_CONFIG` directly.

### Changed

- Include decisions are no longer made against the local configuration before the backend
  configuration has been loaded. Requests to the backend origin that are not excluded now wait for
  the (cached, shared) backend configuration and are matched against the backend-published
  include/exclude patterns. A backend running under a servlet context path is therefore protected
  out of the box — no local `include` configuration is required anymore.
- Fail closed: when the backend configuration cannot be loaded, requests to the backend origin that
  are not excluded fail with `JWE_CONFIG_LOAD_FAILED` instead of being sent unprotected. Previously,
  requests outside the local include patterns were silently sent in plaintext in this situation.
- Only stable exclusions short-circuit before the backend configuration is loaded: the local
  `exclude` patterns and the discovery endpoints (the resolved `jweConfigPath` and `jwksPath`,
  which are always exempt from JWE protection - including context-path-prefixed paths). The client
  default excludes no longer make a final local decision, because the backend's published
  `excludedPaths` replace them; they are applied as part of the effective configuration instead.

## [1.1.0] - 2026-06-26

### Changed

- Publish version using npm trusted publishing
- Remove unused `@angular/animations` dev dependency

## [1.0.0] - 2026-06-26

### Changed

- Initial public open source release on the public npm registry as
  `@jeap/jeap-jwe-client`

## [0.2.0] - 2026-06-25

### Changed

- Aligned the protect/skip decision with the jEAP backend: a request is now protected when its
  path matches an **include** pattern and no **exclude** pattern (includes evaluated first, excludes
  win), instead of the previous "protect everything unless excluded" behavior.
- The client now reads the backend's published `includedPaths` and `excludedPaths` from
  `/.well-known/jwe-configuration` and uses them as the source of truth, mirroring the server exactly.
  Backend-published paths already include the jEAP defaults and are matched relative to the origin
  root (the backend prefixes them with its context path).
- Added `JeapJweClientConfig.include` (`string[]`), defaulting to `['/*api*/**']` when the backend
  publishes no `includedPaths`.

## [0.1.0] - 2026-06-19

### Added

- Added Angular functional interceptor for transparent JWE request and response protection.
- Added backend configuration loading from `/.well-known/jwe-config`.
- Added JWKS loading, caching, refresh, and key selection.
- Added request body encryption using `RSA-OAEP-256` and `A256GCM`.
- Added request-local response CEK transport via `JWE-Response-Key`.
- Added response decryption for backend responses using `alg: dir` and `enc: A256GCM`.
- Added retry handling for backend `JWE_UNKNOWN_KID` responses.
- Added typed client error model through `JeapJweError`.
- Added integration tests with mocked backend and real JWE crypto.
- Added documentation for setup, configuration, backend contract, architecture, key rotation, errors, testing, security, troubleshooting, and publishing.
