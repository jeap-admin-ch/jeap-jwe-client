export interface JeapJweClientConfig {
  /**
   * Global switch.
   * Defaults to true.
   */
  enabled?: boolean;

  /**
   * The single supported backend origin.
   *
   * Examples:
   * - https://api.example.ch
   * - http://localhost:8080
   * - globalThis.location.origin for same-origin APIs
   */
  origin: string;

  /**
   * Local JWKS path.
   * Used as fallback when the backend metadata does not provide a JWKS path.
   *
   * Defaults to "/.well-known/jwks.json".
   */
  jwksPath?: string;

  /**
   * Backend JWE configuration (metadata) path.
   *
   * Defaults to "/.well-known/jwe-configuration".
   */
  jweConfigPath?: string;

  /**
   * Whether the client should load backend configuration from jweConfigPath.
   *
   * Defaults to true.
   */
  loadBackendConfig?: boolean;

  /**
   * Include path patterns (simple paths, no HTTP method - aligned with the
   * backend's `includedPaths`).
   *
   * A request to the configured origin is protected only when its path matches
   * an include pattern and no exclude pattern (includes are evaluated first,
   * excludes win). When backend configuration loading is enabled, the backend's
   * published `includedPaths` take precedence over this list.
   *
   * Defaults to ["/*api*\/**"] when neither the backend nor this option provide
   * include patterns.
   */
  include?: string[];

  /**
   * Exclude path patterns owned by the client (simple paths, no HTTP method -
   * aligned with the backend's `excludedPaths`).
   *
   * When backend configuration loading is enabled, the backend's published
   * `excludedPaths` (which already contain the jEAP defaults) are used as the
   * base and these client patterns are appended on top. Otherwise the client
   * default excludes apply (unless disabled via `useDefaultExcludes`) and these
   * patterns are added.
   */
  exclude?: string[];

  /**
   * Whether the client default exclude patterns should be applied.
   *
   * Only relevant when the backend does not publish its own `excludedPaths`
   * (e.g. with `loadBackendConfig: false`). Defaults to true.
   */
  useDefaultExcludes?: boolean;
}

/**
 * Backend protocol metadata served at the JWE configuration endpoint.
 *
 * The field names follow the backend contract. The backend publishes the
 * effective include/exclude path patterns; the JWKS refresh interval is a
 * client-side default.
 */
export interface JeapJweBackendConfigResponse {
  /**
   * Content types the backend accepts as JWE payloads (the `cty` value).
   */
  contentTypeAllowlist?: string[];

  /**
   * Advertised key management algorithm (informational).
   */
  keyEncryptionAlgorithm?: string;

  /**
   * Advertised content encryption method (informational).
   */
  contentEncryptionMethod?: string;

  /**
   * Path of the JWKS endpoint serving the public keys.
   *
   * Example: "/.well-known/jwks.json"
   */
  jwksPath?: string;

  /**
   * Name of the header carrying the response-key envelope.
   *
   * Example: "JWE-Response-Key"
   */
  responseKeyHeader?: string;

  /**
   * Effective include path patterns the backend's filter applies to (simple
   * paths, `PathPattern` syntax). Prefixed with the backend's context path when
   * one is configured, so they are relative to the origin root.
   *
   * Example: ["/*api*\/**"]
   */
  includedPaths?: string[];

  /**
   * Effective exclude path patterns (simple paths, `PathPattern` syntax),
   * already including the jEAP defaults (actuator, JWKS and protocol-metadata
   * endpoints, SSE). Prefixed with the backend's context path when one is
   * configured, so they are relative to the origin root.
   *
   * Example: ["/actuator/**", "/.well-known/jwks.json", "/.well-known/jwe-configuration"]
   */
  excludedPaths?: string[];
}

export interface JeapJweResolvedClientConfig extends JeapJweClientConfig {
  /**
   * Effective JWKS URI after merging local and backend configuration.
   */
  jwksUri: string;

  /**
   * Effective refresh interval in seconds.
   */
  refreshIntervalSeconds: number;

  /**
   * Effective include path patterns (defaults and backend metadata already
   * merged in).
   */
  include: string[];

  /**
   * Effective exclude path patterns (defaults, backend metadata and local
   * patterns already merged in).
   */
  exclude: string[];

  /**
   * Effective header name carrying the response-key envelope.
   */
  responseKeyHeader: string;

  /**
   * Effective content types the backend accepts as JWE payloads.
   */
  contentTypeAllowlist: string[];
}

/**
 * Per-request protocol settings the encryption pipeline needs.
 *
 * Intentionally minimal: it carries only the values used while protecting a
 * request, not the full resolved configuration.
 */
export interface JeapJweProtocolSettings {
  /**
   * Header name carrying the encrypted response CEK.
   */
  readonly responseKeyHeader: string;

  /**
   * Content types the backend accepts as JWE payloads (the `cty` value).
   */
  readonly contentTypeAllowlist: readonly string[];
}

export interface JeapJweEndpointMatch {
  method: string;
  url: string;
  origin: string;
  path: string;

  /**
   * Protocol settings used while protecting this request.
   */
  protocol: JeapJweProtocolSettings;
}
