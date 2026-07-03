import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import {
  deriveBasePath,
  isSecureBackendUrl,
  resolveBackendOrigin,
} from '../config/backend-url';
import { JeapJweClientConfig } from '../config/jeap-jwe-client-config';
import {
  DEFAULT_JWE_CONFIG_PATH,
  DEFAULT_JWKS_PATH,
} from '../config/jeap-jwe-defaults';
import { JeapJweClientConfigService } from '../config/jeap-jwe-client-config.service';
import { JEAP_JWE_CLIENT_CONFIG } from '../config/jeap-jwe-client.tokens';
import { JoseJweRequestEncryptor } from '../crypto/jose-jwe-request-encryptor';
import { JoseJweResponseDecryptor } from '../crypto/jose-jwe-response-decryptor';
import { JweRequestEncryptor } from '../crypto/jwe-request-encryptor';
import { JweResponseDecryptor } from '../crypto/jwe-response-decryptor';
import { JweKeySelector } from '../jwks/jwe-key-selector';
import { JwksCache } from '../jwks/jwks-cache';
import { JwksClient } from '../jwks/jwks-client';
import { JwksRefreshService } from '../jwks/jwks-refresh.service';
import { JweEndpointMatcher } from '../matcher/jwe-endpoint-matcher';

/**
 * Registers the JWE client services and configuration.
 *
 * The consuming application owns its `HttpClient` setup and must register the
 * interceptor itself, e.g.
 * `provideHttpClient(withInterceptors([jeapJweInterceptor]))`. This keeps the
 * application in control of interceptor ordering and other HttpClient features.
 *
 * All options have defaults suited to the standard jEAP SCS deployment where
 * the frontend is served by its backend's web server: the backend origin
 * defaults to the frontend's own origin, and the discovery endpoint paths
 * default to the application base path (the Angular base href, which matches
 * the backend's servlet context path in that deployment) plus the well-known
 * paths - so `provideJeapJweClient()` without options is a complete setup.
 */
export function provideJeapJweClient(
  config: JeapJweClientConfig = {}
): EnvironmentProviders {
  const resolvedConfig = withBrowserDefaults(config);

  assertSecureBackendOrigin(resolvedConfig.origin);

  return makeEnvironmentProviders([
    {
      provide: JEAP_JWE_CLIENT_CONFIG,
      useValue: resolvedConfig,
    },

    JeapJweClientConfigService,
    JweEndpointMatcher,

    JwksClient,
    JwksCache,
    JwksRefreshService,
    JweKeySelector,

    {
      provide: JweRequestEncryptor,
      useClass: JoseJweRequestEncryptor,
    },

    {
      provide: JweResponseDecryptor,
      useClass: JoseJweResponseDecryptor,
    },
  ]);
}

/**
 * Fills the deployment-dependent defaults from the browser environment: the
 * frontend's own origin and the base-path-prefixed discovery endpoint paths.
 * Outside a browser (e.g. SSR), omitted values stay unset and the origin must
 * be configured explicitly.
 */
function withBrowserDefaults(config: JeapJweClientConfig): JeapJweClientConfig {
  const basePath = deriveBasePath();

  return {
    ...config,
    origin: config.origin ?? globalThis.location?.origin,
    jweConfigPath:
      config.jweConfigPath ?? `${basePath}${DEFAULT_JWE_CONFIG_PATH}`,
    jwksPath: config.jwksPath ?? `${basePath}${DEFAULT_JWKS_PATH}`,
  };
}

/**
 * Fails fast when the configured backend origin is not served over a secure
 * transport. Plaintext HTTP is only tolerated for localhost development.
 */
function assertSecureBackendOrigin(origin?: string): void {
  let originUrl: URL;

  try {
    originUrl = resolveBackendOrigin(origin);
  } catch {
    /**
     * A relative origin inherits the page scheme at runtime, which the browser
     * validates. Nothing to check ahead of time.
     */
    return;
  }

  if (!isSecureBackendUrl(originUrl)) {
    throw new Error(
      `jeap-jwe-client: the backend origin "${origin}" must use HTTPS. ` +
        'Plaintext HTTP is only allowed for localhost.'
    );
  }
}
