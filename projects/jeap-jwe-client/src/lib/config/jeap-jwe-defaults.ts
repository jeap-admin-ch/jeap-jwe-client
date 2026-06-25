/**
 * Default protocol values shared by the configuration service and the endpoint
 * matcher. Keeping them in a single module prevents the resolved-configuration
 * defaults from drifting apart.
 */

/**
 * Default path of the backend JWE configuration (metadata) endpoint.
 */
export const DEFAULT_JWE_CONFIG_PATH = '/.well-known/jwe-configuration';

/**
 * Default path of the JWKS endpoint, used when the backend metadata does not
 * provide one.
 */
export const DEFAULT_JWKS_PATH = '/.well-known/jwks.json';

/**
 * Default JWKS refresh interval in seconds.
 */
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 300;

/**
 * Default set of content types the backend accepts as JWE payloads, used when
 * the backend metadata does not advertise an allowlist.
 */
export const DEFAULT_CONTENT_TYPE_ALLOWLIST: readonly string[] = [
  'application/json',
];
