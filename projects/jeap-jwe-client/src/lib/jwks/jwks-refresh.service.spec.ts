import { NgZone } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { JeapJwksSnapshot } from './jwk.model';
import { JwksCache } from './jwks-cache';
import { JwksRefreshService } from './jwks-refresh.service';

describe('JwksRefreshService', () => {
  const snapshot = {} as JeapJwksSnapshot;

  function createZone(): NgZone {
    return new NgZone({ enableLongStackTrace: false });
  }

  it('refreshes the JWKS periodically after the configured interval', fakeAsync(() => {
    const jwksCache = jasmine.createSpyObj<JwksCache>('JwksCache', ['refresh']);
    jwksCache.refresh.and.returnValue(of(snapshot));

    const refreshService = new JwksRefreshService(
      jwksCache,
      createZone(),
      'browser'
    );

    refreshService.ensureStarted(5);

    tick(4_999);
    expect(jwksCache.refresh).not.toHaveBeenCalled();

    tick(1);
    expect(jwksCache.refresh).toHaveBeenCalledTimes(1);

    tick(5_000);
    expect(jwksCache.refresh).toHaveBeenCalledTimes(2);

    refreshService.stop();

    tick(10_000);
    expect(jwksCache.refresh).toHaveBeenCalledTimes(2);
  }));

  it('continues later refresh attempts after one refresh fails', fakeAsync(() => {
    const jwksCache = jasmine.createSpyObj<JwksCache>('JwksCache', ['refresh']);
    jwksCache.refresh.and.returnValues(
      throwError(() => new Error('Temporary backend failure')),
      of(snapshot)
    );

    const refreshService = new JwksRefreshService(
      jwksCache,
      createZone(),
      'browser'
    );

    refreshService.ensureStarted(5);

    tick(5_000);
    expect(jwksCache.refresh).toHaveBeenCalledTimes(1);

    /**
     * The first failure must not terminate the periodic refresh schedule.
     */
    tick(5_000);
    expect(jwksCache.refresh).toHaveBeenCalledTimes(2);

    refreshService.ngOnDestroy();
  }));

  it('does not schedule refreshes outside the browser', fakeAsync(() => {
    const jwksCache = jasmine.createSpyObj<JwksCache>('JwksCache', ['refresh']);

    const refreshService = new JwksRefreshService(
      jwksCache,
      createZone(),
      'server'
    );

    refreshService.ensureStarted(5);

    tick(60_000);
    expect(jwksCache.refresh).not.toHaveBeenCalled();
  }));
});
