import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { JEAP_JWE_CLIENT_CONFIG } from './jeap-jwe-client.tokens';
import { JeapJweClientConfigService } from './jeap-jwe-client-config.service';
import { JeapJweError } from '../error/jeap-jwe-error';

describe('JeapJweClientConfigService', () => {
  const sameOrigin = globalThis.location.origin;
  const configUrl = `${sameOrigin}/.well-known/jwe-configuration`;

  let service: JeapJweClientConfigService;
  let httpMock: HttpTestingController;

  function configure(config: object): void {
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        JeapJweClientConfigService,
        {
          provide: JEAP_JWE_CLIENT_CONFIG,
          useValue: config,
        },
      ],
    });

    service = TestBed.inject(JeapJweClientConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('loads backend metadata once and caches the result', async () => {
    configure({ origin: sameOrigin });

    const firstConfigPromise = firstValueFrom(service.getConfig());

    const configRequest = httpMock.expectOne(configUrl);

    expect(configRequest.request.method).toBe('GET');
    expect(configRequest.request.headers.has('JWE-Response-Key')).toBeFalse();

    configRequest.flush({
      jwksPath: '/custom/jwks.json',
      contentTypeAllowlist: ['application/json', 'text/plain'],
      responseKeyHeader: 'JWE-Response-Key',
    });

    const firstConfig = await firstConfigPromise;

    expect(firstConfig.jwksUri).toBe('/custom/jwks.json');
    expect(firstConfig.contentTypeAllowlist).toEqual([
      'application/json',
      'text/plain',
    ]);
    expect(firstConfig.refreshIntervalSeconds).toBe(300);

    const secondConfig = await firstValueFrom(service.getConfig());

    expect(secondConfig).toBe(firstConfig);
    httpMock.expectNone(configUrl);
  });

  it('applies defaults when the backend metadata omits fields', async () => {
    configure({ origin: sameOrigin });

    const configPromise = firstValueFrom(service.getConfig());

    httpMock.expectOne(configUrl).flush({});

    const config = await configPromise;

    expect(config.jwksUri).toBe('/.well-known/jwks.json');
    expect(config.contentTypeAllowlist).toEqual(['application/json']);
    expect(config.responseKeyHeader).toBe('JWE-Response-Key');
  });

  it('honors a backend-advertised response-key header', async () => {
    configure({ origin: sameOrigin });

    const configPromise = firstValueFrom(service.getConfig());

    httpMock
      .expectOne(configUrl)
      .flush({ responseKeyHeader: 'X-Custom-Response-Key' });

    const config = await configPromise;

    expect(config.responseKeyHeader).toBe('X-Custom-Response-Key');
  });

  it('does not load backend configuration when loadBackendConfig is false', async () => {
    configure({
      origin: sameOrigin,
      loadBackendConfig: false,
      jwksPath: '/custom-jwks.json',
      exclude: [{ method: '*', path: '/local-public/**' }],
    });

    const config = await firstValueFrom(service.getConfig());

    expect(config.jwksUri).toBe('/custom-jwks.json');
    expect(config.refreshIntervalSeconds).toBe(300);
    expect(config.exclude).toEqual([{ method: '*', path: '/local-public/**' }]);

    httpMock.expectNone(configUrl);
  });

  it('uses client-owned exclude rules as-is', async () => {
    configure({
      origin: sameOrigin,
      exclude: [{ method: 'GET', path: '/local-public/**' }],
    });

    const configPromise = firstValueFrom(service.getConfig());

    httpMock.expectOne(configUrl).flush({ jwksPath: '/.well-known/jwks.json' });

    const config = await configPromise;

    expect(config.exclude).toEqual([
      { method: 'GET', path: '/local-public/**' },
    ]);
  });

  it('uses the configured jweConfigPath when loading backend configuration', async () => {
    configure({
      origin: sameOrigin,
      jweConfigPath: '/custom/jwe-configuration',
    });

    const configPromise = firstValueFrom(service.getConfig());

    httpMock
      .expectOne(`${sameOrigin}/custom/jwe-configuration`)
      .flush({ jwksPath: '/custom/jwks.json' });

    const config = await configPromise;

    expect(config.jwksUri).toBe('/custom/jwks.json');
  });

  it('throws a typed error when backend configuration loading fails', async () => {
    configure({ origin: sameOrigin, loadBackendConfig: true });

    const configPromise = firstValueFrom(service.getConfig());

    httpMock
      .expectOne(configUrl)
      .flush(
        { message: 'config unavailable' },
        { status: 500, statusText: 'Internal Server Error' }
      );

    await expectAsync(configPromise).toBeRejectedWith(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_CONFIG_LOAD_FAILED',
        retryable: true,
      } satisfies Partial<JeapJweError>)
    );
  });

  it('retries loading after a failed attempt instead of caching the failure', async () => {
    configure({ origin: sameOrigin, loadBackendConfig: true });

    const failingPromise = firstValueFrom(service.getConfig());

    httpMock
      .expectOne(configUrl)
      .flush(
        { message: 'temporary' },
        { status: 503, statusText: 'Unavailable' }
      );

    await expectAsync(failingPromise).toBeRejected();

    const retryPromise = firstValueFrom(service.getConfig());

    httpMock.expectOne(configUrl).flush({ jwksPath: '/.well-known/jwks.json' });

    const config = await retryPromise;

    expect(config.jwksUri).toBe('/.well-known/jwks.json');
  });
});
