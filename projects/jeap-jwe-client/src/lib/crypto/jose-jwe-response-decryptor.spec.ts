import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { CompactEncrypt } from 'jose';
import { firstValueFrom } from 'rxjs';

import {
  JeapJweEndpointMatch,
  JeapJweResolvedClientConfig,
} from '../config/jeap-jwe-client-config';
import { JeapJweError } from '../error/jeap-jwe-error';
import {
  JEAP_JWE_CONTENT_ENCRYPTION,
  JEAP_JWE_MEDIA_TYPE,
  JEAP_JWE_RESPONSE_ALGORITHM,
} from './jwe-algorithms';
import { JoseJweResponseDecryptor } from './jose-jwe-response-decryptor';
import { JeapJweRequestContext } from './jwe-request-encryptor';

describe('JoseJweResponseDecryptor', () => {
  const decryptor = new JoseJweResponseDecryptor();

  const config: JeapJweResolvedClientConfig = {
    origin: 'https://api.example.ch',
    loadBackendConfig: false,
    jwksUri: '/.well-known/jwks.json',
    refreshIntervalSeconds: 300,
    exclude: [],
  };

  const match: JeapJweEndpointMatch = {
    method: 'GET',
    url: 'https://api.example.ch/api/persons/123',
    origin: 'https://api.example.ch',
    path: '/api/persons/123',
    config,
  };

  function createContext(
    responseContentEncryptionKey: Uint8Array,
    originalResponseType: 'arraybuffer' | 'blob' | 'json' | 'text' = 'json'
  ): JeapJweRequestContext {
    return {
      method: 'GET',
      url: 'https://api.example.ch/api/persons/123',
      path: '/api/persons/123',
      match,
      originalResponseType,
      responseContentEncryptionKey,
    };
  }

  function createResponseCek(): Uint8Array {
    const responseCek = new Uint8Array(32);
    crypto.getRandomValues(responseCek);
    return responseCek;
  }

  async function encryptResponse(
    plaintext: string,
    responseCek: Uint8Array,
    contentType: string
  ): Promise<string> {
    return new CompactEncrypt(new TextEncoder().encode(plaintext))
      .setProtectedHeader({
        alg: JEAP_JWE_RESPONSE_ALGORITHM,
        enc: JEAP_JWE_CONTENT_ENCRYPTION,
        cty: contentType,
      })
      .encrypt(responseCek);
  }

  it('decrypts an application/jose JSON response with the request-local CEK', async () => {
    const responseCek = createResponseCek();

    const originalBody = {
      id: 123,
      name: 'Alice',
    };

    const compactJwe = await encryptResponse(
      JSON.stringify(originalBody),
      responseCek,
      'application/json'
    );

    const encryptedResponse = new HttpResponse({
      status: 200,
      body: compactJwe,
      headers: new HttpHeaders({
        'Content-Type': JEAP_JWE_MEDIA_TYPE,
      }),
    });

    const decryptedResponse = await firstValueFrom(
      decryptor.decrypt(encryptedResponse, createContext(responseCek))
    );

    expect(decryptedResponse.status).toBe(200);
    expect(decryptedResponse.body).toEqual(originalBody);
    expect(decryptedResponse.headers.get('Content-Type')).toBe(
      'application/json'
    );
  });

  it('uses cty to restore application problem JSON responses', async () => {
    const responseCek = createResponseCek();

    const originalBody = {
      title: 'Validation failed',
      status: 400,
    };

    const compactJwe = await encryptResponse(
      JSON.stringify(originalBody),
      responseCek,
      'application/problem+json; charset=utf-8'
    );

    const encryptedResponse = new HttpResponse({
      status: 400,
      body: compactJwe,
      headers: new HttpHeaders({
        'Content-Type': 'application/jose; charset=utf-8',
      }),
    });

    const decryptedResponse = await firstValueFrom(
      decryptor.decrypt(encryptedResponse, createContext(responseCek))
    );

    expect(decryptedResponse.body).toEqual(originalBody);
    expect(decryptedResponse.headers.get('Content-Type')).toBe(
      'application/problem+json; charset=utf-8'
    );
  });

  it('uses cty to restore a text response', async () => {
    const responseCek = createResponseCek();

    const compactJwe = await encryptResponse(
      'Service is available',
      responseCek,
      'text/plain; charset=utf-8'
    );

    const encryptedResponse = new HttpResponse({
      status: 200,
      body: compactJwe,
      headers: new HttpHeaders({
        'Content-Type': JEAP_JWE_MEDIA_TYPE,
      }),
    });

    const decryptedResponse = await firstValueFrom(
      decryptor.decrypt(encryptedResponse, createContext(responseCek, 'text'))
    );

    expect(decryptedResponse.body).toBe('Service is available');
    expect(decryptedResponse.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8'
    );
  });

  it('leaves plaintext responses unchanged', async () => {
    const responseCek = createResponseCek();

    const plaintextResponse = new HttpResponse({
      status: 200,
      body: {
        status: 'ok',
      },
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
      }),
    });

    const result = await firstValueFrom(
      decryptor.decrypt(plaintextResponse, createContext(responseCek))
    );

    expect(result).toBe(plaintextResponse);
    expect(result.body).toEqual({
      status: 'ok',
    });
    expect(result.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns a typed error when the request-local CEK is wrong', async () => {
    const encryptionCek = createResponseCek();
    const wrongDecryptionCek = createResponseCek();

    const compactJwe = await encryptResponse(
      JSON.stringify({
        id: 123,
      }),
      encryptionCek,
      'application/json'
    );

    const encryptedResponse = new HttpResponse({
      status: 200,
      body: compactJwe,
      headers: new HttpHeaders({
        'Content-Type': JEAP_JWE_MEDIA_TYPE,
      }),
    });

    let actualError: unknown;

    await firstValueFrom(
      decryptor.decrypt(encryptedResponse, createContext(wrongDecryptionCek))
    ).catch(error => {
      actualError = error;
    });

    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_DECRYPTION_FAILED',
      })
    );

    expect(actualError instanceof JeapJweError).toBeTrue();
  });

  it('returns a typed error when the JWE algorithms are unsupported', async () => {
    /**
     * A128GCM requires a 128-bit CEK.
     */
    const responseCek = new Uint8Array(16);
    crypto.getRandomValues(responseCek);

    const compactJwe = await new CompactEncrypt(
      new TextEncoder().encode(JSON.stringify({ id: 123 }))
    )
      .setProtectedHeader({
        alg: 'dir',
        enc: 'A128GCM',
        cty: 'application/json',
      })
      .encrypt(responseCek);

    const encryptedResponse = new HttpResponse({
      status: 200,
      body: compactJwe,
      headers: new HttpHeaders({
        'Content-Type': JEAP_JWE_MEDIA_TYPE,
      }),
    });

    let actualError: unknown;

    await firstValueFrom(
      decryptor.decrypt(encryptedResponse, createContext(responseCek))
    ).catch(error => {
      actualError = error;
    });

    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_UNSUPPORTED_ALGORITHM',
      })
    );

    expect(actualError instanceof JeapJweError).toBeTrue();
  });

  it('returns a typed error when application/jose does not contain a compact JWE string', async () => {
    const responseCek = createResponseCek();

    const malformedResponse = new HttpResponse({
      status: 200,
      body: {
        unexpected: 'object body',
      },
      headers: new HttpHeaders({
        'Content-Type': JEAP_JWE_MEDIA_TYPE,
      }),
    });

    let actualError: unknown;

    await firstValueFrom(
      decryptor.decrypt(malformedResponse, createContext(responseCek))
    ).catch(error => {
      actualError = error;
    });

    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_MALFORMED',
      })
    );

    expect(actualError instanceof JeapJweError).toBeTrue();
  });
});
