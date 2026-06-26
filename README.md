# jEAP JWE Client

jEAP JWE Client is an Angular library that transparently protects HTTP communication between an
Angular frontend and a jEAP backend service using **JSON Web Encryption (JWE)**. It plugs into
Angular's functional `HttpClient` interceptor mechanism, so application code can continue to use
ordinary `HttpClient` requests and typed JSON responses while protected requests are transported as
`application/jose`. It provides:

* Loading backend JWE configuration from `/.well-known/jwe-configuration`, including the backend's include/exclude path patterns
* Loading backend public encryption keys from the configured JWKS endpoint
* Protecting requests to a configured backend origin using include/exclude path patterns aligned with the backend
* Encrypting JSON request bodies as compact JWE using `RSA-OAEP-256` and `A256GCM`
* Sending a request-local response content encryption key in the `JWE-Response-Key` header
* Setting `Accept: application/jose` for protected requests
* Decrypting encrypted backend responses using `alg: dir` and `enc: A256GCM`
* Refreshing JWKS and retrying once when the backend returns `JWE_UNKNOWN_KEY_ID`
* Typed client-side errors through `JeapJweError`
* Integration tests with a mocked backend and real JWE encryption/decryption

## Documentation

Start with [Getting started](docs/getting-started.md), then follow the links below. The docs here
cover the **frontend** side; the JWE protocol itself is defined and reviewed in the backend starter's
[Client integration](https://github.com/jeap-admin-ch/jeap-spring-boot-jwe-starter/blob/main/docs/client-integration.md)
guide, which is the source of truth for the contract this client implements.

| Topic                                                                                 | File                                                                                                                     |
|---------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| Getting started (add the dependency, configure the provider and interceptor)          | [docs/getting-started.md](docs/getting-started.md)                     |
| Development (prerequisites, scripts, pre-commit checks, CI, troubleshooting)           | [docs/development.md](docs/development.md)                             |
| Configuration reference (`JeapJweClientConfig`, include/exclude, backend config loading) | [docs/configuration.md](docs/configuration.md)                         |
| Backend contract — the client's view of what the backend publishes and the one error code it acts on | [docs/backend-contract.md](docs/backend-contract.md)                   |
| Architecture (interceptor, matcher, config service, JWKS cache, encryptor, decryptor) | [docs/architecture.md](docs/architecture.md)                           |
| Key rotation and retry behavior (`keys[0]`, refresh, `JWE_UNKNOWN_KEY_ID`)               | [docs/key-rotation.md](docs/key-rotation.md)                           |
| Error handling (`JeapJweError`, retryable and non-retryable failures)                 | [docs/error-handling.md](docs/error-handling.md)                       |
| Testing (unit tests, integration tests, protocol trace for reviews)                   | [docs/testing.md](docs/testing.md)                                     |
| Security considerations (logging, CEKs, JWKs, plaintext, compact JWE values)          | [docs/security-considerations.md](docs/security-considerations.md)     |
| Publishing and versioning (release flow, package metadata, changelog, docs assets)    | [docs/publishing-and-versioning.md](docs/publishing-and-versioning.md) |
| npm publishing setup (npm org, trusted publishing, one-time bootstrap, CI secrets)    | [docs/npm-publishing-setup.md](docs/npm-publishing-setup.md)           |

## Usage

Register the client configuration and the functional interceptor in the Angular application. The library does not call `provideHttpClient` itself: the consuming application owns its `HttpClient` setup and must register the `jeapJweInterceptor` alongside `provideJeapJweClient`, as shown below.

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

With this configuration, the client loads the backend JWE configuration and JWKS from the configured
backend origin:

```text
GET https://api.example.ch/.well-known/jwe-configuration
GET https://api.example.ch/.well-known/jwks.json
```

Application code keeps using normal Angular `HttpClient` calls:

```ts
http.post<Person>('/api/persons', {
  name: 'Alice',
});
```

The protected transport request sent to the backend uses JWE:

```http
POST /api/persons
Accept: application/jose
Content-Type: application/jose
JWE-Response-Key: <compact-jwe>

<compact-jwe-request-body>
```

## Workspace

This repository is an Angular workspace containing the publishable library project.

| Path                                         | Purpose                                                  |
|----------------------------------------------|----------------------------------------------------------|
| `package.json`                               | Workspace dependencies, scripts and development tooling  |
| `projects/jeap-jwe-client/package.json`      | Publishable library package metadata and library version |
| `projects/jeap-jwe-client/ng-package.json`   | Angular library packaging configuration                  |
| `projects/jeap-jwe-client/src/public-api.ts` | Public API entry point                                   |
| `docs/`             | Library documentation                                    |
| `dist/jeap-jwe-client/`                      | Built publishable package                                |

The workspace root package is private and is not published. The library version is managed in:

```text
projects/jeap-jwe-client/package.json
```

The publishable package is built to:

```text
dist/jeap-jwe-client/
```

## Package

The artifact consumers depend on is `@jeap/jeap-jwe-client`.

| Package                  | Purpose                                                                                                                       |
|--------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `@jeap/jeap-jwe-client`  | Angular library providing the JWE client configuration, interceptor, encryption, decryption, JWKS handling and retry behavior |

The package declares Angular and RxJS as peer dependencies. The consuming Angular application provides
these dependencies. The `jose` package is a runtime dependency because the library uses it for JWE
encryption and decryption.

## Versioning and publishing

The library version is managed in:

```text
projects/jeap-jwe-client/package.json
```

The workspace root `package.json` is only used for local development and build tooling. The publishable
package is built to:

```text
dist/jeap-jwe-client/
```

See [docs/publishing-and-versioning.md](docs/publishing-and-versioning.md)
for release flow, versioning rules, changelog handling and package verification.

## Changes

This library is versioned using [Semantic Versioning](http://semver.org/) where possible and all
changes are documented in [projects/jeap-jwe-client/CHANGELOG.md](projects/jeap-jwe-client/CHANGELOG.md)
following the format defined in [Keep a Changelog](http://keepachangelog.com/).

## Note

This repository is part of the open source distribution of jEAP. See
[github.com/jeap-admin-ch/jeap](https://github.com/jeap-admin-ch/jeap) for more information.

## License

This repository is Open Source Software licensed under the [Apache License 2.0](./LICENSE).
