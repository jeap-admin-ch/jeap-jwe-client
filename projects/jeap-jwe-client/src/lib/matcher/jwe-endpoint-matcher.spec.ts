import { HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { JeapJweClientConfig } from '../config/jeap-jwe-client-config';
import { JEAP_JWE_CLIENT_CONFIG } from '../config/jeap-jwe-client.tokens';
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

  it('matches GET, POST, PUT, PATCH and DELETE requests for the configured origin', () => {
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

  it('uses pure blacklist semantics and protects all non-excluded backend paths', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
      exclude: [{ method: '*', path: '/api/public/**' }],
    });

    const protectedResult = matcher.match(
      request('GET', '/api/private/persons')
    );
    const excludedResult = matcher.match(request('GET', '/api/public/status'));

    expect(protectedResult).not.toBeNull();
    expect(protectedResult?.path).toBe('/api/private/persons');

    expect(excludedResult).toBeNull();
  });

  it('excludes .well-known endpoints by default', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
    });

    expect(matcher.match(request('GET', '/.well-known/jwks.json'))).toBeNull();
    expect(matcher.match(request('GET', '/.well-known/jwe-config'))).toBeNull();
  });

  it('excludes actuator endpoints by default', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
    });

    expect(matcher.match(request('GET', '/actuator'))).toBeNull();
    expect(matcher.match(request('GET', '/actuator/health'))).toBeNull();
    expect(matcher.match(request('GET', '/actuator/prometheus'))).toBeNull();
  });

  it('excludes /health by default', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
    });

    expect(matcher.match(request('GET', '/health'))).toBeNull();
  });

  it('does not exclude /health/details by the exact default /health rule', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
    });

    const result = matcher.match(request('GET', '/health/details'));

    expect(result).not.toBeNull();
    expect(result?.path).toBe('/health/details');
  });

  it('extends default excludes with consumer excludes by default', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
      exclude: [{ method: '*', path: '/api/public/**' }],
    });

    expect(matcher.match(request('GET', '/.well-known/jwks.json'))).toBeNull();
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
      exclude: [{ method: '*', path: '/api/public/**' }],
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

  it('supports method-specific exclude rules', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
      exclude: [{ method: 'GET', path: '/api/reports/**' }],
    });

    const getResult = matcher.match(request('GET', '/api/reports/123'));

    const postResult = matcher.match(
      request('POST', '/api/reports/123', {
        generate: true,
      })
    );

    expect(getResult).toBeNull();

    expect(postResult).not.toBeNull();
    expect(postResult?.method).toBe('POST');
    expect(postResult?.path).toBe('/api/reports/123');
  });

  it('supports single-segment wildcards', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
      exclude: [{ method: '*', path: '/api/*/metadata' }],
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
      exclude: [{ method: '*', path: '/api/public/**' }],
    });

    expect(matcher.match(request('GET', '/api/public'))).toBeNull();
    expect(matcher.match(request('GET', '/api/public/status'))).toBeNull();
    expect(matcher.match(request('GET', '/api/public/v1/status'))).toBeNull();

    const protectedResult = matcher.match(
      request('GET', '/api/private/status')
    );

    expect(protectedResult).not.toBeNull();
  });

  it('ignores query parameters for path matching', () => {
    const matcher = configure({
      enabled: true,
      origin: sameOrigin,
      exclude: [{ method: '*', path: '/api/public/**' }],
    });

    const result = matcher.match(
      request('GET', '/api/public/status?token=secret&foo=bar')
    );

    expect(result).toBeNull();
  });
});
