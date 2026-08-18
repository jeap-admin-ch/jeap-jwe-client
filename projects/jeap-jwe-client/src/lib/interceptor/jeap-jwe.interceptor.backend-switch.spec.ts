import {
  HttpClient,
  HttpRequest,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

import {
  JeapJweClientConfig,
  JeapJweEndpointMatch,
} from '../config/jeap-jwe-client-config';
import {
  JeapJweEncryptedRequest,
  JeapJweRequestContext,
  JweRequestEncryptor,
} from '../crypto/jwe-request-encryptor';
import { JweResponseDecryptor } from '../crypto/jwe-response-decryptor';
import { provideJeapJweClient } from '../provider/provide-jeap-jwe-client';
import { jeapJweInterceptor } from './jeap-jwe.interceptor';

/**
 * Records every request it is asked to protect, so a test can assert that a
 * request went out untouched. It does not perform real cryptographic
 * operations.
 */
class RecordingJweRequestEncryptor extends JweRequestEncryptor {
  readonly calls: string[] = [];

  override encrypt(
    request: HttpRequest<unknown>,
    match: JeapJweEndpointMatch
  ): Observable<JeapJweEncryptedRequest> {
    this.calls.push(request.url);

    const responseContentEncryptionKey = new Uint8Array(32);

    const context: JeapJweRequestContext = {
      method: request.method,
      url: request.url,
      path: match.path,
      match,
      originalResponseType: request.responseType,
      responseContentEncryptionKey,
    };

    return of({
      request: request.clone({
        setHeaders: { 'JWE-Response-Key': 'encrypted-response-key' },
      }),
      context,
    });
  }
}

class PassThroughJweResponseDecryptor extends JweResponseDecryptor {
  override decrypt(
    response: HttpResponse<unknown>
  ): Observable<HttpResponse<unknown>> {
    return of(response);
  }
}

/**
 * The backend's master switch (`jeap.jwe.enabled`, published as `enabled` in
 * the protocol metadata) drives the client when the application does not set
 * the option itself. That is what keeps one frontend build deployable against
 * a stage with JWE turned on and a stage with it turned off.
 */
describe('jeapJweInterceptor following the backend enabled switch', () => {
  const sameOrigin = globalThis.location.origin;
  const configUrl = `${sameOrigin}/.well-known/jwe-configuration`;

  let http: HttpClient;
  let httpMock: HttpTestingController;
  let requestEncryptor: RecordingJweRequestEncryptor;

  function configure(config: JeapJweClientConfig): void {
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({
      providers: [
        provideJeapJweClient({ origin: sameOrigin, ...config }),
        provideHttpClient(withInterceptors([jeapJweInterceptor])),
        provideHttpClientTesting(),
        {
          provide: JweRequestEncryptor,
          useClass: RecordingJweRequestEncryptor,
        },
        {
          provide: JweResponseDecryptor,
          useClass: PassThroughJweResponseDecryptor,
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    requestEncryptor = TestBed.inject(
      JweRequestEncryptor
    ) as RecordingJweRequestEncryptor;
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('sends requests in plaintext when the backend publishes enabled false', () => {
    configure({});

    let actualResponse: unknown;
    http.get('/api/persons/123').subscribe(response => {
      actualResponse = response;
    });

    /**
     * A disabled backend still answers the metadata endpoint - that is the only
     * signal the client accepts as "encryption is off".
     */
    httpMock.expectOne(configUrl).flush({
      enabled: false,
      contentTypeAllowlist: [],
      includedPaths: [],
      excludedPaths: [],
    });

    const apiRequest = httpMock.expectOne('/api/persons/123');

    expect(apiRequest.request.headers.has('JWE-Response-Key')).toBeFalse();
    expect(requestEncryptor.calls).toEqual([]);

    apiRequest.flush({ id: 123 });

    expect(actualResponse).toEqual({ id: 123 });
  });

  it('never loads the JWKS when the backend is disabled', () => {
    configure({});

    http.get('/api/persons/1').subscribe();
    httpMock.expectOne(configUrl).flush({ enabled: false });
    httpMock.expectOne('/api/persons/1').flush({});

    httpMock.expectNone(`${sameOrigin}/.well-known/jwks.json`);
  });

  it('protects requests when the backend publishes enabled true', () => {
    configure({});

    http.get('/api/persons/2').subscribe();
    httpMock.expectOne(configUrl).flush({ enabled: true });

    const apiRequest = httpMock.expectOne('/api/persons/2');

    expect(apiRequest.request.headers.get('JWE-Response-Key')).toBe(
      'encrypted-response-key'
    );
    expect(requestEncryptor.calls).toEqual(['/api/persons/2']);

    apiRequest.flush({});
  });

  it('keeps protecting requests when the application pins enabled true', () => {
    // An explicit local value wins, so an application can enforce encryption
    // regardless of what the backend publishes.
    configure({ enabled: true });

    http.get('/api/persons/3').subscribe();
    httpMock.expectOne(configUrl).flush({ enabled: false });

    const apiRequest = httpMock.expectOne('/api/persons/3');

    expect(apiRequest.request.headers.get('JWE-Response-Key')).toBe(
      'encrypted-response-key'
    );

    apiRequest.flush({});
  });

  it('does not even load the metadata when the application pins enabled false', () => {
    configure({ enabled: false });

    http.get('/api/persons/4').subscribe();

    httpMock.expectNone(configUrl);

    const apiRequest = httpMock.expectOne('/api/persons/4');

    expect(apiRequest.request.headers.has('JWE-Response-Key')).toBeFalse();
    expect(requestEncryptor.calls).toEqual([]);

    apiRequest.flush({});
  });

  it('still fails closed when the metadata cannot be loaded', () => {
    // A failed load must never be read as "the backend has encryption off": a
    // mistyped path or an outage would silently downgrade every request.
    configure({});

    let actualError: unknown;
    http.get('/api/persons/5').subscribe({
      error: (error: unknown) => {
        actualError = error;
      },
    });

    httpMock
      .expectOne(configUrl)
      .flush('not found', { status: 404, statusText: 'Not Found' });

    httpMock.expectNone('/api/persons/5');
    expect((actualError as { code?: string }).code).toBe(
      'JWE_CONFIG_LOAD_FAILED'
    );
  });
});
