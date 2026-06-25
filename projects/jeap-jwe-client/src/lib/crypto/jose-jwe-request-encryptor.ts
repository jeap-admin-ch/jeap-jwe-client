import { HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { CompactEncrypt, importJWK } from 'jose';
import { defer, from, Observable, switchMap } from 'rxjs';

import { JeapJweEndpointMatch } from '../config/jeap-jwe-client-config';
import { JeapJweError } from '../error/jeap-jwe-error';
import { JeapJwePublicJwk } from '../jwks/jwk.model';
import { JweKeySelector } from '../jwks/jwe-key-selector';
import {
  JEAP_JWE_CONTENT_ENCRYPTION,
  JEAP_JWE_MEDIA_TYPE,
  JEAP_JWE_REQUEST_ALGORITHM,
  JEAP_JWE_RESPONSE_CEK_BYTES,
} from './jwe-algorithms';
import { isAllowedContentType } from './media-type';
import {
  JeapJweEncryptedRequest,
  JeapJweRequestContext,
  JweRequestEncryptor,
} from './jwe-request-encryptor';

interface SerializedRequestPayload {
  plaintext: Uint8Array;
  originalContentType: string;
}

@Injectable()
export class JoseJweRequestEncryptor extends JweRequestEncryptor {
  constructor(private readonly keySelector: JweKeySelector) {
    super();
  }

  override encrypt(
    request: HttpRequest<unknown>,
    match: JeapJweEndpointMatch
  ): Observable<JeapJweEncryptedRequest> {
    return defer(() => {
      /**
       * Validate and serialize the body before selecting a backend key.
       *
       * Media types outside the backend allowlist must fail without accessing
       * JWKS.
       */
      const requestPayload = this.serializeRequestPayload(
        request,
        match.protocol.contentTypeAllowlist
      );

      return this.keySelector
        .selectCurrentKey()
        .pipe(
          switchMap(key =>
            from(
              this.createProtectedRequest(request, match, key, requestPayload)
            )
          )
        );
    });
  }

  private async createProtectedRequest(
    request: HttpRequest<unknown>,
    match: JeapJweEndpointMatch,
    key: JeapJwePublicJwk,
    requestPayload: SerializedRequestPayload | undefined
  ): Promise<JeapJweEncryptedRequest> {
    this.assertSupportedEncryptionKey(key);

    try {
      const responseCek = this.createResponseContentEncryptionKey();
      const publicKey = await importJWK(key, JEAP_JWE_REQUEST_ALGORITHM);

      const encryptedResponseKey = await this.encryptResponseCek(
        responseCek,
        key,
        publicKey
      );

      const encryptedRequestBody = requestPayload
        ? await this.encryptRequestBody(requestPayload, key, publicKey)
        : undefined;

      const protectedRequest = request.clone({
        body: requestPayload ? encryptedRequestBody : request.body,
        responseType: 'text',
        setHeaders: {
          Accept: JEAP_JWE_MEDIA_TYPE,
          [match.protocol.responseKeyHeader]: encryptedResponseKey,
          ...(requestPayload ? { 'Content-Type': JEAP_JWE_MEDIA_TYPE } : {}),
        },
      });

      return {
        request: protectedRequest,
        context: this.createContext(
          request,
          match,
          responseCek,
          requestPayload?.originalContentType
        ),
      };
    } catch (cause) {
      if (cause instanceof JeapJweError) {
        throw cause;
      }

      throw new JeapJweError(
        'JWE_REQUEST_ENCRYPTION_FAILED',
        'Failed to create the protected JWE request.',
        false,
        cause
      );
    }
  }

  private createResponseContentEncryptionKey(): Uint8Array {
    const cek = new Uint8Array(JEAP_JWE_RESPONSE_CEK_BYTES);
    crypto.getRandomValues(cek);
    return cek;
  }

  private async encryptResponseCek(
    responseCek: Uint8Array,
    key: JeapJwePublicJwk,
    publicKey: CryptoKey | Uint8Array
  ): Promise<string> {
    return new CompactEncrypt(responseCek)
      .setProtectedHeader({
        alg: JEAP_JWE_REQUEST_ALGORITHM,
        enc: JEAP_JWE_CONTENT_ENCRYPTION,
        kid: key.kid,
        cty: 'application/octet-stream',
      })
      .encrypt(publicKey);
  }

  private async encryptRequestBody(
    payload: SerializedRequestPayload,
    key: JeapJwePublicJwk,
    publicKey: CryptoKey | Uint8Array
  ): Promise<string> {
    return new CompactEncrypt(payload.plaintext)
      .setProtectedHeader({
        alg: JEAP_JWE_REQUEST_ALGORITHM,
        enc: JEAP_JWE_CONTENT_ENCRYPTION,
        kid: key.kid,
        cty: payload.originalContentType,
      })
      .encrypt(publicKey);
  }

  private serializeRequestPayload(
    request: HttpRequest<unknown>,
    contentTypeAllowlist: readonly string[]
  ): SerializedRequestPayload | undefined {
    if (request.body === null || request.body === undefined) {
      return undefined;
    }

    const explicitContentType = request.headers.get('Content-Type');
    const originalContentType = explicitContentType ?? 'application/json';

    if (!isAllowedContentType(originalContentType, contentTypeAllowlist)) {
      throw new JeapJweError(
        'JWE_UNSUPPORTED_MEDIA_TYPE',
        `The backend does not accept request bodies with media type "${originalContentType}".`
      );
    }

    try {
      const serializedBody =
        typeof request.body === 'string' && explicitContentType
          ? request.body
          : JSON.stringify(request.body);

      if (serializedBody === undefined) {
        throw new Error('JSON serialization produced no payload.');
      }

      return {
        plaintext: new TextEncoder().encode(serializedBody),
        originalContentType,
      };
    } catch (cause) {
      throw new JeapJweError(
        'JWE_REQUEST_SERIALIZATION_FAILED',
        'Failed to serialize the protected request payload as JSON.',
        false,
        cause
      );
    }
  }

  private createContext(
    request: HttpRequest<unknown>,
    match: JeapJweEndpointMatch,
    responseContentEncryptionKey: Uint8Array,
    originalRequestContentType?: string
  ): JeapJweRequestContext {
    return {
      method: request.method,
      url: request.url,
      path: match.path,
      match,
      originalRequestContentType,
      originalResponseType: request.responseType,
      responseContentEncryptionKey,
    };
  }

  private assertSupportedEncryptionKey(key: JeapJwePublicJwk): void {
    if (
      key.kty !== 'RSA' ||
      key.use !== 'enc' ||
      key.alg !== JEAP_JWE_REQUEST_ALGORITHM
    ) {
      throw new JeapJweError(
        'JWE_UNSUPPORTED_ALGORITHM',
        'The selected JWK does not satisfy the required JWE encryption policy.'
      );
    }
  }
}
