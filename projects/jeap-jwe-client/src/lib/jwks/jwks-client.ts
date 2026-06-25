import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';

import { JeapJweResolvedClientConfig } from '../config/jeap-jwe-client-config';
import {
  isSecureBackendUrl,
  resolveBackendOrigin,
} from '../config/backend-url';
import { JeapJweError } from '../error/jeap-jwe-error';
import { JeapJwePublicJwk, JeapJwksSnapshot } from './jwk.model';

const PRIVATE_RSA_JWK_PARAMETERS = [
  'd',
  'p',
  'q',
  'dp',
  'dq',
  'qi',
  'oth',
] as const;

@Injectable()
export class JwksClient {
  private readonly backendHttp: HttpClient;

  constructor(httpBackend: HttpBackend) {
    /**
     * This HttpClient bypasses all Angular interceptors.
     *
     * JWKS retrieval must never trigger the JWE interceptor recursively.
     */
    this.backendHttp = new HttpClient(httpBackend);
  }

  fetch(
    config: JeapJweResolvedClientConfig
  ): Observable<JeapJwksSnapshot> {
    const jwksUrl = this.resolveJwksUrl(config);

    return this.backendHttp.get<unknown>(jwksUrl).pipe(
      map(document => this.toSnapshot(document, jwksUrl, config)),
      catchError(cause => {
        if (cause instanceof JeapJweError) {
          return throwError(() => cause);
        }

        return throwError(
          () =>
            new JeapJweError(
              'JWE_KEY_RETRIEVAL_FAILED',
              'Failed to retrieve the backend JWKS.',
              true,
              cause
            )
        );
      })
    );
  }

  private toSnapshot(
    document: unknown,
    jwksUrl: string,
    config: JeapJweResolvedClientConfig
  ): JeapJwksSnapshot {
    if (!this.isRecord(document) || !Array.isArray(document['keys'])) {
      throw new JeapJweError(
        'JWE_JWKS_INVALID',
        'The backend JWKS response does not contain a keys array.'
      );
    }

    if (document['keys'].length === 0) {
      throw new JeapJweError(
        'JWE_JWKS_INVALID',
        'The backend JWKS response does not contain an active key.'
      );
    }

    const keys = document['keys'].map((candidate, index) =>
      this.toPublicRsaJwk(candidate, index)
    );

    const keysByKid = new Map<string, JeapJwePublicJwk>();

    for (const key of keys) {
      if (keysByKid.has(key.kid)) {
        throw new JeapJweError(
          'JWE_JWKS_INVALID',
          'The backend JWKS response contains duplicate key identifiers.'
        );
      }

      keysByKid.set(key.kid, key);
    }

    return {
      /**
       * Do not sort the keys. The backend contract defines keys[0]
       * as the newest active encryption key.
       */
      keys: Object.freeze([...keys]),
      keysByKid,
      loadedAt: Date.now(),
      jwksUri: jwksUrl,
      refreshIntervalSeconds: config.refreshIntervalSeconds,
      config,
    };
  }

  private toPublicRsaJwk(
    candidate: unknown,
    index: number
  ): JeapJwePublicJwk {
    if (!this.isRecord(candidate)) {
      throw this.invalidKey(index);
    }

    for (const privateParameter of PRIVATE_RSA_JWK_PARAMETERS) {
      if (privateParameter in candidate) {
        throw new JeapJweError(
          'JWE_JWKS_INVALID',
          'The backend JWKS response contains private key material.'
        );
      }
    }

    if (candidate['kty'] !== 'RSA') {
      throw this.invalidKey(index);
    }

    if (candidate['use'] !== 'enc') {
      throw this.invalidKey(index);
    }

    if (candidate['alg'] !== 'RSA-OAEP-256') {
      throw this.invalidKey(index);
    }

    if (!this.isNonEmptyString(candidate['kid'])) {
      throw this.invalidKey(index);
    }

    if (!this.isNonEmptyString(candidate['n'])) {
      throw this.invalidKey(index);
    }

    if (!this.isNonEmptyString(candidate['e'])) {
      throw this.invalidKey(index);
    }

    return {
      ...candidate,
      kty: 'RSA',
      use: 'enc',
      alg: 'RSA-OAEP-256',
      kid: candidate['kid'],
      n: candidate['n'],
      e: candidate['e'],
    };
  }

  private resolveJwksUrl(config: JeapJweResolvedClientConfig): string {
    const base = resolveBackendOrigin(config.origin);
    const jwksUrl = new URL(config.jwksUri, base);

    if (jwksUrl.origin !== base.origin) {
      throw new JeapJweError(
        'JWE_JWKS_INVALID',
        'The resolved JWKS URL must stay on the configured backend origin.'
      );
    }

    if (!isSecureBackendUrl(jwksUrl)) {
      throw new JeapJweError(
        'JWE_JWKS_INVALID',
        'The JWKS endpoint must be served over HTTPS.'
      );
    }

    return jwksUrl.toString();
  }

  private invalidKey(index: number): JeapJweError {
    return new JeapJweError(
      'JWE_JWKS_INVALID',
      `The backend JWKS response contains an invalid RSA encryption key at index ${index}.`
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
