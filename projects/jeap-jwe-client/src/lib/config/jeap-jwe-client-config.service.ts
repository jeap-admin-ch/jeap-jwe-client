import { HttpBackend, HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import {
  catchError,
  defer,
  finalize,
  map,
  Observable,
  of,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';

import { isSecureBackendUrl, resolveBackendOrigin } from './backend-url';

import {
  JeapJweBackendConfigResponse,
  JeapJweClientConfig,
  JeapJweResolvedClientConfig,
} from './jeap-jwe-client-config';
import {
  DEFAULT_CONTENT_TYPE_ALLOWLIST,
  DEFAULT_JWE_CONFIG_PATH,
  DEFAULT_JWKS_PATH,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  resolveExcludedPaths,
  resolveIncludedPaths,
} from './jeap-jwe-defaults';
import { JEAP_JWE_CLIENT_CONFIG } from './jeap-jwe-client.tokens';
import { JEAP_JWE_RESPONSE_KEY_HEADER } from '../crypto/jwe-algorithms';
import { JeapJweError } from '../error/jeap-jwe-error';

@Injectable()
export class JeapJweClientConfigService {
  private readonly backendHttp: HttpClient;
  private resolvedConfig?: JeapJweResolvedClientConfig;
  private inFlightConfig$?: Observable<JeapJweResolvedClientConfig>;

  constructor(
    @Inject(JEAP_JWE_CLIENT_CONFIG)
    private readonly localConfig: JeapJweClientConfig,
    httpBackend: HttpBackend
  ) {
    /**
     * This HttpClient intentionally bypasses Angular interceptors.
     * The JWE backend config request must never be encrypted by this library.
     */
    this.backendHttp = new HttpClient(httpBackend);
  }

  /**
   * Returns the local configuration resolved with defaults.
   *
   * The interceptor uses this snapshot only for the enabled flag and the
   * configured backend origin; it is also the effective configuration when
   * `loadBackendConfig` is `false`. Include and exclude decisions before the
   * backend configuration is available are made against
   * {@link getStableExclusionPatterns} instead.
   */
  getLocalConfigSnapshot(): JeapJweResolvedClientConfig {
    return this.resolveConfig(undefined);
  }

  /**
   * Returns the exclusion patterns that are stable before the backend
   * configuration is available:
   *
   * - the local `exclude` patterns, which are always appended to the
   *   effective exclude list, so a match is final, and
   * - the resolved discovery endpoints (the JWE configuration and JWKS
   *   paths), which are always exempt from JWE protection by construction -
   *   including context-path-prefixed paths that the default exclude
   *   patterns would not cover.
   *
   * The client default excludes are deliberately NOT part of this list: the
   * backend's published `excludedPaths` replace them, so a default-exclude
   * match is not a stable decision and must be made against the effective
   * configuration.
   */
  getStableExclusionPatterns(): string[] {
    return [
      ...(this.localConfig.exclude ?? []),
      this.resolvePathname(
        this.localConfig.jweConfigPath ?? DEFAULT_JWE_CONFIG_PATH
      ),
      this.resolvePathname(this.localConfig.jwksPath ?? DEFAULT_JWKS_PATH),
    ];
  }

  private resolvePathname(path: string): string {
    return new URL(path, resolveBackendOrigin(this.localConfig.origin))
      .pathname;
  }

  /**
   * Loads and caches the backend configuration.
   *
   * If loadBackendConfig is false, no HTTP call is made and the local
   * configuration is returned with defaults. A failed load is never cached:
   * the next call retries.
   */
  getConfig(): Observable<JeapJweResolvedClientConfig> {
    if (this.localConfig.loadBackendConfig === false) {
      return of(this.getLocalConfigSnapshot());
    }

    if (this.resolvedConfig) {
      return of(this.resolvedConfig);
    }

    if (!this.inFlightConfig$) {
      this.inFlightConfig$ = defer(() =>
        this.backendHttp.get<JeapJweBackendConfigResponse>(
          this.resolveConfigUrl()
        )
      ).pipe(
        map(backendConfig => this.resolveConfig(backendConfig)),
        tap(resolved => {
          this.resolvedConfig = resolved;
        }),
        catchError(cause =>
          throwError(() =>
            cause instanceof JeapJweError
              ? cause
              : new JeapJweError(
                  'JWE_CONFIG_LOAD_FAILED',
                  'Failed to load the JWE backend configuration.',
                  true,
                  cause
                )
          )
        ),
        /**
         * Clearing the in-flight stream on both success and error means a
         * failed load is not retained, so the next getConfig() retries.
         */
        finalize(() => {
          this.inFlightConfig$ = undefined;
        }),
        shareReplay({
          bufferSize: 1,
          refCount: true,
        })
      );
    }

    return this.inFlightConfig$;
  }

  private resolveConfig(
    backendConfig: JeapJweBackendConfigResponse | undefined
  ): JeapJweResolvedClientConfig {
    return {
      ...this.localConfig,
      jwksUri:
        backendConfig?.jwksPath ??
        this.localConfig.jwksPath ??
        DEFAULT_JWKS_PATH,
      refreshIntervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS,
      include: resolveIncludedPaths(this.localConfig, backendConfig),
      exclude: resolveExcludedPaths(this.localConfig, backendConfig),
      responseKeyHeader:
        backendConfig?.responseKeyHeader ?? JEAP_JWE_RESPONSE_KEY_HEADER,
      contentTypeAllowlist: backendConfig?.contentTypeAllowlist ?? [
        ...DEFAULT_CONTENT_TYPE_ALLOWLIST,
      ],
    };
  }

  private resolveConfigUrl(): string {
    const base = resolveBackendOrigin(this.localConfig.origin);
    const configUrl = new URL(
      this.localConfig.jweConfigPath ?? DEFAULT_JWE_CONFIG_PATH,
      base
    );

    if (configUrl.origin !== base.origin || !isSecureBackendUrl(configUrl)) {
      throw new JeapJweError(
        'JWE_CONFIG_LOAD_FAILED',
        'The JWE configuration endpoint must be served over HTTPS on the configured backend origin.'
      );
    }

    return configUrl.toString();
  }
}
