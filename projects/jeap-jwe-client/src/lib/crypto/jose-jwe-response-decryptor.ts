import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { compactDecrypt, decodeProtectedHeader } from 'jose';
import { from, Observable } from 'rxjs';

import { JeapJweError } from '../error/jeap-jwe-error';
import {
  JEAP_JWE_CONTENT_ENCRYPTION,
  JEAP_JWE_MEDIA_TYPE,
  JEAP_JWE_RESPONSE_ALGORITHM,
} from './jwe-algorithms';
import { baseMediaType, isJsonMediaType } from './media-type';
import { JeapJweRequestContext } from './jwe-request-encryptor';
import { JweResponseDecryptor } from './jwe-response-decryptor';

@Injectable()
export class JoseJweResponseDecryptor extends JweResponseDecryptor {
  override decrypt(
    response: HttpResponse<unknown>,
    context: JeapJweRequestContext
  ): Observable<HttpResponse<unknown>> {
    /**
     * Only compact JWE responses are decrypted.
     *
     * Plaintext responses remain untouched. Excluded endpoints never reach
     * this decryptor because the interceptor forwards them unchanged.
     */
    if (!this.isJoseMediaType(response.headers.get('Content-Type'))) {
      return from(Promise.resolve(response));
    }

    return from(this.decryptJoseResponse(response, context));
  }

  private async decryptJoseResponse(
    response: HttpResponse<unknown>,
    context: JeapJweRequestContext
  ): Promise<HttpResponse<unknown>> {
    if (typeof response.body !== 'string') {
      throw new JeapJweError(
        'JWE_MALFORMED',
        'Expected an application/jose response body to be a compact JWE string.'
      );
    }

    try {
      const compactJwe = response.body;
      const protectedHeader = decodeProtectedHeader(compactJwe);

      this.assertSupportedResponseAlgorithms(protectedHeader);

      const decrypted = await compactDecrypt(
        compactJwe,
        context.responseContentEncryptionKey
      );

      const contentType = this.resolveOriginalContentType(protectedHeader);
      const plaintext = new TextDecoder().decode(decrypted.plaintext);
      const body = this.deserializeBody(
        plaintext,
        contentType,
        context.originalResponseType
      );

      return response.clone({
        body,
        headers: this.restoreContentType(response.headers, contentType),
      });
    } catch (cause) {
      if (cause instanceof JeapJweError) {
        throw cause;
      }

      /**
       * Includes authentication failures caused by a wrong request-local CEK.
       * Neither the CEK nor the encrypted response body is logged.
       */
      throw new JeapJweError(
        'JWE_DECRYPTION_FAILED',
        'Failed to decrypt the protected JWE response.',
        false,
        cause
      );
    }
  }

  private assertSupportedResponseAlgorithms(
    protectedHeader: Record<string, unknown>
  ): void {
    if (
      protectedHeader['alg'] !== JEAP_JWE_RESPONSE_ALGORITHM ||
      protectedHeader['enc'] !== JEAP_JWE_CONTENT_ENCRYPTION
    ) {
      throw new JeapJweError(
        'JWE_UNSUPPORTED_ALGORITHM',
        'The encrypted response does not use alg "dir" and enc "A256GCM".'
      );
    }
  }

  private resolveOriginalContentType(
    protectedHeader: Record<string, unknown>
  ): string {
    const contentType = protectedHeader['cty'];

    if (typeof contentType === 'string' && contentType.trim()) {
      return contentType;
    }

    return 'application/json';
  }

  private deserializeBody(
    plaintext: string,
    contentType: string,
    originalResponseType: 'arraybuffer' | 'blob' | 'json' | 'text'
  ): unknown {
    if (originalResponseType === 'text') {
      return plaintext;
    }

    if (isJsonMediaType(contentType)) {
      try {
        return plaintext.length === 0 ? null : JSON.parse(plaintext);
      } catch (cause) {
        throw new JeapJweError(
          'JWE_MALFORMED',
          'The decrypted JSON response payload is invalid.',
          false,
          cause
        );
      }
    }

    /**
     * Binary response types are deliberately not supported in this step.
     * The current contract covers JSON and text response payloads.
     */
    if (
      originalResponseType === 'arraybuffer' ||
      originalResponseType === 'blob'
    ) {
      throw new JeapJweError(
        'JWE_UNSUPPORTED_MEDIA_TYPE',
        `Cannot restore encrypted responses requested as "${originalResponseType}".`
      );
    }

    return plaintext;
  }

  private restoreContentType(
    headers: HttpHeaders,
    originalContentType: string
  ): HttpHeaders {
    return headers.set('Content-Type', originalContentType);
  }

  private isJoseMediaType(contentType: string | null): boolean {
    if (!contentType) {
      return false;
    }

    return baseMediaType(contentType) === JEAP_JWE_MEDIA_TYPE;
  }
}
