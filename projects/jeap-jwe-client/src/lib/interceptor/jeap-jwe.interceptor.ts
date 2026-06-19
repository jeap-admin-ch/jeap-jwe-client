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
  mergeMap,
  Observable,
  of,
  switchMap,
  throwError,
} from 'rxjs';

import { JeapJweEndpointMatch } from '../config/jeap-jwe-client-config';
import { JeapJweClientConfigService } from '../config/jeap-jwe-client-config.service';
import { JweRequestEncryptor } from '../crypto/jwe-request-encryptor';
import { JweResponseDecryptor } from '../crypto/jwe-response-decryptor';
import { mapRetryableBackendJweError } from '../error/jwe-backend-error-mapper';
import { JweKeySelector } from '../jwks/jwe-key-selector';
import { JweEndpointMatcher } from '../matcher/jwe-endpoint-matcher';

export const jeapJweInterceptor: HttpInterceptorFn = (request, next) => {
  const configService = inject(JeapJweClientConfigService);
  const endpointMatcher = inject(JweEndpointMatcher);
  const requestEncryptor = inject(JweRequestEncryptor);
  const responseDecryptor = inject(JweResponseDecryptor);
  const keySelector = inject(JweKeySelector);

  /**
   * Local excludes are evaluated before backend configuration loading.
   */
  const localMatch = endpointMatcher.match(
    request,
    configService.getLocalConfigSnapshot()
  );

  if (!localMatch) {
    return next(request);
  }

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
      const retryableError = mapRetryableBackendJweError(initialError);

      if (!retryableError) {
        return throwError(() => initialError);
      }

      /**
       * A refresh replaces the cached JWKS only after a valid response is
       * available. The retry creates a fresh request JWE and response CEK.
       */
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
           * A second stale-key or unknown-kid response becomes a typed error.
           * No third request is sent.
           */
          const mappedRetryError = mapRetryableBackendJweError(retryError);

          return throwError(() => mappedRetryError ?? retryError);
        })
      );
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
        mergeMap((event: HttpEvent<unknown>) => {
          if (event instanceof HttpResponse) {
            return responseDecryptor.decrypt(event, context);
          }

          return of(event);
        })
      )
    )
  );
}
