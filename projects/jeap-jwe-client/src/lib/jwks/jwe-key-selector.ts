import { Injectable } from '@angular/core';
import { Observable, of, switchMap, tap, throwError } from 'rxjs';

import { JeapJweError } from '../error/jeap-jwe-error';
import { JeapJwePublicJwk, JeapJwksSnapshot } from './jwk.model';
import { JwksCache } from './jwks-cache';
import { JwksRefreshService } from './jwks-refresh.service';

@Injectable()
export class JweKeySelector {
  constructor(
    private readonly jwksCache: JwksCache,
    private readonly jwksRefreshService: JwksRefreshService
  ) {}

  /**
   * Returns the backend-defined current encryption key.
   *
   * The backend JWKS order is preserved. keys[0] is the newest active key
   * and is used for newly encrypted requests.
   */
  selectCurrentKey(): Observable<JeapJwePublicJwk> {
    return this.jwksCache.getOrLoad().pipe(
      tap(snapshot => this.startRefreshSchedule(snapshot)),
      switchMap(snapshot => {
        const currentKey = snapshot.keys[0];

        if (!currentKey) {
          return throwError(
            () =>
              new JeapJweError(
                'JWE_JWKS_INVALID',
                'The backend JWKS snapshot does not contain an active key.'
              )
          );
        }

        return of(currentKey);
      })
    );
  }

  /**
   * Forces a JWKS refresh.
   *
   * The stale-key retry path calls this before re-encrypting with the
   * refreshed current key.
   */
  refresh(): Observable<JeapJwksSnapshot> {
    return this.jwksCache
      .refresh()
      .pipe(tap(snapshot => this.startRefreshSchedule(snapshot)));
  }

  private startRefreshSchedule(snapshot: JeapJwksSnapshot): void {
    this.jwksRefreshService.ensureStarted(snapshot.refreshIntervalSeconds);
  }
}
