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
   * This is used as a cheap pre-match before the backend configuration
   * is loaded. It prevents excluded infrastructure endpoints such as
   * the JWE configuration endpoint from triggering their own config loading.
   */
  getLocalConfigSnapshot(): JeapJweResolvedClientConfig {
    return this.resolveConfig(undefined);
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
      exclude: this.localConfig.exclude ?? [],
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
