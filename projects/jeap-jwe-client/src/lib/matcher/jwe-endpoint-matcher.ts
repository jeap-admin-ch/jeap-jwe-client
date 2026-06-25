import { Inject, Injectable } from '@angular/core';
import { HttpRequest } from '@angular/common/http';

import {
  JeapJweClientConfig,
  JeapJweEndpointMatch,
  JeapJweResolvedClientConfig,
} from '../config/jeap-jwe-client-config';
import {
  DEFAULT_CONTENT_TYPE_ALLOWLIST,
  DEFAULT_JWKS_PATH,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  resolveExcludedPaths,
  resolveIncludedPaths,
} from '../config/jeap-jwe-defaults';
import { JEAP_JWE_CLIENT_CONFIG } from '../config/jeap-jwe-client.tokens';
import { JEAP_JWE_RESPONSE_KEY_HEADER } from '../crypto/jwe-algorithms';

@Injectable()
export class JweEndpointMatcher {
  constructor(
    @Inject(JEAP_JWE_CLIENT_CONFIG)
    private readonly fallbackConfig: JeapJweClientConfig
  ) {}

  match(
    request: HttpRequest<unknown>,
    config: JeapJweResolvedClientConfig = this.toResolvedConfig(
      this.fallbackConfig
    )
  ): JeapJweEndpointMatch | null {
    if (config.enabled === false) {
      return null;
    }

    const requestUrl = this.toUrl(request.url);
    const configuredOrigin = this.toOrigin(config.origin);

    if (requestUrl.origin !== configuredOrigin) {
      return null;
    }

    const requestMethod = request.method.toUpperCase();
    const requestPath = requestUrl.pathname;

    /**
     * Mirror the backend decision: a request is protected only when its path
     * matches an include pattern and no exclude pattern. Includes are evaluated
     * first, excludes win. Paths are matched as published by the backend,
     * relative to the origin root (the backend already prefixes its context
     * path), so no method-aware rules are involved.
     */
    if (!this.isIncluded(config, requestPath)) {
      return null;
    }

    if (this.isExcluded(config, requestPath)) {
      return null;
    }

    return {
      method: requestMethod,
      url: requestUrl.toString(),
      origin: requestUrl.origin,
      path: requestPath,
      protocol: {
        responseKeyHeader: config.responseKeyHeader,
        contentTypeAllowlist: config.contentTypeAllowlist,
      },
    };
  }

  private isIncluded(
    config: JeapJweResolvedClientConfig,
    requestPath: string
  ): boolean {
    return config.include.some(pattern =>
      this.matchesPath(pattern, requestPath)
    );
  }

  private isExcluded(
    config: JeapJweResolvedClientConfig,
    requestPath: string
  ): boolean {
    return config.exclude.some(pattern =>
      this.matchesPath(pattern, requestPath)
    );
  }

  private matchesPath(pattern: string, requestPath: string): boolean {
    return this.patternToRegExp(this.normalizePathPattern(pattern)).test(
      requestPath
    );
  }

  private normalizePathPattern(pattern: string): string {
    if (pattern === '*') {
      return '/**';
    }

    return pattern.startsWith('/') ? pattern : `/${pattern}`;
  }

  /**
   * Translates a Spring-style {@code PathPattern} into a regular expression:
   *
   * - `*` matches any character except `/` (a single path segment),
   * - `**` matches any character including `/` (zero or more segments),
   * - a trailing `/**` additionally matches the prefix itself, so `/api/**`
   *   matches `/api`, `/api/orders` and `/api/orders/1` - mirroring the backend.
   *
   * Wildcards may appear anywhere in the pattern (e.g. `/*api*\/**`).
   */
  private patternToRegExp(pattern: string): RegExp {
    let body = pattern;
    let matchPrefixOrDescendants = false;

    if (body.endsWith('/**')) {
      body = body.slice(0, -3);
      matchPrefixOrDescendants = true;
    }

    let regex = '^';

    for (let index = 0; index < body.length; index++) {
      const char = body[index];
      const nextChar = body[index + 1];

      if (char === '*' && nextChar === '*') {
        regex += '.*';
        index++;
        continue;
      }

      if (char === '*') {
        regex += '[^/]*';
        continue;
      }

      regex += this.escapeRegExp(char);
    }

    regex += matchPrefixOrDescendants ? '(?:/.*)?$' : '$';

    return new RegExp(regex);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }

  private toUrl(url: string): URL {
    return new URL(url, this.currentOrigin());
  }

  private toOrigin(origin: string): string {
    return new URL(origin, this.currentOrigin()).origin;
  }

  private currentOrigin(): string {
    const browserOrigin = globalThis.location?.origin;

    if (browserOrigin) {
      return browserOrigin;
    }

    /**
     * Outside a browser (e.g. SSR) there is no document origin to resolve
     * relative URLs against. Fall back to the configured absolute origin, and
     * fail with a clear error rather than silently assuming localhost.
     */
    try {
      return new URL(this.fallbackConfig.origin).origin;
    } catch {
      throw new Error(
        'jeap-jwe-client: cannot resolve the request origin outside a browser. ' +
          'Configure an absolute "origin".'
      );
    }
  }

  private toResolvedConfig(
    config: JeapJweClientConfig
  ): JeapJweResolvedClientConfig {
    return {
      ...config,
      jwksUri: config.jwksPath ?? DEFAULT_JWKS_PATH,
      refreshIntervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS,
      include: resolveIncludedPaths(config),
      exclude: resolveExcludedPaths(config),
      responseKeyHeader: JEAP_JWE_RESPONSE_KEY_HEADER,
      contentTypeAllowlist: [...DEFAULT_CONTENT_TYPE_ALLOWLIST],
    };
  }
}
