import { Injectable, OnDestroy } from '@angular/core';
import {
  catchError,
  EMPTY,
  exhaustMap,
  Subscription,
  timer,
} from 'rxjs';

import { JwksCache } from './jwks-cache';

@Injectable()
export class JwksRefreshService implements OnDestroy {
  private refreshSubscription?: Subscription;
  private refreshIntervalMilliseconds?: number;

  constructor(private readonly jwksCache: JwksCache) {}

  /**
   * Starts periodic JWKS refreshes if no matching schedule is active yet.
   */
  ensureStarted(refreshIntervalSeconds: number): void {
    const intervalMilliseconds = this.toMilliseconds(refreshIntervalSeconds);

    if (
      this.refreshSubscription &&
      this.refreshIntervalMilliseconds === intervalMilliseconds
    ) {
      return;
    }

    this.stop();

    this.refreshIntervalMilliseconds = intervalMilliseconds;

    this.refreshSubscription = timer(
      intervalMilliseconds,
      intervalMilliseconds
    )
      .pipe(
        /**
         * exhaustMap prevents overlapping refresh requests when a backend
         * response takes longer than the configured refresh interval.
         */
        exhaustMap(() =>
          this.jwksCache.refresh().pipe(
            /**
             * Keep the existing cache and continue future refresh attempts.
             * No key material or response body is logged here.
             */
            catchError(() => EMPTY)
          )
        )
      )
      .subscribe();
  }

  stop(): void {
    this.refreshSubscription?.unsubscribe();
    this.refreshSubscription = undefined;
    this.refreshIntervalMilliseconds = undefined;
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private toMilliseconds(refreshIntervalSeconds: number): number {
    if (
      !Number.isInteger(refreshIntervalSeconds) ||
      refreshIntervalSeconds <= 0
    ) {
      throw new Error(
        'JWE refreshIntervalSeconds must be a positive integer.'
      );
    }

    return refreshIntervalSeconds * 1_000;
  }
}
