import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';

import { JeapJweClientConfigService } from '../config/jeap-jwe-client-config.service';
import { JeapJweResolvedClientConfig } from '../config/jeap-jwe-client-config';
import { JeapJwePublicJwk, JeapJwksSnapshot } from './jwk.model';
import { JwksCache } from './jwks-cache';
import { JwksClient } from './jwks-client';

describe('JwksCache', () => {
  let cache: JwksCache;
  let configService: jasmine.SpyObj<JeapJweClientConfigService>;
  let jwksClient: jasmine.SpyObj<JwksClient>;

  const config: JeapJweResolvedClientConfig = {
    origin: 'https://api.example.ch',
    loadBackendConfig: false,
    jwksUri: '/.well-known/jwks.json',
    refreshIntervalSeconds: 300,
    include: [],
    exclude: [],
    responseKeyHeader: 'JWE-Response-Key',
    contentTypeAllowlist: ['application/json'],
  };

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
      config,
    };
  }

  beforeEach(() => {
    configService = jasmine.createSpyObj<JeapJweClientConfigService>(
      'JeapJweClientConfigService',
      ['getConfig']
    );

    jwksClient = jasmine.createSpyObj<JwksClient>('JwksClient', ['fetch']);

    configService.getConfig.and.returnValue(of(config));

    TestBed.configureTestingModule({
      providers: [
        JwksCache,
        {
          provide: JeapJweClientConfigService,
          useValue: configService,
        },
        {
          provide: JwksClient,
          useValue: jwksClient,
        },
      ],
    });

    cache = TestBed.inject(JwksCache);
  });

  it('loads the JWKS once and returns the cached snapshot afterwards', () => {
    const firstSnapshot = snapshot(key('transit-key:7'), key('transit-key:6'));

    jwksClient.fetch.and.returnValue(of(firstSnapshot));

    let firstResult: JeapJwksSnapshot | undefined;
    let secondResult: JeapJwksSnapshot | undefined;

    cache.getOrLoad().subscribe(result => {
      firstResult = result;
    });

    cache.getOrLoad().subscribe(result => {
      secondResult = result;
    });

    expect(jwksClient.fetch).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(firstSnapshot);
    expect(secondResult).toBe(firstSnapshot);
    expect(cache.getSnapshot()).toBe(firstSnapshot);
  });

  it('keeps the previous snapshot active until a refresh completes successfully', () => {
    const initialSnapshot = snapshot(
      key('transit-key:7'),
      key('transit-key:6')
    );

    const refreshedSnapshot = snapshot(
      key('transit-key:8'),
      key('transit-key:7')
    );

    const initialLoad$ = new Subject<JeapJwksSnapshot>();
    const refresh$ = new Subject<JeapJwksSnapshot>();

    jwksClient.fetch.and.returnValues(initialLoad$, refresh$);

    cache.getOrLoad().subscribe();
    initialLoad$.next(initialSnapshot);
    initialLoad$.complete();

    expect(cache.getSnapshot()).toBe(initialSnapshot);
    expect(cache.getSnapshot()?.keys[0].kid).toBe('transit-key:7');

    cache.refresh().subscribe();

    /**
     * The old snapshot remains available while the refresh request is pending.
     */
    expect(cache.getSnapshot()).toBe(initialSnapshot);
    expect(cache.getSnapshot()?.keys[0].kid).toBe('transit-key:7');

    refresh$.next(refreshedSnapshot);
    refresh$.complete();

    expect(cache.getSnapshot()).toBe(refreshedSnapshot);
    expect(cache.getSnapshot()?.keys[0].kid).toBe('transit-key:8');
    expect(jwksClient.fetch).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight initial JWKS request across concurrent consumers', () => {
    const initialSnapshot = snapshot(key('transit-key:7'));
    const initialLoad$ = new Subject<JeapJwksSnapshot>();

    jwksClient.fetch.and.returnValue(initialLoad$);

    let firstResult: JeapJwksSnapshot | undefined;
    let secondResult: JeapJwksSnapshot | undefined;

    cache.getOrLoad().subscribe(result => {
      firstResult = result;
    });

    cache.getOrLoad().subscribe(result => {
      secondResult = result;
    });

    expect(jwksClient.fetch).toHaveBeenCalledTimes(1);

    initialLoad$.next(initialSnapshot);
    initialLoad$.complete();

    expect(firstResult).toBe(initialSnapshot);
    expect(secondResult).toBe(initialSnapshot);
  });
});
