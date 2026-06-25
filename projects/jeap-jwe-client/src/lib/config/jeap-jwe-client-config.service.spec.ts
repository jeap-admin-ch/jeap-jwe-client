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

  it('loads backend configuration once and caches the result', async () => {
    configure({
      origin: sameOrigin,
    });

    const firstConfigPromise = firstValueFrom(service.getConfig());

    const configRequest = httpMock.expectOne(
      `${sameOrigin}/.well-known/jwe-config`
    );

    expect(configRequest.request.method).toBe('GET');
    expect(configRequest.request.headers.has('JWE-Response-Key')).toBeFalse();

    configRequest.flush({
      jwksUri: '/.well-known/jwks.json',
      refreshIntervalSeconds: 123,
      exclude: [{ method: '*', path: '/backend-public/**' }],
    });

    const firstConfig = await firstConfigPromise;

    expect(firstConfig.jwksUri).toBe('/.well-known/jwks.json');
    expect(firstConfig.refreshIntervalSeconds).toBe(123);
    expect(firstConfig.exclude).toEqual([
      { method: '*', path: '/backend-public/**' },
    ]);

    const secondConfig = await firstValueFrom(service.getConfig());

    expect(secondConfig).toBe(firstConfig);
    httpMock.expectNone(`${sameOrigin}/.well-known/jwe-config`);
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

    httpMock.expectNone(`${sameOrigin}/.well-known/jwe-config`);
  });

  it('extends backend exclude rules with local exclude rules by default', async () => {
    configure({
      origin: sameOrigin,
      exclude: [{ method: 'GET', path: '/local-public/**' }],
    });

    const configPromise = firstValueFrom(service.getConfig());

    const configRequest = httpMock.expectOne(
      `${sameOrigin}/.well-known/jwe-config`
    );

    configRequest.flush({
      exclude: [{ method: '*', path: '/backend-public/**' }],
    });

    const config = await configPromise;

    expect(config.exclude).toEqual([
      { method: '*', path: '/backend-public/**' },
      { method: 'GET', path: '/local-public/**' },
    ]);
  });

  it('allows local exclude rules to override backend exclude rules', async () => {
    configure({
      origin: sameOrigin,
      excludeMergeStrategy: 'override',
      exclude: [{ method: 'GET', path: '/local-public/**' }],
    });

    const configPromise = firstValueFrom(service.getConfig());

    const configRequest = httpMock.expectOne(
      `${sameOrigin}/.well-known/jwe-config`
    );

    configRequest.flush({
      exclude: [{ method: '*', path: '/backend-public/**' }],
    });

    const config = await configPromise;

    expect(config.exclude).toEqual([
      { method: 'GET', path: '/local-public/**' },
    ]);
  });

  it('uses configured jweConfigPath when loading backend configuration', async () => {
    configure({
      origin: sameOrigin,
      jweConfigPath: '/custom/.well-known/jwe-config',
    });

    const configPromise = firstValueFrom(service.getConfig());

    const configRequest = httpMock.expectOne(
      `${sameOrigin}/custom/.well-known/jwe-config`
    );

    configRequest.flush({
      jwksUri: '/custom/.well-known/jwks.json',
    });

    const config = await configPromise;

    expect(config.jwksUri).toBe('/custom/.well-known/jwks.json');
  });

  it('throws a typed error when backend configuration loading fails', async () => {
    configure({
      origin: sameOrigin,
      loadBackendConfig: true,
    });

    const configPromise = firstValueFrom(service.getConfig());

    const configRequest = httpMock.expectOne(
      `${sameOrigin}/.well-known/jwe-config`
    );

    configRequest.flush(
      { message: 'config unavailable' },
      {
        status: 500,
        statusText: 'Internal Server Error',
      }
    );

    await expectAsync(configPromise).toBeRejectedWith(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_CONFIG_LOAD_FAILED',
        retryable: true,
      } satisfies Partial<JeapJweError>)
    );
  });
});
