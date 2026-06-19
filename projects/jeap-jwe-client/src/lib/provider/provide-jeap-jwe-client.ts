import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { JeapJweClientConfig } from '../config/jeap-jwe-client-config';
import { JeapJweClientConfigService } from '../config/jeap-jwe-client-config.service';
import { JEAP_JWE_CLIENT_CONFIG } from '../config/jeap-jwe-client.tokens';
import { JoseJweRequestEncryptor } from '../crypto/jose-jwe-request-encryptor';
import { JweRequestEncryptor } from '../crypto/jwe-request-encryptor';
import {
  JweResponseDecryptor,
} from '../crypto/jwe-response-decryptor';
import { jeapJweInterceptor } from '../interceptor/jeap-jwe.interceptor';
import { JweKeySelector } from '../jwks/jwe-key-selector';
import { JwksCache } from '../jwks/jwks-cache';
import { JwksClient } from '../jwks/jwks-client';
import { JwksRefreshService } from '../jwks/jwks-refresh.service';
import { JweEndpointMatcher } from '../matcher/jwe-endpoint-matcher';
import {JoseJweResponseDecryptor} from "../crypto/jose-jwe-response-decryptor";

export function provideJeapJweClient(
  config: JeapJweClientConfig
): EnvironmentProviders {
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

    provideHttpClient(withInterceptors([jeapJweInterceptor])),
  ]);
}
