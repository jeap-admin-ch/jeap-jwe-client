/*
 * Public API of jeap-jwe-client.
 *
 * Only the symbols a consuming application needs are exported. Internal
 * services (config, JWKS, crypto, matcher) are implementation details wired up
 * by provideJeapJweClient and are intentionally not part of the public API.
 */

export { provideJeapJweClient } from './lib/provider/provide-jeap-jwe-client';
export { jeapJweInterceptor } from './lib/interceptor/jeap-jwe.interceptor';

export { JEAP_JWE_CLIENT_CONFIG } from './lib/config/jeap-jwe-client.tokens';
export type { JeapJweClientConfig } from './lib/config/jeap-jwe-client-config';

export { JeapJweError } from './lib/error/jeap-jwe-error';
export type { JeapJweErrorCode } from './lib/error/jeap-jwe-error';
