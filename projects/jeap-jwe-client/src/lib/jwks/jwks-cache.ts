import { Injectable } from '@angular/core';
import {
  finalize,
  Observable,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';

import { JeapJweClientConfigService } from '../config/jeap-jwe-client-config.service';
import { JeapJwksSnapshot } from './jwk.model';
import { JwksClient } from './jwks-client';

@Injectable()
export class JwksCache {
  private snapshot?: JeapJwksSnapshot;
  private activeLoad$?: Observable<JeapJwksSnapshot>;

  constructor(
    private readonly configService: JeapJweClientConfigService,
    private readonly jwksClient: JwksClient
  ) {}

  /**
   * Returns the current in-memory snapshot without triggering network I/O.
   */
  getSnapshot(): JeapJwksSnapshot | undefined {
    return this.snapshot;
  }

  /**
   * Returns the cached snapshot or loads it once when no snapshot exists yet.
   */
  getOrLoad(): Observable<JeapJwksSnapshot> {
    if (this.snapshot) {
      return of(this.snapshot);
    }

    return this.loadAndReplace();
  }

  /**
   * Forces a new JWKS retrieval.
   *
   * The previous snapshot remains active until the new response has been
   * successfully retrieved and validated.
   */
  refresh(): Observable<JeapJwksSnapshot> {
    return this.loadAndReplace();
  }

  /**
   * Clears the in-memory snapshot.
   *
   * This method is useful for controlled test setup and explicit lifecycle
   * management. It must not be used to persist or export key material.
   */
  clear(): void {
    this.snapshot = undefined;
  }

  private loadAndReplace(): Observable<JeapJwksSnapshot> {
    if (this.activeLoad$) {
      return this.activeLoad$;
    }

    const load$ = this.configService.getConfig().pipe(
      switchMap(config => this.jwksClient.fetch(config)),
      tap(nextSnapshot => {
        /**
         * Assignment occurs only after the complete JWKS has passed validation.
         * The cache therefore never exposes a partially refreshed key set.
         */
        this.snapshot = nextSnapshot;
      }),
      finalize(() => {
        this.activeLoad$ = undefined;
      }),
      shareReplay({
        bufferSize: 1,
        refCount: false,
      })
    );

    this.activeLoad$ = load$;

    return load$;
  }
}
