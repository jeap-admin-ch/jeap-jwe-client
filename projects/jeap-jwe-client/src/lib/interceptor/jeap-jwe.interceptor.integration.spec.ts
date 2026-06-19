import { HttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { decodeProtectedHeader } from 'jose';
import { firstValueFrom } from 'rxjs';

import { JeapJweBackendConfigResponse } from '../config/jeap-jwe-client-config';
import {
  JEAP_JWE_MEDIA_TYPE,
  JEAP_JWE_RESPONSE_KEY_HEADER,
} from '../crypto/jwe-algorithms';
import { JeapJweError } from '../error/jeap-jwe-error';
import { JeapJwePublicJwk } from '../jwks/jwk.model';
import { provideJeapJweClient } from '../provider/provide-jeap-jwe-client';
import { JeapJweTestBackend } from '../testing/jwe-test-backend';
import {
  CreatePersonRequest,
  currentTestOrigin,
  HealthResponse,
  JWE_TEST_CONFIG_PATH,
  JWE_TEST_EXCLUDED_HEALTH_PATH,
  JWE_TEST_JWKS_PATH,
  JWE_TEST_PROTECTED_PERSON_PATH,
  JWE_TEST_PROTECTED_PERSONS_PATH,
  PersonResponse,
} from '../testing/jwe-test-fixtures';
import { createJeapJweTestKeyPair } from '../testing/jwe-test-keys';

/**
 * Enable this locally for walkthroughs.
 *
 * The trace deliberately redacts compact JWE values, CEKs, private keys,
 * and RSA modulus data. It only shows protocol-relevant metadata.
 */
const ENABLE_PROTOCOL_TRACE = false;

describe('jeapJweInterceptor integration', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let backend: JeapJweTestBackend;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideJeapJweClient(createTestClientConfig()),

        /**
         * The testing provider must be registered after the HttpClient provider
         * so requests are routed through Angular's testing backend.
         */
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    backend = new JeapJweTestBackend(httpMock);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('encrypts POST JSON bodies and decrypts encrypted JSON responses', async () => {
    /**
     * This test exercises the complete POST happy path:
     * backend config loading -> JWKS loading -> request encryption ->
     * mocked backend decryption -> encrypted response -> client-side response decryption.
     */
    traceSection('POST happy path with backend config and JWKS');

    const keyPair = await createJeapJweTestKeyPair('test-key-post-1');

    const requestBody: CreatePersonRequest = {
      name: 'Alice',
    };

    traceJson('Angular application creates plain JSON request payload', requestBody);

    const responsePromise = firstValueFrom(
      http.post<PersonResponse>(
        JWE_TEST_PROTECTED_PERSONS_PATH,
        requestBody
      )
    );

    traceMessage('Client loads backend JWE configuration first.');

    const backendConfig = expectAndFlushBackendConfig(backend);

    traceJson('Mock backend returns JWE configuration', backendConfig);

    traceMessage('Client loads JWKS from the configured jwksUri.');

    backend.expectAndFlushJwks([keyPair.publicJwk]);

    traceJwks('Mock backend returns JWKS', [keyPair.publicJwk]);

    const apiRequest = await backend.expectEncryptedRequestAsync(
      'POST',
      JWE_TEST_PROTECTED_PERSONS_PATH
    );

    traceRequest('Encrypted request sent to backend', apiRequest);
    traceRequestBodyJweHeader('Request body JWE protected header', apiRequest);
    traceResponseKeyJweHeader(
      'JWE-Response-Key protected header',
      apiRequest
    );

    expect(apiRequest.request.headers.get('Accept')).toBe(JEAP_JWE_MEDIA_TYPE);
    expect(apiRequest.request.headers.get('Content-Type')).toBe(
      JEAP_JWE_MEDIA_TYPE
    );
    expect(apiRequest.request.headers.has(JEAP_JWE_RESPONSE_KEY_HEADER)).toBeTrue();

    const requestBodyHeader =
      backend.decodeRequestBodyProtectedHeader(apiRequest);

    expect(requestBodyHeader['kid']).toBe(keyPair.kid);
    expect(requestBodyHeader['cty']).toBe('application/json');

    const decryptedRequestBody = await backend.decryptJsonRequestBody(
      apiRequest,
      keyPair.privateKey
    );

    traceJson('Mock backend decrypts request payload', decryptedRequestBody);

    expect(decryptedRequestBody).toEqual(requestBody);

    const responseCek = await backend.decryptResponseKey(
      apiRequest,
      keyPair.privateKey
    );

    traceMessage(
      `Mock backend decrypts request-local response CEK: <redacted ${responseCek.byteLength} bytes>.`
    );

    const backendResponse: PersonResponse = {
      id: 123,
      name: 'Alice',
    };

    traceJson('Mock backend prepares plain JSON response payload', backendResponse);

    await backend.flushEncryptedJsonResponse(
      apiRequest,
      responseCek,
      backendResponse
    );

    traceJson('Mock backend returns encrypted response', {
      contentType: JEAP_JWE_MEDIA_TYPE,
      encryptedWith: 'request-local response CEK',
      plaintextFixture: backendResponse,
    });

    const response = await responsePromise;

    traceJson('Angular application receives decrypted response', response);

    expect(response).toEqual({
      id: 123,
      name: 'Alice',
    });
  });

  it('sets a response key for GET requests without encrypting a request body', async () => {
    /**
     * GET requests have no encrypted request body, but still need a
     * request-local response CEK so the backend can encrypt the response.
     */
    traceSection('GET happy path');

    const keyPair = await createJeapJweTestKeyPair('test-key-get-1');

    const responsePromise = firstValueFrom(
      http.get<PersonResponse>(JWE_TEST_PROTECTED_PERSON_PATH)
    );

    expectAndFlushBackendConfig(backend);

    backend.expectAndFlushJwks([keyPair.publicJwk]);

    traceJwks('Mock backend returns JWKS', [keyPair.publicJwk]);

    const apiRequest = await backend.expectEncryptedRequestAsync(
      'GET',
      JWE_TEST_PROTECTED_PERSON_PATH
    );

    traceRequest('Protected GET request sent to backend', apiRequest);
    traceResponseKeyJweHeader(
      'JWE-Response-Key protected header',
      apiRequest
    );

    expect(apiRequest.request.body).toBeNull();
    expect(apiRequest.request.headers.get('Accept')).toBe(JEAP_JWE_MEDIA_TYPE);
    expect(apiRequest.request.headers.has('Content-Type')).toBeFalse();
    expect(apiRequest.request.headers.has(JEAP_JWE_RESPONSE_KEY_HEADER)).toBeTrue();

    const responseKeyHeader =
      backend.decodeResponseKeyProtectedHeader(apiRequest);

    expect(responseKeyHeader['kid']).toBe(keyPair.kid);

    const responseCek = await backend.decryptResponseKey(
      apiRequest,
      keyPair.privateKey
    );

    traceMessage(
      `Mock backend decrypts request-local response CEK: <redacted ${responseCek.byteLength} bytes>.`
    );

    const backendResponse: PersonResponse = {
      id: 123,
      name: 'Alice',
    };

    await backend.flushEncryptedJsonResponse(
      apiRequest,
      responseCek,
      backendResponse
    );

    traceJson('Mock backend returns encrypted response', {
      contentType: JEAP_JWE_MEDIA_TYPE,
      encryptedWith: 'request-local response CEK',
      plaintextFixture: backendResponse,
    });

    const response = await responsePromise;

    traceJson('Angular application receives decrypted response', response);

    expect(response).toEqual({
      id: 123,
      name: 'Alice',
    });
  });

  it('does not protect excluded technical endpoints', async () => {
    /**
     * Excluded endpoints must not trigger backend config loading, JWKS loading,
     * request encryption, response-key creation, or response decryption.
     */
    traceSection('Excluded technical endpoint');

    const responsePromise = firstValueFrom(
      http.get<HealthResponse>(JWE_TEST_EXCLUDED_HEALTH_PATH)
    );

    const request = backend.expectPlainRequest(
      'GET',
      JWE_TEST_EXCLUDED_HEALTH_PATH
    );

    traceRequest('Plain request forwarded without JWE protection', request);

    expect(request.request.headers.get('Accept')).not.toBe(JEAP_JWE_MEDIA_TYPE);
    expect(request.request.headers.has(JEAP_JWE_RESPONSE_KEY_HEADER)).toBeFalse();

    request.flush({
      status: 'UP',
    });

    traceMessage(
      'No backend config request and no JWKS request are made because the endpoint is excluded locally.'
    );

    backend.expectNoRequest('GET', JWE_TEST_CONFIG_PATH);
    backend.expectNoRequest('GET', JWE_TEST_JWKS_PATH);

    const response = await responsePromise;

    traceJson('Angular application receives plain response', response);

    expect(response).toEqual({
      status: 'UP',
    });
  });

  it('refreshes JWKS and retries once when the backend returns JWE_UNKNOWN_KID', async () => {
    /**
     * The first request uses a cached key that the backend rejects.
     * The client refreshes JWKS, encrypts the original request again,
     * creates a fresh response CEK, and retries once.
     */
    traceSection('Retry after JWE_UNKNOWN_KID');

    const oldKeyPair = await createJeapJweTestKeyPair('test-key-old');
    const newKeyPair = await createJeapJweTestKeyPair('test-key-new');

    const requestBody: CreatePersonRequest = {
      name: 'Alice',
    };

    const responsePromise = firstValueFrom(
      http.post<PersonResponse>(
        JWE_TEST_PROTECTED_PERSONS_PATH,
        requestBody
      )
    );

    expectAndFlushBackendConfig(backend);

    traceMessage('Client initially loads JWKS with an outdated key.');

    backend.expectAndFlushJwks([oldKeyPair.publicJwk]);

    traceJwks('Initial JWKS response', [oldKeyPair.publicJwk]);

    const firstApiRequest = await backend.expectEncryptedRequestAsync(
      'POST',
      JWE_TEST_PROTECTED_PERSONS_PATH
    );

    traceRequest('First encrypted request sent to backend', firstApiRequest);
    traceRequestBodyJweHeader(
      'First request body JWE protected header',
      firstApiRequest
    );
    traceResponseKeyJweHeader(
      'First JWE-Response-Key protected header',
      firstApiRequest
    );

    expect(
      backend.decodeRequestBodyProtectedHeader(firstApiRequest)['kid']
    ).toBe(oldKeyPair.kid);

    traceJson('Mock backend rejects first request', {
      status: 400,
      code: 'JWE_UNKNOWN_KID',
      reason:
        'The key identifier is unknown or no longer accepted by the backend.',
    });

    backend.flushUnknownKid(firstApiRequest);

    traceMessage(
      'Client detects retryable JWE_UNKNOWN_KID, refreshes JWKS, and retries once.'
    );

    backend.expectAndFlushJwks([newKeyPair.publicJwk]);

    traceJwks('Refreshed JWKS response', [newKeyPair.publicJwk]);

    const retryApiRequest = await backend.expectEncryptedRequestAsync(
      'POST',
      JWE_TEST_PROTECTED_PERSONS_PATH
    );

    traceRequest('Retried encrypted request sent to backend', retryApiRequest);
    traceRequestBodyJweHeader(
      'Retried request body JWE protected header',
      retryApiRequest
    );
    traceResponseKeyJweHeader(
      'Retried JWE-Response-Key protected header',
      retryApiRequest
    );

    expect(
      backend.decodeRequestBodyProtectedHeader(retryApiRequest)['kid']
    ).toBe(newKeyPair.kid);

    const decryptedRetryBody = await backend.decryptJsonRequestBody(
      retryApiRequest,
      newKeyPair.privateKey
    );

    traceJson('Mock backend decrypts retried request payload', decryptedRetryBody);

    expect(decryptedRetryBody).toEqual(requestBody);

    const responseCek = await backend.decryptResponseKey(
      retryApiRequest,
      newKeyPair.privateKey
    );

    traceMessage(
      `Mock backend decrypts request-local response CEK from retried request: <redacted ${responseCek.byteLength} bytes>.`
    );

    const backendResponse: PersonResponse = {
      id: 123,
      name: 'Alice',
    };

    await backend.flushEncryptedJsonResponse(
      retryApiRequest,
      responseCek,
      backendResponse
    );

    traceJson('Mock backend returns encrypted response for retry', {
      contentType: JEAP_JWE_MEDIA_TYPE,
      encryptedWith: 'request-local response CEK from retried request',
      plaintextFixture: backendResponse,
    });

    const response = await responsePromise;

    traceJson('Angular application receives decrypted retry response', response);

    expect(response).toEqual({
      id: 123,
      name: 'Alice',
    });
  });

  it('returns a typed error when the retry also returns JWE_UNKNOWN_KID', async () => {
    /**
     * A second retryable backend error must not create a retry loop.
     * The typed error is returned to the application instead.
     */
    traceSection('Retry loop prevention');

    const oldKeyPair = await createJeapJweTestKeyPair('test-key-old');
    const newKeyPair = await createJeapJweTestKeyPair('test-key-new');

    const responsePromise = firstValueFrom(
      http.get<PersonResponse>(JWE_TEST_PROTECTED_PERSON_PATH)
    );

    expectAndFlushBackendConfig(backend);

    backend.expectAndFlushJwks([oldKeyPair.publicJwk]);

    traceJwks('Initial JWKS response', [oldKeyPair.publicJwk]);

    const firstApiRequest = await backend.expectEncryptedRequestAsync(
      'GET',
      JWE_TEST_PROTECTED_PERSON_PATH
    );

    traceRequest('First protected GET sent to backend', firstApiRequest);
    traceResponseKeyJweHeader(
      'First JWE-Response-Key protected header',
      firstApiRequest
    );

    traceJson('Mock backend rejects first request', {
      status: 400,
      code: 'JWE_UNKNOWN_KID',
    });

    backend.flushUnknownKid(firstApiRequest);

    backend.expectAndFlushJwks([newKeyPair.publicJwk]);

    traceJwks('Refreshed JWKS response', [newKeyPair.publicJwk]);

    const retryApiRequest = await backend.expectEncryptedRequestAsync(
      'GET',
      JWE_TEST_PROTECTED_PERSON_PATH
    );

    traceRequest('Retried protected GET sent to backend', retryApiRequest);
    traceResponseKeyJweHeader(
      'Retried JWE-Response-Key protected header',
      retryApiRequest
    );

    traceJson('Mock backend rejects retry again', {
      status: 400,
      code: 'JWE_UNKNOWN_KID',
      expectedClientBehavior: 'Return typed error without another retry.',
    });

    backend.flushUnknownKid(retryApiRequest);

    let actualError: unknown;

    try {
      await responsePromise;
      fail('Expected the encrypted request to fail.');
    } catch (error) {
      actualError = error;
    }

    traceJson('Angular application receives typed error', {
      name: actualError instanceof Error ? actualError.name : undefined,
      code:
        actualError instanceof JeapJweError ? actualError.code : undefined,
      retryable:
        actualError instanceof JeapJweError
          ? actualError.retryable
          : undefined,
    });

    expect(actualError instanceof JeapJweError).toBeTrue();
    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_UNKNOWN_KID',
        retryable: true,
      })
    );
  });

  it('fails with a typed error when the encrypted response uses the wrong CEK', async () => {
    /**
     * The response must be encrypted with the request-local CEK that was
     * transported in JWE-Response-Key. Any other CEK must fail authentication.
     */
    traceSection('Wrong response CEK');

    const keyPair = await createJeapJweTestKeyPair('test-key-wrong-cek');

    const responsePromise = firstValueFrom(
      http.get<PersonResponse>(JWE_TEST_PROTECTED_PERSON_PATH)
    );

    expectAndFlushBackendConfig(backend);

    backend.expectAndFlushJwks([keyPair.publicJwk]);

    traceJwks('Mock backend returns JWKS', [keyPair.publicJwk]);

    const apiRequest = await backend.expectEncryptedRequestAsync(
      'GET',
      JWE_TEST_PROTECTED_PERSON_PATH
    );

    traceRequest('Protected GET request sent to backend', apiRequest);
    traceResponseKeyJweHeader(
      'JWE-Response-Key protected header',
      apiRequest
    );

    const wrongResponseCek = new Uint8Array(32);
    crypto.getRandomValues(wrongResponseCek);

    traceMessage(
      `Mock backend intentionally encrypts the response with the wrong CEK: <redacted ${wrongResponseCek.byteLength} bytes>.`
    );

    await backend.flushEncryptedJsonResponse(apiRequest, wrongResponseCek, {
      id: 123,
      name: 'Alice',
    });

    traceJson('Mock backend returns encrypted response with wrong CEK', {
      contentType: JEAP_JWE_MEDIA_TYPE,
      expectedClientBehavior: 'Response decryption must fail.',
    });

    let actualError: unknown;

    try {
      await responsePromise;
      fail('Expected encrypted response decryption to fail.');
    } catch (error) {
      actualError = error;
    }

    traceJson('Angular application receives typed error', {
      name: actualError instanceof Error ? actualError.name : undefined,
      code:
        actualError instanceof JeapJweError ? actualError.code : undefined,
      message: actualError instanceof Error ? actualError.message : undefined,
    });

    expect(actualError instanceof JeapJweError).toBeTrue();
    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_DECRYPTION_FAILED',
      })
    );

    expect((actualError as Error).message).not.toContain('eyJ');
  });
});

function createTestClientConfig(): Parameters<typeof provideJeapJweClient>[0] {
  return {
    enabled: true,
    origin: currentTestOrigin(),
    jweConfigPath: JWE_TEST_CONFIG_PATH,
    loadBackendConfig: true,
  };
}

function createTestBackendConfig(): JeapJweBackendConfigResponse {
  return {
    jwksUri: JWE_TEST_JWKS_PATH,
    refreshIntervalSeconds: 300,
    exclude: [
      {
        method: '*',
        path: JWE_TEST_EXCLUDED_HEALTH_PATH,
      },
    ],
  };
}

function expectAndFlushBackendConfig(
  backend: JeapJweTestBackend
): JeapJweBackendConfigResponse {
  const backendConfig = createTestBackendConfig();

  backend.expectAndFlushBackendConfig(backendConfig);

  return backendConfig;
}

function traceSection(title: string): void {
  if (!ENABLE_PROTOCOL_TRACE) {
    return;
  }

  console.info(`\n[JWE integration] ${title}`);
}

function traceMessage(message: string): void {
  if (!ENABLE_PROTOCOL_TRACE) {
    return;
  }

  console.info(`[JWE integration] ${message}`);
}

function traceJson(label: string, value: unknown): void {
  if (!ENABLE_PROTOCOL_TRACE) {
    return;
  }

  console.info(`[JWE integration] ${label}:`, value);
}

function traceJwks(
  label: string,
  keys: readonly JeapJwePublicJwk[]
): void {
  traceJson(label, {
    keys: keys.map(key => ({
      kid: key.kid,
      kty: key.kty,
      use: key.use,
      alg: key.alg,
      e: key.e,
      n: '<redacted>',
    })),
  });
}

function traceRequest(label: string, request: TestRequest): void {
  const responseKey = request.request.headers.get(
    JEAP_JWE_RESPONSE_KEY_HEADER
  );

  traceJson(label, {
    method: request.request.method,
    url: request.request.urlWithParams,
    headers: {
      accept: request.request.headers.get('Accept'),
      contentType: request.request.headers.get('Content-Type'),
      jweResponseKey: summarizeCompactJwe(responseKey),
    },
    body: summarizeBody(request.request.body),
  });
}

function traceRequestBodyJweHeader(
  label: string,
  request: TestRequest
): void {
  const body = request.request.body;

  if (typeof body !== 'string') {
    traceJson(label, {
      body: body === null ? null : '<not-a-compact-jwe>',
    });
    return;
  }

  traceCompactJweHeader(label, body);
}

function traceResponseKeyJweHeader(
  label: string,
  request: TestRequest
): void {
  const responseKey = request.request.headers.get(
    JEAP_JWE_RESPONSE_KEY_HEADER
  );

  traceCompactJweHeader(label, responseKey);
}

function traceCompactJweHeader(
  label: string,
  compactJwe: string | null
): void {
  if (!compactJwe) {
    traceJson(label, null);
    return;
  }

  const protectedHeader = decodeProtectedHeader(compactJwe);

  traceJson(label, {
    alg: protectedHeader.alg,
    enc: protectedHeader.enc,
    kid: protectedHeader.kid,
    cty: protectedHeader.cty,
    compactJwe: summarizeCompactJwe(compactJwe),
  });
}

function summarizeBody(body: unknown): unknown {
  if (typeof body === 'string') {
    return summarizeCompactJwe(body);
  }

  return body;
}

function summarizeCompactJwe(compactJwe: string | null): string | null {
  if (!compactJwe) {
    return null;
  }

  return `<compact-jwe length=${compactJwe.length}>`;
}
