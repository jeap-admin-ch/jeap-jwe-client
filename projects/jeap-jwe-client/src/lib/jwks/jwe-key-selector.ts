import { Injectable } from '@angular/core';
import {
  map,
  Observable,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

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
      map(snapshot => snapshot.keys[0])
    );
  }

  /**
   * Selects an active key by kid.
   *
   * When a key is missing from the in-memory snapshot, the client forces
   * one JWKS refresh before returning an unknown-kid error.
   */
  selectByKid(kid: string): Observable<JeapJwePublicJwk> {
    if (!kid || kid.trim().length === 0) {
      return throwError(
        () =>
          new JeapJweError(
            'JWE_UNKNOWN_KEY_ID',
            'Cannot select an empty JWE key identifier.'
          )
      );
    }

    const cachedSnapshot = this.jwksCache.getSnapshot();

    if (cachedSnapshot) {
      this.startRefreshSchedule(cachedSnapshot);

      const cachedKey = cachedSnapshot.keysByKid.get(kid);

      if (cachedKey) {
        return of(cachedKey);
      }

      return this.refreshAndSelectByKid(kid);
    }

    return this.jwksCache.getOrLoad().pipe(
      tap(snapshot => this.startRefreshSchedule(snapshot)),
      switchMap(snapshot => {
        const key = snapshot.keysByKid.get(kid);

        if (key) {
          return of(key);
        }

        return this.refreshAndSelectByKid(kid);
      })
    );
  }

  /**
   * Forces a JWKS refresh.
   *
   * Later stale-key handling can call this method before retrying safe,
   * idempotent requests.
   */
  refresh(): Observable<JeapJwksSnapshot> {
    return this.jwksCache.refresh().pipe(
      tap(snapshot => this.startRefreshSchedule(snapshot))
    );
  }

  private refreshAndSelectByKid(kid: string): Observable<JeapJwePublicJwk> {
    return this.refresh().pipe(
      switchMap(snapshot => {
        const refreshedKey = snapshot.keysByKid.get(kid);

        if (refreshedKey) {
          return of(refreshedKey);
        }

        return throwError(
          () =>
            new JeapJweError(
              'JWE_UNKNOWN_KEY_ID',
              'The requested JWE key identifier is not active in the backend JWKS.'
            )
        );
      })
    );
  }

  private startRefreshSchedule(snapshot: JeapJwksSnapshot): void {
    this.jwksRefreshService.ensureStarted(
      snapshot.refreshIntervalSeconds
    );
  }
}
