# jEAP JWE Client

jEAP JWE Client is an Angular library that transparently protects HTTP communication between an
Angular frontend and a jEAP backend service using **JSON Web Encryption (JWE)**. It plugs into
Angular's functional `HttpClient` interceptor mechanism, so application code can continue to use
ordinary `HttpClient` requests and typed JSON responses while protected requests are transported as
`application/jose`. It provides:

* Loading backend JWE configuration from `/.well-known/jwe-config`
* Loading backend public encryption keys from the configured JWKS endpoint
* Protecting requests to a configured backend origin by default, with blacklist-style exclude rules
* Encrypting JSON request bodies as compact JWE using `RSA-OAEP-256` and `A256GCM`
* Sending a request-local response content encryption key in the `JWE-Response-Key` header
* Setting `Accept: application/jose` for protected requests
* Decrypting encrypted backend responses using `alg: dir` and `enc: A256GCM`
* Refreshing JWKS and retrying once when the backend returns `JWE_UNKNOWN_KID`
* Typed client-side errors through `JeapJweError`
* Integration tests with a mocked backend and real JWE encryption/decryption

## Documentation

Start with [Getting started](projects/jeap-jwe-client/docs/getting-started.md), then follow the links below.

| Topic                                                                                 | File                                                                                                                     |
|---------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| Getting started (add the dependency, configure the provider and interceptor)          | [projects/jeap-jwe-client/docs/getting-started.md](projects/jeap-jwe-client/docs/getting-started.md)                     |
| Configuration reference (`JeapJweClientConfig`, excludes, backend config loading)     | [projects/jeap-jwe-client/docs/configuration.md](projects/jeap-jwe-client/docs/configuration.md)                         |
| Backend contract (`/.well-known/jwe-config`, JWKS, headers, response encryption)      | [projects/jeap-jwe-client/docs/backend-contract.md](projects/jeap-jwe-client/docs/backend-contract.md)                   |
| Architecture (interceptor, matcher, config service, JWKS cache, encryptor, decryptor) | [projects/jeap-jwe-client/docs/architecture.md](projects/jeap-jwe-client/docs/architecture.md)                           |
| Key rotation and retry behavior (`keys[0]`, refresh, `JWE_UNKNOWN_KID`)               | [projects/jeap-jwe-client/docs/key-rotation.md](projects/jeap-jwe-client/docs/key-rotation.md)                           |
| Error handling (`JeapJweError`, retryable and non-retryable failures)                 | [projects/jeap-jwe-client/docs/error-handling.md](projects/jeap-jwe-client/docs/error-handling.md)                       |
| Testing (unit tests, integration tests, protocol trace for reviews)                   | [projects/jeap-jwe-client/docs/testing.md](projects/jeap-jwe-client/docs/testing.md)                                     |
| Security considerations (logging, CEKs, JWKs, plaintext, compact JWE values)          | [projects/jeap-jwe-client/docs/security-considerations.md](projects/jeap-jwe-client/docs/security-considerations.md)     |
| Troubleshooting (common setup, config, JWKS, encryption and Angular test issues)      | [projects/jeap-jwe-client/docs/troubleshooting.md](projects/jeap-jwe-client/docs/troubleshooting.md)                     |
| Publishing and versioning (release flow, package metadata, changelog, docs assets)    | [projects/jeap-jwe-client/docs/publishing-and-versioning.md](projects/jeap-jwe-client/docs/publishing-and-versioning.md) |

## Usage

Register the client configuration and the functional interceptor in the Angular application:

```ts
import {ApplicationConfig} from '@angular/core';
import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {
  jeapJweInterceptor,
  provideJeapJweClient,
} from 'jeap-jwe-client';

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
GET https://api.example.ch/.well-known/jwe-config
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
| `projects/jeap-jwe-client/docs/`             | Library documentation                                    |
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

The artifact consumers depend on is `jeap-jwe-client`.

| Package           | Purpose                                                                                                                       |
|-------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `jeap-jwe-client` | Angular library providing the JWE client configuration, interceptor, encryption, decryption, JWKS handling and retry behavior |

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

See [projects/jeap-jwe-client/docs/publishing-and-versioning.md](projects/jeap-jwe-client/docs/publishing-and-versioning.md)
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
