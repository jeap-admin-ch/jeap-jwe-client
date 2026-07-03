import {
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import {
  catchError,
  concatMap,
  Observable,
  of,
  switchMap,
  throwError,
} from 'rxjs';

import { JeapJweEndpointMatch } from '../config/jeap-jwe-client-config';
import { JeapJweClientConfigService } from '../config/jeap-jwe-client-config.service';
import { JweRequestEncryptor } from '../crypto/jwe-request-encryptor';
import { JweResponseDecryptor } from '../crypto/jwe-response-decryptor';
import { mapBackendJweError } from '../error/jwe-backend-error-mapper';
import { JweKeySelector } from '../jwks/jwe-key-selector';
import { JweEndpointMatcher } from '../matcher/jwe-endpoint-matcher';

export const jeapJweInterceptor: HttpInterceptorFn = (request, next) => {
  const configService = inject(JeapJweClientConfigService);
  const endpointMatcher = inject(JweEndpointMatcher);
  const requestEncryptor = inject(JweRequestEncryptor);
  const responseDecryptor = inject(JweResponseDecryptor);
  const keySelector = inject(JweKeySelector);

  /**
   * Only decisions that cannot change once the backend configuration arrives
   * are made against the local configuration: a disabled client, a request to
   * another origin, and exclude patterns (local excludes are always part of
   * the effective exclude list, and the default excludes mirror the backend's
   * built-in excludes for its discovery and health endpoints).
   *
   * Include decisions are deliberately NOT made locally: the backend-published
   * include patterns are authoritative and may be broader than the local
   * defaults - most notably when the backend runs under a servlet context
   * path and publishes context-path-prefixed patterns. Deciding includes
   * locally would silently send such requests in plaintext.
   */
  const localConfig = configService.getLocalConfigSnapshot();

  if (localConfig.enabled === false) {
    return next(request);
  }

  if (!endpointMatcher.isRequestToConfiguredOrigin(request, localConfig)) {
    return next(request);
  }

  if (endpointMatcher.isRequestExcluded(request, localConfig)) {
    return next(request);
  }

  /**
   * Every other request to the backend origin waits for the (cached, shared)
   * backend configuration and is then matched against the effective include
   * and exclude patterns. If the configuration cannot be loaded, the request
   * fails with JWE_CONFIG_LOAD_FAILED instead of being sent unprotected: a
   * payload the backend may consider protected must never leave the browser
   * in plaintext (fail closed).
   */
  return configService.getConfig().pipe(
    switchMap(config => {
      const effectiveMatch = endpointMatcher.match(request, config);

      if (!effectiveMatch) {
        return next(request);
      }

      return sendProtectedRequestWithOneRetry(
        request,
        effectiveMatch,
        next,
        requestEncryptor,
        responseDecryptor,
        keySelector
      );
    })
  );
};

function sendProtectedRequestWithOneRetry(
  originalRequest: HttpRequest<unknown>,
  match: JeapJweEndpointMatch,
  next: HttpHandlerFn,
  requestEncryptor: JweRequestEncryptor,
  responseDecryptor: JweResponseDecryptor,
  keySelector: JweKeySelector
): Observable<HttpEvent<unknown>> {
  return sendProtectedRequest(
    originalRequest,
    match,
    next,
    requestEncryptor,
    responseDecryptor
  ).pipe(
    catchError(initialError => {
      const mappedError = mapBackendJweError(initialError);

      /**
       * Only an unknown or rotated key triggers a retry. The backend rejects
       * an unknown key identifier while decrypting the request, before any
       * controller or side-effecting logic runs, so re-sending the original
       * request once is safe for any HTTP method.
       *
       * A refresh replaces the cached JWKS only after a valid response is
       * available. The retry creates a fresh request JWE and response CEK.
       */
      if (mappedError?.retryable) {
        return keySelector.refresh().pipe(
          switchMap(() =>
            sendProtectedRequest(
              originalRequest,
              match,
              next,
              requestEncryptor,
              responseDecryptor
            )
          ),
          catchError(retryError => {
            /**
             * A second failure becomes a typed error. No third request is sent.
             */
            return throwError(
              () => mapBackendJweError(retryError) ?? retryError
            );
          })
        );
      }

      /**
       * Recognized backend protocol errors are surfaced as typed errors;
       * everything else (ordinary HTTP, business, or client-side errors) is
       * rethrown unchanged.
       */
      return throwError(() => mappedError ?? initialError);
    })
  );
}

function sendProtectedRequest(
  originalRequest: HttpRequest<unknown>,
  match: JeapJweEndpointMatch,
  next: HttpHandlerFn,
  requestEncryptor: JweRequestEncryptor,
  responseDecryptor: JweResponseDecryptor
): Observable<HttpEvent<unknown>> {
  return requestEncryptor.encrypt(originalRequest, match).pipe(
    switchMap(({ request, context }) =>
      next(request).pipe(
        /**
         * concatMap preserves event order. Only the terminal HttpResponse is
         * decrypted; intermediate events (such as upload progress) pass through.
         */
        concatMap((event: HttpEvent<unknown>) => {
          if (event instanceof HttpResponse) {
            return responseDecryptor.decrypt(event, context);
          }

          return of(event);
        })
      )
    )
  );
}
