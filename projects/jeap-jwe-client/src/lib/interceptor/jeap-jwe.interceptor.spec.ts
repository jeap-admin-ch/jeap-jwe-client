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
   * This fake simulates the request transformation that real JWE encryption
   * will perform in a later implementation step.
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
      body: hasBody ? `encrypted-${request.method.toLowerCase()}-body` : null,
      setHeaders: {
        'JWE-Response-Key': `encrypted-response-key-for-${request.method}`,
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
    status: number;
    body: unknown;
    method: string;
    path: string;
  }> = [];

  /**
   * This fake simulates the response transformation that real JWE decryption
   * will perform in a later implementation step.
   */
  override decrypt(
    response: HttpResponse<unknown>,
    context: JeapJweRequestContext
  ): Observable<HttpResponse<unknown>> {
    this.calls.push({
      status: response.status,
      body: response.body,
      method: context.method,
      path: context.path,
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

describe('jeapJweInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let requestEncryptor: FakeJweRequestEncryptor;
  let responseDecryptor: FakeJweResponseDecryptor;

  const sameOrigin = globalThis.location.origin;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideJeapJweClient({
          enabled: true,
          origin: sameOrigin,

          /**
           * This suite tests only interceptor request/response behavior.
           * Backend configuration loading is covered by a separate suite.
           */
          loadBackendConfig: false,

          exclude: [
            { method: '*', path: '/api/protected/excluded/**' },
          ],
        }),

        /**
         * This must be registered after provideJeapJweClient so that
         * Angular replaces the real HTTP backend with the test backend.
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
     * Verifies that every expected HTTP request has been flushed.
     */
    httpMock.verify();
  });

  it('encrypts a protected POST request and decrypts its response', () => {
    let actualResponse: unknown;

    http
      .post('/api/protected/persons', { name: 'Alice' })
      .subscribe(response => {
        actualResponse = response;
      });

    const request = httpMock.expectOne('/api/protected/persons');

    /**
     * The fake encryptor replaces the original payload and adds
     * the headers that the real JWE implementation will later use.
     */
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBe('encrypted-post-body');
    expect(request.request.headers.get('Content-Type')).toBe(
      'application/jose'
    );
    expect(request.request.headers.get('JWE-Response-Key')).toBe(
      'encrypted-response-key-for-POST'
    );

    request.flush('encrypted-post-response', {
      headers: new HttpHeaders({
        'Content-Type': 'application/jose',
      }),
    });

    /**
     * The subscriber receives the response produced by the fake decryptor,
     * not the encrypted response body sent by the test backend.
     */
    expect(actualResponse).toEqual({
      decrypted: true,
      method: 'POST',
      path: '/api/protected/persons',
      encryptedBody: 'encrypted-post-response',
    });

    expect(requestEncryptor.calls.length).toBe(1);
    expect(responseDecryptor.calls.length).toBe(1);
  });

  it('intercepts a protected GET request without a body and decrypts its response', () => {
    let actualResponse: unknown;

    http.get('/api/protected/persons/123').subscribe(response => {
      actualResponse = response;
    });

    const request = httpMock.expectOne('/api/protected/persons/123');

    /**
     * GET requests do not have a request body to encrypt.
     * They still receive a response key for encrypted responses.
     */
    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.has('Content-Type')).toBeFalse();
    expect(request.request.headers.get('JWE-Response-Key')).toBe(
      'encrypted-response-key-for-GET'
    );

    request.flush('encrypted-get-response', {
      headers: new HttpHeaders({
        'Content-Type': 'application/jose',
      }),
    });

    expect(actualResponse).toEqual({
      decrypted: true,
      method: 'GET',
      path: '/api/protected/persons/123',
      encryptedBody: 'encrypted-get-response',
    });

    expect(requestEncryptor.calls.length).toBe(1);
    expect(responseDecryptor.calls.length).toBe(1);
  });

  it('intercepts PUT, PATCH and DELETE requests using the same protected flow', () => {
    const methods = ['PUT', 'PATCH', 'DELETE'] as const;
    const receivedResponses: unknown[] = [];

    for (const method of methods) {
      const url = `/api/protected/resource/${method.toLowerCase()}`;

      http
        .request(method, url, {
          body: { operation: method },
        })
        .subscribe(response => {
          receivedResponses.push(response);
        });

      const request = httpMock.expectOne(url);

      /**
       * Every non-excluded method uses the same encryption branch.
       */
      expect(request.request.method).toBe(method);
      expect(request.request.body).toBe(
        `encrypted-${method.toLowerCase()}-body`
      );
      expect(request.request.headers.get('Content-Type')).toBe(
        'application/jose'
      );
      expect(request.request.headers.get('JWE-Response-Key')).toBe(
        `encrypted-response-key-for-${method}`
      );

      request.flush(`encrypted-${method.toLowerCase()}-response`, {
        headers: new HttpHeaders({
          'Content-Type': 'application/jose',
        }),
      });
    }

    expect(receivedResponses).toEqual([
      {
        decrypted: true,
        method: 'PUT',
        path: '/api/protected/resource/put',
        encryptedBody: 'encrypted-put-response',
      },
      {
        decrypted: true,
        method: 'PATCH',
        path: '/api/protected/resource/patch',
        encryptedBody: 'encrypted-patch-response',
      },
      {
        decrypted: true,
        method: 'DELETE',
        path: '/api/protected/resource/delete',
        encryptedBody: 'encrypted-delete-response',
      },
    ]);

    expect(requestEncryptor.calls.length).toBe(3);
    expect(responseDecryptor.calls.length).toBe(3);
  });

  it('does not transform a request matched by a local exclude rule', () => {
    let actualResponse: unknown;

    http
      .post('/api/protected/excluded/ping', { ping: true })
      .subscribe(response => {
        actualResponse = response;
      });

    const request = httpMock.expectOne('/api/protected/excluded/ping');

    /**
     * The request remains untouched because it matches the local blacklist.
     */
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ ping: true });
    expect(request.request.headers.has('JWE-Response-Key')).toBeFalse();

    request.flush({ status: 'ok' });

    expect(actualResponse).toEqual({ status: 'ok' });
    expect(requestEncryptor.calls.length).toBe(0);
    expect(responseDecryptor.calls.length).toBe(0);
  });

  it('does not transform the default excluded JWKS endpoint', () => {
    let actualResponse: unknown;

    http.get('/.well-known/jwks.json').subscribe(response => {
      actualResponse = response;
    });

    const request = httpMock.expectOne('/.well-known/jwks.json');

    /**
     * Infrastructure endpoints must bypass the JWE interceptor.
     */
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.has('JWE-Response-Key')).toBeFalse();

    request.flush({ keys: [] });

    expect(actualResponse).toEqual({ keys: [] });
    expect(requestEncryptor.calls.length).toBe(0);
    expect(responseDecryptor.calls.length).toBe(0);
  });
});
