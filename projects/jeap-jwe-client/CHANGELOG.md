# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
