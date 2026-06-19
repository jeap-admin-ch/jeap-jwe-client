import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { JeapJweResolvedClientConfig } from '../config/jeap-jwe-client-config';
import { JeapJweError } from '../error/jeap-jwe-error';
import { JwksClient } from './jwks-client';

describe('JwksClient', () => {
  let jwksClient: JwksClient;
  let httpMock: HttpTestingController;

  const config: JeapJweResolvedClientConfig = {
    origin: 'https://api.example.ch',
    loadBackendConfig: false,
    jwksUri: '/.well-known/jwks.json',
    refreshIntervalSeconds: 300,
    exclude: [],
  };

  function publicRsaKey(kid: string): object {
    return {
      kty: 'RSA',
      kid,
      use: 'enc',
      alg: 'RSA-OAEP-256',
      n: 'test-modulus',
      e: 'AQAB',
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        JwksClient,
      ],
    });

    jwksClient = TestBed.inject(JwksClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads public RSA keys and preserves backend key ordering', () => {
    let snapshot: unknown;

    jwksClient.fetch(config).subscribe(result => {
      snapshot = result;
    });

    const request = httpMock.expectOne(
      'https://api.example.ch/.well-known/jwks.json'
    );

    /**
     * JWKS retrieval bypasses the JWE interceptor and must not carry
     * JWE request headers.
     */
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.has('JWE-Response-Key')).toBeFalse();

    request.flush({
      keys: [
        publicRsaKey('transit-key:7'),
        publicRsaKey('transit-key:6'),
      ],
    });

    expect(snapshot).toEqual(
      jasmine.objectContaining({
        jwksUri: 'https://api.example.ch/.well-known/jwks.json',
        refreshIntervalSeconds: 300,
      })
    );

    const typedSnapshot = snapshot as {
      keys: Array<{ kid: string }>;
      keysByKid: ReadonlyMap<string, { kid: string }>;
    };

    /**
     * The client must not reorder backend keys.
     * The newest active key remains at index zero.
     */
    expect(typedSnapshot.keys.map(key => key.kid)).toEqual([
      'transit-key:7',
      'transit-key:6',
    ]);

    expect(typedSnapshot.keysByKid.get('transit-key:6')).toEqual(
      jasmine.objectContaining({
        kid: 'transit-key:6',
      })
    );
  });

  it('returns a typed error when the JWKS contains an unsupported algorithm', () => {
    let actualError: unknown;

    jwksClient.fetch(config).subscribe({
      error: error => {
        actualError = error;
      },
    });

    const request = httpMock.expectOne(
      'https://api.example.ch/.well-known/jwks.json'
    );

    request.flush({
      keys: [
        {
          ...publicRsaKey('transit-key:7'),
          alg: 'RSA1_5',
        },
      ],
    });

    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_JWKS_INVALID',
      })
    );

    expect(actualError instanceof JeapJweError).toBeTrue();
  });

  it('returns a typed error when the JWKS contains private key material', () => {
    let actualError: unknown;

    jwksClient.fetch(config).subscribe({
      error: error => {
        actualError = error;
      },
    });

    const request = httpMock.expectOne(
      'https://api.example.ch/.well-known/jwks.json'
    );

    request.flush({
      keys: [
        {
          ...publicRsaKey('transit-key:7'),
          d: 'private-key-material-must-not-be-here',
        },
      ],
    });

    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_JWKS_INVALID',
      })
    );
  });

  it('returns a typed error when the JWKS endpoint returns an HTTP error', () => {
    let actualError: unknown;

    jwksClient.fetch(config).subscribe({
      error: error => {
        actualError = error;
      },
    });

    const request = httpMock.expectOne(
      'https://api.example.ch/.well-known/jwks.json'
    );

    request.flush(
      { message: 'Unavailable' },
      {
        status: 503,
        statusText: 'Service Unavailable',
      }
    );

    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_KEY_RETRIEVAL_FAILED',
        retryable: true,
      })
    );
  });
});
