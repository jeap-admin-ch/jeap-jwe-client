/**
 * Default protocol values shared by the configuration service and the endpoint
 * matcher. Keeping them in a single module prevents the resolved-configuration
 * defaults from drifting apart.
 */

import {
  JeapJweBackendConfigResponse,
  JeapJweClientConfig,
} from './jeap-jwe-client-config';

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

/**
 * Default include pattern, used when neither the backend metadata nor the local
 * configuration provide one. Mirrors the jEAP backend default
 * (`jeap.jwe.filter.included-paths`): any path whose first segment contains
 * `api` and everything under it (e.g. `/api`, `/api/orders`, `/v1api/x`).
 */
export const DEFAULT_INCLUDED_PATHS: readonly string[] = ['/*api*/**'];

/**
 * Default exclude patterns applied (unless turned off via `useDefaultExcludes`)
 * when the backend metadata does not publish its own exclude list. They keep
 * application discovery and technical health endpoints unencrypted, mirroring
 * the jEAP backend defaults (actuator, the JWKS and protocol-metadata
 * endpoints).
 */
export const DEFAULT_EXCLUDED_PATHS: readonly string[] = [
  '/.well-known/**',
  '/actuator/**',
  '/health',
];

/**
 * Resolves the effective include patterns. The backend's published
 * `includedPaths` are authoritative when present; otherwise the local
 * configuration is used, falling back to {@link DEFAULT_INCLUDED_PATHS}.
 *
 * A request to the configured origin is protected only when its path matches an
 * include pattern and no exclude pattern (includes are evaluated first).
 */
export function resolveIncludedPaths(
  localConfig: JeapJweClientConfig,
  backendConfig?: JeapJweBackendConfigResponse
): string[] {
  if (backendConfig?.includedPaths && backendConfig.includedPaths.length > 0) {
    return [...backendConfig.includedPaths];
  }

  if (localConfig.include && localConfig.include.length > 0) {
    return [...localConfig.include];
  }

  return [...DEFAULT_INCLUDED_PATHS];
}

/**
 * Resolves the effective exclude patterns. The backend's published
 * `excludedPaths` are authoritative when present (they already contain the jEAP
 * defaults); otherwise the client default excludes are used unless
 * `useDefaultExcludes` is `false`. Local exclude patterns are always appended,
 * so the client can exclude extra paths in addition to the backend's list.
 */
export function resolveExcludedPaths(
  localConfig: JeapJweClientConfig,
  backendConfig?: JeapJweBackendConfigResponse
): string[] {
  const localExcludes = localConfig.exclude ?? [];

  if (backendConfig?.excludedPaths) {
    return [...backendConfig.excludedPaths, ...localExcludes];
  }

  const base =
    localConfig.useDefaultExcludes === false ? [] : [...DEFAULT_EXCLUDED_PATHS];

  return [...base, ...localExcludes];
}
