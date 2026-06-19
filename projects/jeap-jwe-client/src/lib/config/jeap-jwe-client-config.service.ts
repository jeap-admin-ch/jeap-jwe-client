import { HttpBackend, HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, throwError } from 'rxjs';

import {
  JeapJweBackendConfigResponse,
  JeapJweClientConfig,
  JeapJweResolvedClientConfig,
} from './jeap-jwe-client-config';
import { JEAP_JWE_CLIENT_CONFIG } from './jeap-jwe-client.tokens';
import { JeapJweError } from '../error/jeap-jwe-error';

const DEFAULT_JWE_CONFIG_PATH = '/.well-known/jwe-config';
const DEFAULT_JWKS_PATH = '/.well-known/jwks.json';
const DEFAULT_REFRESH_INTERVAL_SECONDS = 300;

@Injectable()
export class JeapJweClientConfigService {
  private readonly backendHttp: HttpClient;
  private loadedConfig$?: Observable<JeapJweResolvedClientConfig>;

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
   * /.well-known/jwe-config from triggering their own config loading.
   */
  getLocalConfigSnapshot(): JeapJweResolvedClientConfig {
    return this.resolveConfig(undefined);
  }

  /**
   * Loads and caches the backend configuration.
   *
   * If loadBackendConfig is false, no HTTP call is made and the local
   * configuration is returned with defaults.
   */
  getConfig(): Observable<JeapJweResolvedClientConfig> {
    if (this.localConfig.loadBackendConfig === false) {
      return of(this.getLocalConfigSnapshot());
    }

    if (!this.loadedConfig$) {
      const configUrl = this.resolveConfigUrl();

      this.loadedConfig$ = this.backendHttp
        .get<JeapJweBackendConfigResponse>(configUrl)
        .pipe(
          map(backendConfig => this.resolveConfig(backendConfig)),
          catchError(cause => {
            this.loadedConfig$ = undefined;

            return throwError(
              () =>
                new JeapJweError(
                  'JWE_CONFIG_LOAD_FAILED',
                  `Failed to load JWE backend configuration from ${configUrl}.`,
                  true,
                  cause
                )
            );
          }),
          shareReplay({
            bufferSize: 1,
            refCount: false,
          })
        );
    }

    return this.loadedConfig$;
  }

  private resolveConfig(
    backendConfig: JeapJweBackendConfigResponse | undefined
  ): JeapJweResolvedClientConfig {
    const localExcludeRules = this.localConfig.exclude ?? [];
    const backendExcludeRules = backendConfig?.exclude ?? [];

    const exclude =
      this.localConfig.excludeMergeStrategy === 'override'
        ? localExcludeRules
        : [...backendExcludeRules, ...localExcludeRules];

    return {
      ...this.localConfig,
      jwksUri:
        backendConfig?.jwksUri ??
        this.localConfig.jwksPath ??
        DEFAULT_JWKS_PATH,
      refreshIntervalSeconds:
        backendConfig?.refreshIntervalSeconds ??
        DEFAULT_REFRESH_INTERVAL_SECONDS,
      exclude,
    };
  }

  private resolveConfigUrl(): string {
    return new URL(
      this.localConfig.jweConfigPath ?? DEFAULT_JWE_CONFIG_PATH,
      this.localConfig.origin
    ).toString();
  }
}
