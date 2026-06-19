import {
  HttpClient,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

import { JeapJweEndpointMatch } from '../config/jeap-jwe-client-config';
import { JeapJweError } from '../error/jeap-jwe-error';
import {
  JeapJweEncryptedRequest,
  JeapJweRequestContext,
  JweRequestEncryptor,
} from '../crypto/jwe-request-encryptor';
import { JweResponseDecryptor } from '../crypto/jwe-response-decryptor';
import { provideJeapJweClient } from '../provider/provide-jeap-jwe-client';

class FakeJweRequestEncryptor extends JweRequestEncryptor {
  readonly calls: Array<{
    method: string;
    url: string;
    body: unknown;
  }> = [];

  /**
   * This fake makes encrypted request handling visible in assertions.
   * It does not perform real cryptographic operations.
   */
  override encrypt(
    request: HttpRequest<unknown>,
    match: JeapJweEndpointMatch
  ): Observable<JeapJweEncryptedRequest> {
    this.calls.push({
      method: request.method,
      url: request.url,
      body: request.body,
    });

    const hasBody = request.body !== null && request.body !== undefined;

    const encryptedRequest = request.clone({
      body: hasBody ? 'encrypted-request-body' : null,
      setHeaders: {
        'JWE-Response-Key': 'encrypted-response-key',
        ...(hasBody ? { 'Content-Type': 'application/jose' } : {}),
      },
    });

    const responseContentEncryptionKey = new Uint8Array(32);
    crypto.getRandomValues(responseContentEncryptionKey);

    const context: JeapJweRequestContext = {
      method: request.method,
      url: request.url,
      path: match.path,
      match,
      originalResponseType: request.responseType,
      responseContentEncryptionKey,
    };

    return of({
      request: encryptedRequest,
      context,
    });
  }
}

class FakeJweResponseDecryptor extends JweResponseDecryptor {
  readonly calls: Array<{
    method: string;
    path: string;
    body: unknown;
  }> = [];

  /**
   * This fake replaces the encrypted backend payload with a predictable
   * object that proves the response passed through the decryptor.
   */
  override decrypt(
    response: HttpResponse<unknown>,
    context: JeapJweRequestContext
  ): Observable<HttpResponse<unknown>> {
    this.calls.push({
      method: context.method,
      path: context.path,
      body: response.body,
    });

    return of(
      response.clone({
        body: {
          decrypted: true,
          method: context.method,
          path: context.path,
          encryptedBody: response.body,
        },
      })
    );
  }
}

describe('jeapJweInterceptor with backend configuration loading', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let requestEncryptor: FakeJweRequestEncryptor;
  let responseDecryptor: FakeJweResponseDecryptor;

  const sameOrigin = globalThis.location.origin;
  const configUrl = `${sameOrigin}/.well-known/jwe-config`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideJeapJweClient({
          enabled: true,
          origin: sameOrigin,

          /**
           * This suite verifies lazy loading and caching of the
           * backend-provided JWE configuration.
           */
          loadBackendConfig: true,

          exclude: [
            { method: '*', path: '/api/local-public/**' },
          ],
        }),

        /**
         * This test backend observes both the config request and
         * the actual API request.
         */
        provideHttpClientTesting(),

        {
          provide: JweRequestEncryptor,
          useClass: FakeJweRequestEncryptor,
        },
        {
          provide: JweResponseDecryptor,
          useClass: FakeJweResponseDecryptor,
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);

    requestEncryptor = TestBed.inject(
      JweRequestEncryptor
    ) as FakeJweRequestEncryptor;

    responseDecryptor = TestBed.inject(
      JweResponseDecryptor
    ) as FakeJweResponseDecryptor;
  });

  afterEach(() => {
    /**
     * Ensures that no config or API request remains unflushed.
     */
    httpMock.verify();
  });

  it('loads backend configuration before encrypting the first protected request', () => {
    let actualResponse: unknown;

    http.get('/api/persons/123').subscribe(response => {
      actualResponse = response;
    });

    /**
     * The protected API request waits until the backend configuration
     * has been loaded and resolved.
     */
    const backendConfigRequest = httpMock.expectOne(configUrl);

    expect(backendConfigRequest.request.method).toBe('GET');
    expect(
      backendConfigRequest.request.headers.has('JWE-Response-Key')
    ).toBeFalse();
    expect(
      backendConfigRequest.request.headers.has('Content-Type')
    ).toBeFalse();

    /**
     * No encryption or decryption has happened before config loading finishes.
     */
    expect(requestEncryptor.calls.length).toBe(0);
    expect(responseDecryptor.calls.length).toBe(0);

    backendConfigRequest.flush({
      jwksUri: '/.well-known/jwks.json',
      refreshIntervalSeconds: 300,
      exclude: [],
    });

    const apiRequest = httpMock.expectOne('/api/persons/123');

    expect(apiRequest.request.method).toBe('GET');
    expect(apiRequest.request.headers.get('JWE-Response-Key')).toBe(
      'encrypted-response-key'
    );

    apiRequest.flush('encrypted-response-body', {
      headers: new HttpHeaders({
        'Content-Type': 'application/jose',
      }),
    });

    expect(actualResponse).toEqual({
      decrypted: true,
      method: 'GET',
      path: '/api/persons/123',
      encryptedBody: 'encrypted-response-body',
    });

    expect(requestEncryptor.calls.length).toBe(1);
    expect(responseDecryptor.calls.length).toBe(1);
  });

  it('loads backend configuration only once and uses the cached result afterwards', () => {
    http.get('/api/persons/1').subscribe();

    const backendConfigRequest = httpMock.expectOne(configUrl);

    backendConfigRequest.flush({
      jwksUri: '/.well-known/jwks.json',
      refreshIntervalSeconds: 300,
      exclude: [],
    });

    const firstApiRequest = httpMock.expectOne('/api/persons/1');
    firstApiRequest.flush('encrypted-first-response');

    http.get('/api/persons/2').subscribe();

    /**
     * The second protected request must reuse the cached configuration.
     */
    httpMock.expectNone(configUrl);

    const secondApiRequest = httpMock.expectOne('/api/persons/2');
    secondApiRequest.flush('encrypted-second-response');

    expect(requestEncryptor.calls.length).toBe(2);
    expect(responseDecryptor.calls.length).toBe(2);
  });

  it('does not encrypt a request excluded by backend configuration', () => {
    let actualResponse: unknown;

    http.get('/api/backend-public/status').subscribe(response => {
      actualResponse = response;
    });

    const backendConfigRequest = httpMock.expectOne(configUrl);

    backendConfigRequest.flush({
      exclude: [
        { method: '*', path: '/api/backend-public/**' },
      ],
    });

    const apiRequest = httpMock.expectOne('/api/backend-public/status');

    /**
     * The API request is forwarded unchanged because it is blacklisted
     * by the backend-provided exclude rules.
     */
    expect(apiRequest.request.method).toBe('GET');
    expect(apiRequest.request.headers.has('JWE-Response-Key')).toBeFalse();
    expect(apiRequest.request.headers.has('Content-Type')).toBeFalse();

    apiRequest.flush({ status: 'ok' });

    expect(actualResponse).toEqual({ status: 'ok' });
    expect(requestEncryptor.calls.length).toBe(0);
    expect(responseDecryptor.calls.length).toBe(0);
  });

  it('does not load backend configuration for a locally excluded request', () => {
    let actualResponse: unknown;

    http.get('/api/local-public/status').subscribe(response => {
      actualResponse = response;
    });

    /**
     * The local exclude rule is evaluated before backend configuration loading.
     * Therefore this request must not trigger a request to jwe-config.
     */
    httpMock.expectNone(configUrl);

    const apiRequest = httpMock.expectOne('/api/local-public/status');

    /**
     * The request is forwarded unchanged because it matches a local exclude rule.
     */
    expect(apiRequest.request.method).toBe('GET');
    expect(apiRequest.request.headers.has('JWE-Response-Key')).toBeFalse();
    expect(apiRequest.request.headers.has('Content-Type')).toBeFalse();

    apiRequest.flush({ status: 'ok' });

    expect(actualResponse).toEqual({ status: 'ok' });
    expect(requestEncryptor.calls.length).toBe(0);
    expect(responseDecryptor.calls.length).toBe(0);
  });

  it('does not load backend configuration for the config endpoint itself', () => {
    let actualResponse: unknown;

    http.get('/.well-known/jwe-config').subscribe(response => {
      actualResponse = response;
    });

    /**
     * The config endpoint is part of the default blacklist.
     * Therefore it must not trigger a second recursive config request.
     */
    const configEndpointRequest = httpMock.expectOne(
      '/.well-known/jwe-config'
    );

    expect(
      configEndpointRequest.request.headers.has('JWE-Response-Key')
    ).toBeFalse();

    configEndpointRequest.flush({
      jwksUri: '/.well-known/jwks.json',
      refreshIntervalSeconds: 300,
      exclude: [],
    });

    expect(actualResponse).toEqual({
      jwksUri: '/.well-known/jwks.json',
      refreshIntervalSeconds: 300,
      exclude: [],
    });

    expect(requestEncryptor.calls.length).toBe(0);
    expect(responseDecryptor.calls.length).toBe(0);
  });

  it('returns a typed error when backend configuration loading fails', () => {
    let actualError: unknown;

    http.get('/api/persons/123').subscribe({
      next: () => fail('The API request must not succeed when config loading fails.'),
      error: error => {
        actualError = error;
      },
    });

    const backendConfigRequest = httpMock.expectOne(configUrl);

    backendConfigRequest.flush(
      { message: 'Configuration unavailable' },
      {
        status: 500,
        statusText: 'Internal Server Error',
      }
    );

    /**
     * The API request never reaches the encryptor when configuration loading fails.
     */
    expect(requestEncryptor.calls.length).toBe(0);
    expect(responseDecryptor.calls.length).toBe(0);

    expect(actualError instanceof JeapJweError).toBeTrue();
    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_CONFIG_LOAD_FAILED',
        retryable: true,
      })
    );

    httpMock.expectNone('/api/persons/123');
  });
});
