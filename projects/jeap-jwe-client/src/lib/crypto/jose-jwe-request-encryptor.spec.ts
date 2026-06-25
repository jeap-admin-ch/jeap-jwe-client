import { HttpHeaders, HttpRequest } from '@angular/common/http';
import {
  compactDecrypt,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
} from 'jose';
import { firstValueFrom, of } from 'rxjs';

import {
  JeapJweEndpointMatch,
  JeapJweResolvedClientConfig,
} from '../config/jeap-jwe-client-config';
import { JeapJweError } from '../error/jeap-jwe-error';
import { JeapJwePublicJwk } from '../jwks/jwk.model';
import { JweKeySelector } from '../jwks/jwe-key-selector';
import {
  JEAP_JWE_CONTENT_ENCRYPTION,
  JEAP_JWE_MEDIA_TYPE,
  JEAP_JWE_REQUEST_ALGORITHM,
  JEAP_JWE_RESPONSE_CEK_BYTES,
  JEAP_JWE_RESPONSE_KEY_HEADER,
} from './jwe-algorithms';
import { JoseJweRequestEncryptor } from './jose-jwe-request-encryptor';
import { JweRequestEncryptor } from './jwe-request-encryptor';

describe('JoseJweRequestEncryptor', () => {
  let encryptor: JweRequestEncryptor;
  let keySelector: jasmine.SpyObj<JweKeySelector>;

  const config: JeapJweResolvedClientConfig = {
    origin: 'https://api.example.ch',
    loadBackendConfig: false,
    jwksUri: '/.well-known/jwks.json',
    refreshIntervalSeconds: 300,
    exclude: [],
  };

  const match: JeapJweEndpointMatch = {
    method: 'POST',
    url: 'https://api.example.ch/api/persons',
    origin: 'https://api.example.ch',
    path: '/api/persons',
    config,
  };

  beforeEach(() => {
    keySelector = jasmine.createSpyObj<JweKeySelector>('JweKeySelector', [
      'selectCurrentKey',
    ]);

    encryptor = new JoseJweRequestEncryptor(keySelector);
  });

  async function createTestKey(kid: string): Promise<{
    publicJwk: JeapJwePublicJwk;
    privateKey: CryptoKey;
  }> {
    /**
     * A 2048-bit test key keeps browser tests reasonably fast.
     * The backend independently enforces its 4096-bit production policy.
     */
    const { publicKey, privateKey } = await generateKeyPair(
      JEAP_JWE_REQUEST_ALGORITHM,
      {
        modulusLength: 2048,
      }
    );

    const exportedPublicJwk = await exportJWK(publicKey);

    return {
      publicJwk: {
        kty: 'RSA',
        kid,
        use: 'enc',
        alg: JEAP_JWE_REQUEST_ALGORITHM,
        n: exportedPublicJwk.n!,
        e: exportedPublicJwk.e!,
      },
      privateKey: privateKey as CryptoKey,
    };
  }

  it('encrypts a JSON request body and adds JWE-Response-Key', async () => {
    const { publicJwk, privateKey } = await createTestKey(
      'transit-request-key:7'
    );

    keySelector.selectCurrentKey.and.returnValue(of(publicJwk));

    const originalPayload = {
      name: 'Alice',
      address: {
        city: 'Bern',
      },
    };

    const request = new HttpRequest(
      'POST',
      'https://api.example.ch/api/persons',
      originalPayload
    );

    const encrypted = await firstValueFrom(encryptor.encrypt(request, match));

    expect(encrypted.request.method).toBe('POST');
    expect(encrypted.request.headers.get('Content-Type')).toBe(
      JEAP_JWE_MEDIA_TYPE
    );
    expect(encrypted.request.responseType).toBe('text');
    expect(typeof encrypted.request.body).toBe('string');

    const compactRequestJwe = encrypted.request.body as string;

    /**
     * Compact JWE uses five dot-separated base64url segments.
     */
    expect(compactRequestJwe.split('.')).toHaveSize(5);

    const requestProtectedHeader = decodeProtectedHeader(compactRequestJwe);

    expect(requestProtectedHeader).toEqual(
      jasmine.objectContaining({
        alg: JEAP_JWE_REQUEST_ALGORITHM,
        enc: JEAP_JWE_CONTENT_ENCRYPTION,
        kid: 'transit-request-key:7',
        cty: 'application/json',
      })
    );

    /**
     * Decryption with the private test key proves that the original payload
     * was encrypted as JSON and can be recovered without data loss.
     */
    const decryptedRequest = await compactDecrypt(
      compactRequestJwe,
      privateKey
    );

    const requestPlaintext = new TextDecoder().decode(
      decryptedRequest.plaintext
    );

    expect(JSON.parse(requestPlaintext)).toEqual(originalPayload);

    const encryptedResponseKey = encrypted.request.headers.get(
      JEAP_JWE_RESPONSE_KEY_HEADER
    );

    expect(encryptedResponseKey).toBeTruthy();
    expect(encryptedResponseKey!.split('.')).toHaveSize(5);

    const responseKeyProtectedHeader = decodeProtectedHeader(
      encryptedResponseKey!
    );

    expect(responseKeyProtectedHeader).toEqual(
      jasmine.objectContaining({
        alg: JEAP_JWE_REQUEST_ALGORITHM,
        enc: JEAP_JWE_CONTENT_ENCRYPTION,
        kid: 'transit-request-key:7',
        cty: 'application/octet-stream',
      })
    );

    /**
     * The encrypted header must contain exactly the request-local CEK that
     * will later be used by the response decryptor.
     */
    const decryptedResponseKey = await compactDecrypt(
      encryptedResponseKey!,
      privateKey
    );

    expect(Array.from(decryptedResponseKey.plaintext)).toEqual(
      Array.from(encrypted.context.responseContentEncryptionKey)
    );

    expect(encrypted.context.responseContentEncryptionKey.byteLength).toBe(
      JEAP_JWE_RESPONSE_CEK_BYTES
    );

    expect(encrypted.context.originalRequestContentType).toBe(
      'application/json'
    );
    expect(encrypted.context.originalResponseType).toBe('json');

    expect(keySelector.selectCurrentKey).toHaveBeenCalledTimes(1);
  });

  it('preserves an explicitly declared JSON media type in cty', async () => {
    const { publicJwk } = await createTestKey('transit-request-key:8');

    keySelector.selectCurrentKey.and.returnValue(of(publicJwk));

    const request = new HttpRequest(
      'POST',
      'https://api.example.ch/api/problem',
      {
        title: 'Validation failed',
      },
      {
        headers: new HttpHeaders({
          'Content-Type': 'application/problem+json; charset=utf-8',
        }),
      }
    );

    const encrypted = await firstValueFrom(
      encryptor.encrypt(request, {
        ...match,
        path: '/api/problem',
      })
    );

    const requestProtectedHeader = decodeProtectedHeader(
      encrypted.request.body as string
    );

    expect(requestProtectedHeader.cty).toBe(
      'application/problem+json; charset=utf-8'
    );

    expect(encrypted.request.headers.get('Content-Type')).toBe(
      JEAP_JWE_MEDIA_TYPE
    );

    expect(
      encrypted.request.headers.get(JEAP_JWE_RESPONSE_KEY_HEADER)
    ).toBeTruthy();

    expect(keySelector.selectCurrentKey).toHaveBeenCalledTimes(1);
  });

  it('sets JWE-Response-Key for a bodyless GET request', async () => {
    const { publicJwk, privateKey } = await createTestKey(
      'transit-request-key:9'
    );

    keySelector.selectCurrentKey.and.returnValue(of(publicJwk));

    const request = new HttpRequest(
      'GET',
      'https://api.example.ch/api/persons/123'
    );

    const encrypted = await firstValueFrom(
      encryptor.encrypt(request, {
        ...match,
        method: 'GET',
        url: 'https://api.example.ch/api/persons/123',
        path: '/api/persons/123',
      })
    );

    expect(encrypted.request.method).toBe('GET');
    expect(encrypted.request.body).toBeNull();

    /**
     * A bodyless request does not become an encrypted request body.
     */
    expect(encrypted.request.headers.has('Content-Type')).toBeFalse();

    /**
     * The response is a compact JWE string on the transport layer.
     */
    expect(encrypted.request.responseType).toBe('text');

    const encryptedResponseKey = encrypted.request.headers.get(
      JEAP_JWE_RESPONSE_KEY_HEADER
    );

    expect(encryptedResponseKey).toBeTruthy();
    expect(encryptedResponseKey!.split('.')).toHaveSize(5);

    const decryptedResponseKey = await compactDecrypt(
      encryptedResponseKey!,
      privateKey
    );

    expect(Array.from(decryptedResponseKey.plaintext)).toEqual(
      Array.from(encrypted.context.responseContentEncryptionKey)
    );

    expect(encrypted.context.responseContentEncryptionKey.byteLength).toBe(
      JEAP_JWE_RESPONSE_CEK_BYTES
    );

    expect(encrypted.context.originalRequestContentType).toBeUndefined();
    expect(encrypted.context.originalResponseType).toBe('json');

    expect(keySelector.selectCurrentKey).toHaveBeenCalledTimes(1);
  });

  it('returns a typed error for an unsupported request media type', async () => {
    const request = new HttpRequest(
      'POST',
      'https://api.example.ch/api/import',
      'raw-csv-content',
      {
        headers: new HttpHeaders({
          'Content-Type': 'text/csv',
        }),
      }
    );

    let actualError: unknown;

    await firstValueFrom(
      encryptor.encrypt(request, {
        ...match,
        path: '/api/import',
      })
    ).catch(error => {
      actualError = error;
    });

    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_UNSUPPORTED_MEDIA_TYPE',
      })
    );

    expect(actualError instanceof JeapJweError).toBeTrue();

    /**
     * Invalid request media types must fail before JWKS access.
     */
    expect(keySelector.selectCurrentKey).not.toHaveBeenCalled();
  });

  it('returns a typed error when the selected key has an unsupported algorithm', async () => {
    const invalidKey = {
      kty: 'RSA',
      kid: 'transit-request-key:invalid',
      use: 'enc',
      alg: 'RSA1_5',
      n: 'invalid-modulus',
      e: 'AQAB',
    } as unknown as JeapJwePublicJwk;

    keySelector.selectCurrentKey.and.returnValue(of(invalidKey));

    const request = new HttpRequest(
      'POST',
      'https://api.example.ch/api/persons',
      {
        name: 'Alice',
      }
    );

    let actualError: unknown;

    await firstValueFrom(encryptor.encrypt(request, match)).catch(error => {
      actualError = error;
    });

    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_UNSUPPORTED_ALGORITHM',
      })
    );

    expect(actualError instanceof JeapJweError).toBeTrue();
    expect(keySelector.selectCurrentKey).toHaveBeenCalledTimes(1);
  });
});
