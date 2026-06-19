import { InjectionToken } from '@angular/core';
import { JeapJweClientConfig } from './jeap-jwe-client-config';

export const JEAP_JWE_CLIENT_CONFIG = new InjectionToken<JeapJweClientConfig>(
  'JEAP_JWE_CLIENT_CONFIG'
);
