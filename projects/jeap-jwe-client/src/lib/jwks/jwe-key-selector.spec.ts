import { of } from 'rxjs';

import { JeapJweError } from '../error/jeap-jwe-error';
import { JeapJwePublicJwk, JeapJwksSnapshot } from './jwk.model';
import { JweKeySelector } from './jwe-key-selector';
import { JwksCache } from './jwks-cache';
import { JwksRefreshService } from './jwks-refresh.service';

describe('JweKeySelector', () => {
  function key(kid: string): JeapJwePublicJwk {
    return {
      kty: 'RSA',
      kid,
      use: 'enc',
      alg: 'RSA-OAEP-256',
      n: `modulus-${kid}`,
      e: 'AQAB',
    };
  }

  function snapshot(...keys: JeapJwePublicJwk[]): JeapJwksSnapshot {
    return {
      keys,
      keysByKid: new Map(keys.map(currentKey => [currentKey.kid, currentKey])),
      loadedAt: Date.now(),
      jwksUri: 'https://api.example.ch/.well-known/jwks.json',
      refreshIntervalSeconds: 300,
      config: {
        origin: 'https://api.example.ch',
        loadBackendConfig: false,
        jwksUri: '/.well-known/jwks.json',
        refreshIntervalSeconds: 300,
        exclude: [],
      },
    };
  }

  it('selects the first backend-provided key as the current encryption key', () => {
    const currentSnapshot = snapshot(
      key('transit-key:7'),
      key('transit-key:6')
    );

    const jwksCache = jasmine.createSpyObj<JwksCache>('JwksCache', [
      'getSnapshot',
      'getOrLoad',
      'refresh',
    ]);

    const refreshService = jasmine.createSpyObj<JwksRefreshService>(
      'JwksRefreshService',
      ['ensureStarted']
    );

    jwksCache.getOrLoad.and.returnValue(of(currentSnapshot));

    const selector = new JweKeySelector(jwksCache, refreshService);

    let selectedKey: JeapJwePublicJwk | undefined;

    selector.selectCurrentKey().subscribe(result => {
      selectedKey = result;
    });

    /**
     * The backend controls key ordering. The selector must use keys[0]
     * and must not apply client-side sorting.
     */
    expect(selectedKey?.kid).toBe('transit-key:7');

    expect(refreshService.ensureStarted).toHaveBeenCalledWith(300);
  });

  it('selects a cached key by kid without refreshing the JWKS', () => {
    const currentSnapshot = snapshot(
      key('transit-key:7'),
      key('transit-key:6')
    );

    const jwksCache = jasmine.createSpyObj<JwksCache>('JwksCache', [
      'getSnapshot',
      'getOrLoad',
      'refresh',
    ]);

    const refreshService = jasmine.createSpyObj<JwksRefreshService>(
      'JwksRefreshService',
      ['ensureStarted']
    );

    jwksCache.getSnapshot.and.returnValue(currentSnapshot);

    const selector = new JweKeySelector(jwksCache, refreshService);

    let selectedKey: JeapJwePublicJwk | undefined;

    selector.selectByKid('transit-key:6').subscribe(result => {
      selectedKey = result;
    });

    expect(selectedKey?.kid).toBe('transit-key:6');
    expect(jwksCache.refresh).not.toHaveBeenCalled();
  });

  it('forces a JWKS refresh when a requested kid is not cached', () => {
    const initialSnapshot = snapshot(key('transit-key:7'));
    const refreshedSnapshot = snapshot(
      key('transit-key:8'),
      key('transit-key:7')
    );

    const jwksCache = jasmine.createSpyObj<JwksCache>('JwksCache', [
      'getSnapshot',
      'getOrLoad',
      'refresh',
    ]);

    const refreshService = jasmine.createSpyObj<JwksRefreshService>(
      'JwksRefreshService',
      ['ensureStarted']
    );

    jwksCache.getSnapshot.and.returnValue(initialSnapshot);
    jwksCache.refresh.and.returnValue(of(refreshedSnapshot));

    const selector = new JweKeySelector(jwksCache, refreshService);

    let selectedKey: JeapJwePublicJwk | undefined;

    selector.selectByKid('transit-key:8').subscribe(result => {
      selectedKey = result;
    });

    expect(jwksCache.refresh).toHaveBeenCalledTimes(1);
    expect(selectedKey?.kid).toBe('transit-key:8');
  });

  it('returns a typed unknown-kid error when a forced refresh still cannot find the key', () => {
    const currentSnapshot = snapshot(key('transit-key:7'));

    const jwksCache = jasmine.createSpyObj<JwksCache>('JwksCache', [
      'getSnapshot',
      'getOrLoad',
      'refresh',
    ]);

    const refreshService = jasmine.createSpyObj<JwksRefreshService>(
      'JwksRefreshService',
      ['ensureStarted']
    );

    jwksCache.getSnapshot.and.returnValue(currentSnapshot);
    jwksCache.refresh.and.returnValue(of(currentSnapshot));

    const selector = new JweKeySelector(jwksCache, refreshService);

    let actualError: unknown;

    selector.selectByKid('transit-key:999').subscribe({
      error: error => {
        actualError = error;
      },
    });

    expect(jwksCache.refresh).toHaveBeenCalledTimes(1);

    expect(actualError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_UNKNOWN_KID',
      })
    );

    expect(actualError instanceof JeapJweError).toBeTrue();
  });
});
