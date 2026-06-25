import { Inject, Injectable } from '@angular/core';
import { HttpRequest } from '@angular/common/http';

import {
  JeapJweClientConfig,
  JeapJweEndpointMatch,
  JeapJweExcludeRule,
  JeapJweResolvedClientConfig,
} from '../config/jeap-jwe-client-config';
import {
  DEFAULT_CONTENT_TYPE_ALLOWLIST,
  DEFAULT_JWKS_PATH,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
} from '../config/jeap-jwe-defaults';
import { JEAP_JWE_CLIENT_CONFIG } from '../config/jeap-jwe-client.tokens';
import { JEAP_JWE_RESPONSE_KEY_HEADER } from '../crypto/jwe-algorithms';

export const JEAP_JWE_DEFAULT_EXCLUDE_RULES: JeapJweExcludeRule[] = [
  { method: '*', path: '/.well-known/**' },
  { method: '*', path: '/actuator/**' },
  { method: '*', path: '/health' },
];

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

    if (this.isExcluded(config, requestMethod, requestPath)) {
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

  private isExcluded(
    config: JeapJweResolvedClientConfig,
    requestMethod: string,
    requestPath: string
  ): boolean {
    const excludeRules =
      config.useDefaultExcludes === false
        ? (config.exclude ?? [])
        : [...JEAP_JWE_DEFAULT_EXCLUDE_RULES, ...(config.exclude ?? [])];

    return excludeRules.some(rule =>
      this.matchesRule(rule, requestMethod, requestPath)
    );
  }

  private matchesRule(
    rule: JeapJweExcludeRule,
    requestMethod: string,
    requestPath: string
  ): boolean {
    const ruleMethod = (rule.method ?? '*').toUpperCase();

    if (ruleMethod !== '*' && ruleMethod !== requestMethod) {
      return false;
    }

    return this.matchesPath(rule.path, requestPath);
  }

  private matchesPath(pattern: string, requestPath: string): boolean {
    const normalizedPattern = this.normalizePathPattern(pattern);

    if (normalizedPattern === '/**' || normalizedPattern === '/*') {
      return true;
    }

    if (normalizedPattern.endsWith('/**')) {
      const prefix = normalizedPattern.slice(0, -3);
      return requestPath === prefix || requestPath.startsWith(`${prefix}/`);
    }

    if (normalizedPattern.includes('*')) {
      return this.globToRegExp(normalizedPattern).test(requestPath);
    }

    return requestPath === normalizedPattern;
  }

  private normalizePathPattern(pattern: string): string {
    if (pattern === '*') {
      return '/**';
    }

    return pattern.startsWith('/') ? pattern : `/${pattern}`;
  }

  private globToRegExp(pattern: string): RegExp {
    let regex = '^';

    for (let index = 0; index < pattern.length; index++) {
      const char = pattern[index];
      const nextChar = pattern[index + 1];

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

    regex += '$';

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
      exclude: config.exclude ?? [],
      responseKeyHeader: JEAP_JWE_RESPONSE_KEY_HEADER,
      contentTypeAllowlist: [...DEFAULT_CONTENT_TYPE_ALLOWLIST],
    };
  }
}
