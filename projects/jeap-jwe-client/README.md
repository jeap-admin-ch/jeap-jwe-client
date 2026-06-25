# jeap-jwe-client

Angular client library for transparent JWE request and response protection between Angular frontends and jEAP backend services.

The library protects requests to a configured backend origin, encrypts supported request bodies as compact JWE, sends a request-local response key in `JWE-Response-Key`, and decrypts encrypted `application/jose` responses back into normal Angular `HttpClient` responses.

## What it does

- Loads backend JWE configuration from `/.well-known/jwe-config`.
- Loads public encryption keys from the configured JWKS endpoint.
- Uses the first public JWKS key as the current request encryption key.
- Encrypts JSON request bodies with `RSA-OAEP-256` and `A256GCM`.
- Always sends `JWE-Response-Key` for protected requests, including `GET`.
- Sets `Accept: application/jose` for protected requests.
- Decrypts backend responses that use `alg: dir` and `enc: A256GCM`.
- Refreshes JWKS and retries once when the backend returns `JWE_UNKNOWN_KID`.
- Leaves excluded endpoints and other origins untouched.

## Installation

```bash
npm install jeap-jwe-client jose
```

## Minimal Angular setup

```ts
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
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

With this configuration the client loads:

```text
GET https://api.example.ch/.well-known/jwe-config
GET https://api.example.ch/.well-known/jwks.json
```

The backend may override the JWKS URI, refresh interval, and exclude rules through the backend configuration response.

## Documentation

Full documentation for `jeap-jwe-client` is published with the jEAP documentation and on GitHub:

- jEAP documentation site: <https://jeap-admin-ch.github.io/>
- Source and docs on GitHub: <https://github.com/jeap-admin-ch/jeap-jwe-client/tree/main/docs>

Recommended reading order:

1. [Getting started](https://github.com/jeap-admin-ch/jeap-jwe-client/blob/main/docs/getting-started.md)
2. [Configuration](https://github.com/jeap-admin-ch/jeap-jwe-client/blob/main/docs/configuration.md)
3. [Backend contract](https://github.com/jeap-admin-ch/jeap-jwe-client/blob/main/docs/backend-contract.md)
4. [Architecture](https://github.com/jeap-admin-ch/jeap-jwe-client/blob/main/docs/architecture.md)
5. [Key rotation](https://github.com/jeap-admin-ch/jeap-jwe-client/blob/main/docs/key-rotation.md)
6. [Error handling](https://github.com/jeap-admin-ch/jeap-jwe-client/blob/main/docs/error-handling.md)
7. [Testing](https://github.com/jeap-admin-ch/jeap-jwe-client/blob/main/docs/testing.md)
8. [Security considerations](https://github.com/jeap-admin-ch/jeap-jwe-client/blob/main/docs/security-considerations.md)
9. [Publishing and versioning](https://github.com/jeap-admin-ch/jeap-jwe-client/blob/main/docs/publishing-and-versioning.md)

## License

This library is Open Source Software licensed under the
[Apache License 2.0](https://github.com/jeap-admin-ch/jeap-jwe-client/blob/main/LICENSE).
