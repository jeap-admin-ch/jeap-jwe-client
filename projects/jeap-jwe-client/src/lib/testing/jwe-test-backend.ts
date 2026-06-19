import { HttpHeaders } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
} from '@angular/common/http/testing';
import {
  CompactEncrypt,
  compactDecrypt,
  decodeProtectedHeader,
} from 'jose';

import {
  JEAP_JWE_CONTENT_ENCRYPTION,
  JEAP_JWE_MEDIA_TYPE,
  JEAP_JWE_REQUEST_ALGORITHM,
  JEAP_JWE_RESPONSE_ALGORITHM,
  JEAP_JWE_RESPONSE_CEK_BYTES,
  JEAP_JWE_RESPONSE_KEY_HEADER,
} from '../crypto/jwe-algorithms';
import { JeapJwePublicJwk } from '../jwks/jwk.model';
import {JWE_TEST_CONFIG_PATH, JWE_TEST_JWKS_PATH} from './jwe-test-fixtures';
import {JeapJweBackendConfigResponse} from "../config/jeap-jwe-client-config";

const PROBLEM_JSON_MEDIA_TYPE = 'application/problem+json';
const OCTET_STREAM_MEDIA_TYPE = 'application/octet-stream';

export class JeapJweTestBackend {
  constructor(private readonly httpMock: HttpTestingController) {}

  expectAndFlushJwks(
    keys: readonly JeapJwePublicJwk[],
    jwksPath: string = JWE_TEST_JWKS_PATH
  ): TestRequest {
    const request = this.expectRequest('GET', jwksPath);

    request.flush({
      keys,
    });

    return request;
  }

  async expectEncryptedRequestAsync(
    method: string,
    path: string
  ): Promise<TestRequest> {
    const request = await this.expectRequestAsync(method, path);

    expect(request.request.headers.get('Accept')).toBe(JEAP_JWE_MEDIA_TYPE);
    expect(request.request.headers.has(JEAP_JWE_RESPONSE_KEY_HEADER)).toBeTrue();

    return request;
  }

  expectEncryptedRequest(method: string, path: string): TestRequest {
    const request = this.expectRequest(method, path);

    expect(request.request.headers.get('Accept')).toBe(JEAP_JWE_MEDIA_TYPE);
    expect(request.request.headers.has(JEAP_JWE_RESPONSE_KEY_HEADER)).toBeTrue();

    return request;
  }

  expectPlainRequest(method: string, path: string): TestRequest {
    const request = this.expectRequest(method, path);

    expect(request.request.headers.has(JEAP_JWE_RESPONSE_KEY_HEADER)).toBeFalse();

    return request;
  }

  expectNoRequest(method: string, path: string): void {
    this.httpMock.expectNone(request =>
      request.method === method && this.matchesPath(request.urlWithParams, path)
    );
  }

  decodeRequestBodyProtectedHeader(
    request: TestRequest
  ): Record<string, unknown> {
    if (typeof request.request.body !== 'string') {
      throw new Error('Expected request body to be a compact JWE string.');
    }

    return decodeProtectedHeader(request.request.body) as Record<
      string,
      unknown
    >;
  }

  decodeResponseKeyProtectedHeader(
    request: TestRequest
  ): Record<string, unknown> {
    const responseKey = request.request.headers.get(
      JEAP_JWE_RESPONSE_KEY_HEADER
    );

    if (!responseKey) {
      throw new Error('Expected JWE-Response-Key header to be present.');
    }

    return decodeProtectedHeader(responseKey) as Record<string, unknown>;
  }

  async decryptJsonRequestBody(
    request: TestRequest,
    privateKey: CryptoKey
  ): Promise<unknown> {
    if (typeof request.request.body !== 'string') {
      throw new Error('Expected request body to be a compact JWE string.');
    }

    const protectedHeader = this.decodeRequestBodyProtectedHeader(request);

    expect(protectedHeader['alg']).toBe(JEAP_JWE_REQUEST_ALGORITHM);
    expect(protectedHeader['enc']).toBe(JEAP_JWE_CONTENT_ENCRYPTION);

    const decrypted = await compactDecrypt(request.request.body, privateKey);
    const plaintext = new TextDecoder().decode(decrypted.plaintext);

    return JSON.parse(plaintext);
  }

  async decryptResponseKey(
    request: TestRequest,
    privateKey: CryptoKey
  ): Promise<Uint8Array> {
    const responseKey = request.request.headers.get(
      JEAP_JWE_RESPONSE_KEY_HEADER
    );

    if (!responseKey) {
      throw new Error('Expected JWE-Response-Key header to be present.');
    }

    const protectedHeader = this.decodeResponseKeyProtectedHeader(request);

    expect(protectedHeader['alg']).toBe(JEAP_JWE_REQUEST_ALGORITHM);
    expect(protectedHeader['enc']).toBe(JEAP_JWE_CONTENT_ENCRYPTION);
    expect(protectedHeader['cty']).toBe(OCTET_STREAM_MEDIA_TYPE);

    const decrypted = await compactDecrypt(responseKey, privateKey);

    expect(decrypted.plaintext.byteLength).toBe(
      JEAP_JWE_RESPONSE_CEK_BYTES
    );

    return decrypted.plaintext;
  }

  async flushEncryptedJsonResponse(
    request: TestRequest,
    responseContentEncryptionKey: Uint8Array,
    body: unknown,
    contentType: string = 'application/json'
  ): Promise<void> {
    const compactJwe = await this.encryptJsonResponse(
      body,
      responseContentEncryptionKey,
      contentType
    );

    request.flush(compactJwe, {
      status: 200,
      statusText: 'OK',
      headers: new HttpHeaders({
        'Content-Type': JEAP_JWE_MEDIA_TYPE,
      }),
    });
  }

  flushUnknownKid(request: TestRequest): void {
    request.flush(
      JSON.stringify({
        type: 'https://dazit.ch/problems/jwe/unknown-kid',
        title: 'Unknown JWE key identifier',
        status: 400,
        detail:
          'The JWE key identifier is unknown or no longer accepted by this service.',
        code: 'JWE_UNKNOWN_KID',
      }),
      {
        status: 400,
        statusText: 'Bad Request',
        headers: new HttpHeaders({
          'Content-Type': PROBLEM_JSON_MEDIA_TYPE,
        }),
      }
    );
  }

  private async encryptJsonResponse(
    body: unknown,
    responseContentEncryptionKey: Uint8Array,
    contentType: string
  ): Promise<string> {
    const plaintext = new TextEncoder().encode(JSON.stringify(body));

    return new CompactEncrypt(plaintext)
      .setProtectedHeader({
        alg: JEAP_JWE_RESPONSE_ALGORITHM,
        enc: JEAP_JWE_CONTENT_ENCRYPTION,
        cty: contentType,
      })
      .encrypt(responseContentEncryptionKey);
  }

  private expectRequest(method: string, path: string): TestRequest {
    return this.httpMock.expectOne(request => {
      return (
        request.method === method &&
        this.matchesPath(request.urlWithParams, path)
      );
    });
  }

  private matchesPath(url: string, expectedPath: string): boolean {
    return new URL(url, globalThis.location.origin).pathname === expectedPath;
  }


  expectAndFlushBackendConfig(
    config: JeapJweBackendConfigResponse,
    configPath: string = JWE_TEST_CONFIG_PATH
  ): TestRequest {
    const request = this.expectRequest('GET', configPath);

    request.flush(config);

    return request;
  }



  private async expectRequestAsync(
    method: string,
    path: string
  ): Promise<TestRequest> {
    let lastError: unknown;

    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        return this.expectRequest(method, path);
      } catch (error) {
        lastError = error;
        await this.waitForAsyncTurn();
      }
    }

    throw lastError;
  }

  private async waitForAsyncTurn(): Promise<void> {
    await Promise.resolve();

    await new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    });
  }
}
