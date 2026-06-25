import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  HttpResponse,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

import { JeapJweEndpointMatch } from '../config/jeap-jwe-client-config';
import {
  JeapJweEncryptedRequest,
  JeapJweRequestContext,
  JweRequestEncryptor,
} from '../crypto/jwe-request-encryptor';
import { JweResponseDecryptor } from '../crypto/jwe-response-decryptor';
import { JeapJweError } from '../error/jeap-jwe-error';
import { JeapJwksSnapshot } from '../jwks/jwk.model';
import { JweKeySelector } from '../jwks/jwe-key-selector';
import { provideJeapJweClient } from '../provider/provide-jeap-jwe-client';

class FakeJweRequestEncryptor extends JweRequestEncryptor {
  calls = 0;

  override encrypt(
    request: Parameters<JweRequestEncryptor['encrypt']>[0],
    match: JeapJweEndpointMatch
  ): Observable<JeapJweEncryptedRequest> {
    this.calls += 1;

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
      request: request.clone({
        setHeaders: {
          'X-JWE-Test-Attempt': String(this.calls),
        },
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

describe('jeapJweInterceptor retry handling', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let requestEncryptor: FakeJweRequestEncryptor;
  let keySelector: jasmine.SpyObj<JweKeySelector>;

  beforeEach(() => {
    requestEncryptor = new FakeJweRequestEncryptor();

    keySelector = jasmine.createSpyObj<JweKeySelector>('JweKeySelector', [
      'refresh',
    ]);

    keySelector.refresh.and.returnValue(of({} as JeapJwksSnapshot));

    TestBed.configureTestingModule({
      providers: [
        provideJeapJweClient({
          enabled: true,
          origin: globalThis.location.origin,
          loadBackendConfig: false,
        }),
        provideHttpClientTesting(),
        {
          provide: JweRequestEncryptor,
          useValue: requestEncryptor,
        },
        {
          provide: JweResponseDecryptor,
          useClass: PassThroughJweResponseDecryptor,
        },
        {
          provide: JweKeySelector,
          useValue: keySelector,
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('refreshes JWKS and retries exactly once after JWE_UNKNOWN_KID', () => {
    let actualResponse: unknown;

    http.get('/api/persons/123').subscribe(response => {
      actualResponse = response;
    });

    const firstRequest = httpMock.expectOne('/api/persons/123');

    expect(firstRequest.request.headers.get('X-JWE-Test-Attempt')).toBe('1');

    firstRequest.flush(
      JSON.stringify({
        code: 'JWE_UNKNOWN_KID',
      }),
      {
        status: 400,
        statusText: 'Bad Request',
        headers: new HttpHeaders({
          'Content-Type': 'application/problem+json',
        }),
      }
    );

    expect(keySelector.refresh).toHaveBeenCalledTimes(1);

    const retryRequest = httpMock.expectOne('/api/persons/123');

    expect(retryRequest.request.headers.get('X-JWE-Test-Attempt')).toBe('2');

    retryRequest.flush({
      id: 123,
      name: 'Alice',
    });

    expect(actualResponse).toEqual({
      id: 123,
      name: 'Alice',
    });

    expect(requestEncryptor.calls).toBe(2);
    expect(keySelector.refresh).toHaveBeenCalledTimes(1);
  });

  it('does not retry ordinary backend validation errors', () => {
    let actualError: unknown;

    http.get('/api/persons/123').subscribe({
      error: error => {
        actualError = error;
      },
    });

    const request = httpMock.expectOne('/api/persons/123');

    request.flush(
      {
        code: 'VALIDATION_FAILED',
      },
      {
        status: 400,
        statusText: 'Bad Request',
      }
    );

    httpMock.expectNone('/api/persons/123');

    expect(actualError instanceof HttpErrorResponse).toBeTrue();
    expect(keySelector.refresh).not.toHaveBeenCalled();
    expect(requestEncryptor.calls).toBe(1);
  });

  it('returns a typed error after the one allowed retry also fails', () => {
    let actualError: unknown;

    http.get('/api/persons/123').subscribe({
      error: error => {
        actualError = error;
      },
    });

    const firstRequest = httpMock.expectOne('/api/persons/123');

    firstRequest.flush(
      JSON.stringify({
        code: 'JWE_UNKNOWN_KID',
      }),
      {
        status: 400,
        statusText: 'Bad Request',
        headers: new HttpHeaders({
          'Content-Type': 'application/problem+json',
        }),
      }
    );

    const retryRequest = httpMock.expectOne('/api/persons/123');

    retryRequest.flush(
      JSON.stringify({
        code: 'JWE_UNKNOWN_KID',
      }),
      {
        status: 400,
        statusText: 'Bad Request',
        headers: new HttpHeaders({
          'Content-Type': 'application/problem+json',
        }),
      }
    );

    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_UNKNOWN_KID',
        retryable: true,
      })
    );

    expect(actualError instanceof JeapJweError).toBeTrue();
    expect(keySelector.refresh).toHaveBeenCalledTimes(1);
    expect(requestEncryptor.calls).toBe(2);
  });
});
