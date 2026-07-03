import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import {
  isSecureBackendUrl,
  resolveBackendOrigin,
} from '../config/backend-url';
import { JeapJweClientConfig } from '../config/jeap-jwe-client-config';
import {
  injectAppBaseHref,
  resolveClientConfigDefaults,
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
 * The base-path prefix applies only when the backend origin is the frontend's
 * own origin; an explicitly configured cross-origin backend defaults to the
 * root well-known paths.
 *
 * The defaults are resolved at injection time so the base href can be taken
 * from an `APP_BASE_HREF` provider, falling back to the DOM `<base>` element.
 */
export function provideJeapJweClient(
  config: JeapJweClientConfig = {}
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: JEAP_JWE_CLIENT_CONFIG,
      useFactory: () => {
        const resolvedConfig = resolveClientConfigDefaults(
          config,
          injectAppBaseHref()
        );

        assertSecureBackendOrigin(resolvedConfig.origin);

        return resolvedConfig;
      },
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
