import { HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import {
  JeapJweClientConfig,
  JeapJweResolvedClientConfig,
} from '../config/jeap-jwe-client-config';
import {
  resolveExcludedPaths,
  resolveIncludedPaths,
} from '../config/jeap-jwe-defaults';
import { JEAP_JWE_CLIENT_CONFIG } from '../config/jeap-jwe-client.tokens';
import { JEAP_JWE_RESPONSE_KEY_HEADER } from '../crypto/jwe-algorithms';
import { JweEndpointMatcher } from './jwe-endpoint-matcher';

type HttpMethod =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS';

describe('JweEndpointMatcher', () => {
  const sameOrigin = globalThis.location.origin;

  function configure(config: JeapJweClientConfig): JweEndpointMatcher {
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({
      providers: [
        JweEndpointMatcher,
        {
          provide: JEAP_JWE_CLIENT_CONFIG,
          useValue: config,
        },
      ],
    });

    return TestBed.inject(JweEndpointMatcher);
  }

  /**
   * Builds a resolved configuration the way the config service would, so the
   * matcher tests can drive the include/exclude decision with explicit
   * (and backend-published) path lists.
   */
  function resolved(
    config: JeapJweClientConfig,
    overrides: Partial<JeapJweResolvedClientConfig> = {}
  ): JeapJweResolvedClientConfig {
    return {
      ...config,
      jwksUri: '/.well-known/jwks.json',
      refreshIntervalSeconds: 300,
      include: resolveIncludedPaths(config),
      exclude: resolveExcludedPaths(config),
      responseKeyHeader: JEAP_JWE_RESPONSE_KEY_HEADER,
      contentTypeAllowlist: ['application/json'],
      ...overrides,
    };
  }

  function request(
    method: HttpMethod,
    url: string,
    body: unknown | null = null
  ): HttpRequest<unknown> {
    return new HttpRequest<unknown>(method, url, body);
  }

  it('returns null when the client is disabled', () => {
    const matcher = configure({
      enabled: false,
      origin: sameOrigin,
    });

    const result = matcher.match(request('GET', '/api/persons'));

    expect(result).toBeNull();
  });

  it('matches relative URLs when the configured origin is the browser origin', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
    });

    const result = matcher.match(request('GET', '/api/persons/123'));

    expect(result).not.toBeNull();
    expect(result?.origin).toBe(sameOrigin);
    expect(result?.method).toBe('GET');
    expect(result?.path).toBe('/api/persons/123');
  });

  it('matches absolute URLs for the configured backend origin', () => {
    const matcher = configure({
      enabled: true,
      origin: 'https://api.example.ch',
    });

    const result = matcher.match(
      request('POST', 'https://api.example.ch/api/persons', {
        name: 'Alice',
      })
    );

    expect(result).not.toBeNull();
    expect(result?.origin).toBe('https://api.example.ch');
    expect(result?.method).toBe('POST');
    expect(result?.path).toBe('/api/persons');
  });

  it('does not match absolute URLs from another origin', () => {
    const matcher = configure({
      enabled: true,
      origin: 'https://api.example.ch',
    });

    const result = matcher.match(
      request('GET', 'https://other.example.ch/api/persons')
    );

    expect(result).toBeNull();
  });

  it('matches GET, POST, PUT, PATCH and DELETE requests for an included path', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
    });

    const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    for (const method of methods) {
      const result = matcher.match(
        request(method, `/api/resource/${method.toLowerCase()}`, {
          value: method,
        })
      );

      expect(result).not.toBeNull();
      expect(result?.method).toBe(method);
      expect(result?.path).toBe(`/api/resource/${method.toLowerCase()}`);
    }
  });

  describe('default include pattern', () => {
    it('protects paths whose first segment contains "api"', () => {
      const matcher = configure({
        enabled: true,
        origin: sameOrigin,
      });

      expect(matcher.match(request('GET', '/api'))).not.toBeNull();
      expect(matcher.match(request('GET', '/api/persons'))).not.toBeNull();
      expect(matcher.match(request('GET', '/v1api/persons'))).not.toBeNull();
      expect(matcher.match(request('POST', '/apiv2/orders'))).not.toBeNull();
    });

    it('does not protect paths that are not included', () => {
      const matcher = configure({
        enabled: true,
        origin: sameOrigin,
      });

      expect(matcher.match(request('GET', '/'))).toBeNull();
      expect(matcher.match(request('GET', '/persons'))).toBeNull();
      expect(matcher.match(request('GET', '/index.html'))).toBeNull();
      expect(matcher.match(request('GET', '/static/app.js'))).toBeNull();
    });
  });

  describe('include/exclude decision', () => {
    it('protects a request matching an include and no exclude', () => {
      const matcher = configure({ origin: sameOrigin });

      const config = resolved(
        { origin: sameOrigin },
        { include: ['/api/**'], exclude: [] }
      );

      const result = matcher.match(
        request('GET', '/api/private/persons'),
        config
      );

      expect(result).not.toBeNull();
      expect(result?.path).toBe('/api/private/persons');
    });

    it('does not protect a request matched by an exclude even when it matches an include', () => {
      const matcher = configure({ origin: sameOrigin });

      const config = resolved(
        { origin: sameOrigin },
        { include: ['/api/**'], exclude: ['/api/public/**'] }
      );

      expect(
        matcher.match(request('GET', '/api/private/persons'), config)
      ).not.toBeNull();
      expect(
        matcher.match(request('GET', '/api/public/status'), config)
      ).toBeNull();
    });

    it('does not protect a request that matches no include', () => {
      const matcher = configure({ origin: sameOrigin });

      const config = resolved(
        { origin: sameOrigin },
        { include: ['/api/**'], exclude: [] }
      );

      expect(
        matcher.match(request('GET', '/public/status'), config)
      ).toBeNull();
    });

    it('lets an exclude win over an overlapping include (excludes evaluated second)', () => {
      const matcher = configure({ origin: sameOrigin });

      const config = resolved(
        { origin: sameOrigin },
        { include: ['/api/**'], exclude: ['/api/**'] }
      );

      expect(matcher.match(request('GET', '/api/persons'), config)).toBeNull();
    });
  });

  describe('backend-published include/exclude paths', () => {
    it('uses the backend includedPaths and excludedPaths to drive the decision', () => {
      const matcher = configure({ origin: sameOrigin });

      const config = resolved(
        { origin: sameOrigin },
        {
          include: resolveIncludedPaths(
            { origin: sameOrigin },
            { includedPaths: ['/*api*/**'] }
          ),
          exclude: resolveExcludedPaths(
            { origin: sameOrigin },
            {
              excludedPaths: [
                '/actuator/**',
                '/.well-known/jwks.json',
                '/.well-known/jwe-configuration',
                '/api/public/**',
              ],
            }
          ),
        }
      );

      expect(
        matcher.match(request('GET', '/api/persons'), config)
      ).not.toBeNull();
      expect(
        matcher.match(request('GET', '/api/public/status'), config)
      ).toBeNull();
      expect(
        matcher.match(request('GET', '/actuator/health'), config)
      ).toBeNull();
      expect(
        matcher.match(request('GET', '/.well-known/jwks.json'), config)
      ).toBeNull();
    });

    it('honors a backend context-path prefix on the published paths', () => {
      const matcher = configure({ origin: sameOrigin });

      const config = resolved(
        { origin: sameOrigin },
        {
          include: ['/myapp/*api*/**'],
          exclude: ['/myapp/.well-known/**', '/myapp/actuator/**'],
        }
      );

      expect(
        matcher.match(request('GET', '/myapp/api/persons'), config)
      ).not.toBeNull();
      expect(
        matcher.match(request('GET', '/myapp/.well-known/jwks.json'), config)
      ).toBeNull();
      // The same path without the context-path prefix is not included.
      expect(matcher.match(request('GET', '/api/persons'), config)).toBeNull();
    });
  });

  describe('default excludes', () => {
    it('excludes .well-known endpoints by default', () => {
      const matcher = configure({
        enabled: true,
        origin: sameOrigin,
      });

      expect(
        matcher.match(request('GET', '/.well-known/jwks.json'))
      ).toBeNull();
      expect(
        matcher.match(request('GET', '/.well-known/jwe-configuration'))
      ).toBeNull();
    });

    it('excludes actuator endpoints by default', () => {
      const matcher = configure({
        enabled: true,
        origin: sameOrigin,
      });

      // Actuator is not under an include by default, so it is never protected;
      // configuring an include that would cover it still leaves it excluded.
      const config = resolved({ origin: sameOrigin }, { include: ['/**'] });

      expect(matcher.match(request('GET', '/actuator'), config)).toBeNull();
      expect(
        matcher.match(request('GET', '/actuator/health'), config)
      ).toBeNull();
      expect(
        matcher.match(request('GET', '/actuator/prometheus'), config)
      ).toBeNull();
    });

    it('excludes /health by default', () => {
      const matcher = configure({ origin: sameOrigin });

      const config = resolved({ origin: sameOrigin }, { include: ['/**'] });

      expect(matcher.match(request('GET', '/health'), config)).toBeNull();
    });

    it('does not exclude /health/details by the exact default /health rule', () => {
      const matcher = configure({ origin: sameOrigin });

      const config = resolved({ origin: sameOrigin }, { include: ['/**'] });

      const result = matcher.match(request('GET', '/health/details'), config);

      expect(result).not.toBeNull();
      expect(result?.path).toBe('/health/details');
    });

    it('extends default excludes with consumer excludes by default', () => {
      const matcher = configure({
        enabled: true,
        origin: sameOrigin,
        exclude: ['/api/public/**'],
      });

      expect(
        matcher.match(request('GET', '/.well-known/jwks.json'))
      ).toBeNull();
      expect(matcher.match(request('GET', '/api/public/status'))).toBeNull();

      const protectedResult = matcher.match(request('GET', '/api/persons'));

      expect(protectedResult).not.toBeNull();
      expect(protectedResult?.path).toBe('/api/persons');
    });

    it('can replace default excludes when useDefaultExcludes is false', () => {
      const matcher = configure({
        enabled: true,
        origin: sameOrigin,
        useDefaultExcludes: false,
        include: ['/**'],
        exclude: ['/api/public/**'],
      });

      const wellKnownResult = matcher.match(
        request('GET', '/.well-known/jwks.json')
      );

      const customExcludedResult = matcher.match(
        request('GET', '/api/public/status')
      );

      expect(wellKnownResult).not.toBeNull();
      expect(wellKnownResult?.path).toBe('/.well-known/jwks.json');

      expect(customExcludedResult).toBeNull();
    });
  });

  describe('path patterns', () => {
    it('supports single-segment wildcards', () => {
      const matcher = configure({
        enabled: true,
        origin: sameOrigin,
        exclude: ['/api/*/metadata'],
      });

      expect(matcher.match(request('GET', '/api/persons/metadata'))).toBeNull();

      const nestedResult = matcher.match(
        request('GET', '/api/persons/123/metadata')
      );

      expect(nestedResult).not.toBeNull();
    });

    it('supports multi-segment wildcards', () => {
      const matcher = configure({
        enabled: true,
        origin: sameOrigin,
        exclude: ['/api/public/**'],
      });

      expect(matcher.match(request('GET', '/api/public'))).toBeNull();
      expect(matcher.match(request('GET', '/api/public/status'))).toBeNull();
      expect(matcher.match(request('GET', '/api/public/v1/status'))).toBeNull();

      const protectedResult = matcher.match(
        request('GET', '/api/private/status')
      );

      expect(protectedResult).not.toBeNull();
    });

    it('supports wildcards inside an include prefix', () => {
      const matcher = configure({ origin: sameOrigin });

      const config = resolved(
        { origin: sameOrigin },
        { include: ['/*api*/**'], exclude: [] }
      );

      expect(matcher.match(request('GET', '/api'), config)).not.toBeNull();
      expect(
        matcher.match(request('GET', '/api/orders'), config)
      ).not.toBeNull();
      expect(matcher.match(request('GET', '/v1api/x'), config)).not.toBeNull();
      expect(matcher.match(request('GET', '/web/orders'), config)).toBeNull();
    });

    it('ignores query parameters for path matching', () => {
      const matcher = configure({
        enabled: true,
        origin: sameOrigin,
        exclude: ['/api/public/**'],
      });

      const result = matcher.match(
        request('GET', '/api/public/status?token=secret&foo=bar')
      );

      expect(result).toBeNull();
    });
  });
});
