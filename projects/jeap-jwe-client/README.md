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

The `docs` folder contains the developer and integration documentation for `jeap-jwe-client`.

Recommended reading order:

1. [Getting started](docs/getting-started.md)
2. [Configuration](docs/configuration.md)
3. [Backend contract](docs/backend-contract.md)
4. [Architecture](docs/architecture.md)
5. [Key rotation](docs/key-rotation.md)
6. [Error handling](docs/error-handling.md)
7. [Testing](docs/testing.md)
8. [Security considerations](docs/security-considerations.md)
9. [Publishing and versioning](docs/publishing-and-versioning.md)


## License

See the repository license.
