import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import {
  isSecureBackendUrl,
  resolveBackendOrigin,
} from '../config/backend-url';
import { JeapJweClientConfig } from '../config/jeap-jwe-client-config';
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
 */
export function provideJeapJweClient(
  config: JeapJweClientConfig
): EnvironmentProviders {
  assertSecureBackendOrigin(config.origin);

  return makeEnvironmentProviders([
    {
      provide: JEAP_JWE_CLIENT_CONFIG,
      useValue: config,
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
function assertSecureBackendOrigin(origin: string): void {
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
