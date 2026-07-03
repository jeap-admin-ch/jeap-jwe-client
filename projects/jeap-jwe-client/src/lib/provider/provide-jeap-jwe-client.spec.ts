import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { JeapJweClientConfig } from '../config/jeap-jwe-client-config';
import { JEAP_JWE_CLIENT_CONFIG } from '../config/jeap-jwe-client.tokens';
import { provideJeapJweClient } from './provide-jeap-jwe-client';

describe('provideJeapJweClient', () => {
  const sameOrigin = globalThis.location.origin;

  function injectConfig(
    config?: JeapJweClientConfig,
    baseHref?: string
  ): JeapJweClientConfig {
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({
      providers: [
        ...(baseHref !== undefined
          ? [{ provide: APP_BASE_HREF, useValue: baseHref }]
          : []),
        provideJeapJweClient(config),
      ],
    });

    return TestBed.inject(JEAP_JWE_CLIENT_CONFIG);
  }

  it('defaults the origin to the frontend origin and the discovery paths to the root well-known paths', () => {
    const config = injectConfig(undefined, '/');

    expect(config.origin).toBe(sameOrigin);
    expect(config.jweConfigPath).toBe('/.well-known/jwe-configuration');
    expect(config.jwksPath).toBe('/.well-known/jwks.json');
  });

  it('prefixes the default discovery paths with the APP_BASE_HREF base path for a backend-served frontend', () => {
    const config = injectConfig(undefined, '/myapp/');

    expect(config.jweConfigPath).toBe('/myapp/.well-known/jwe-configuration');
    expect(config.jwksPath).toBe('/myapp/.well-known/jwks.json');
  });

  it('prefixes the default discovery paths for an explicitly configured same-origin backend', () => {
    const config = injectConfig({ origin: sameOrigin }, '/myapp/');

    expect(config.jweConfigPath).toBe('/myapp/.well-known/jwe-configuration');
    expect(config.jwksPath).toBe('/myapp/.well-known/jwks.json');
  });

  it('keeps the root well-known defaults for an explicitly configured cross-origin backend', () => {
    const config = injectConfig(
      { origin: 'https://api.example.ch' },
      '/myapp/'
    );

    expect(config.origin).toBe('https://api.example.ch');
    expect(config.jweConfigPath).toBe('/.well-known/jwe-configuration');
    expect(config.jwksPath).toBe('/.well-known/jwks.json');
  });

  it('keeps explicitly configured discovery paths untouched', () => {
    const config = injectConfig(
      {
        origin: 'https://api.example.ch',
        jweConfigPath: '/myapp/.well-known/jwe-configuration',
        jwksPath: '/myapp/.well-known/jwks.json',
      },
      '/other/'
    );

    expect(config.jweConfigPath).toBe('/myapp/.well-known/jwe-configuration');
    expect(config.jwksPath).toBe('/myapp/.well-known/jwks.json');
  });

  it('rejects a plaintext non-localhost backend origin', () => {
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({
      providers: [provideJeapJweClient({ origin: 'http://api.example.ch' })],
    });

    expect(() => TestBed.inject(JEAP_JWE_CLIENT_CONFIG)).toThrowError(
      /must use HTTPS/
    );
  });
});
