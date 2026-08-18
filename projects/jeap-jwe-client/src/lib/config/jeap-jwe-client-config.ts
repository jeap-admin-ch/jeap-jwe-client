export interface JeapJweClientConfig {
  /**
   * Global switch.
   *
   * Leave it unset to follow the backend: when backend configuration loading is
   * enabled, the backend's published `enabled` (its `jeap.jwe.enabled` master
   * switch) decides. That is what lets one frontend build run against a stage
   * with JWE turned on and a stage with it turned off. An explicit value here
   * always wins over the backend's, so an application that wants encryption
   * enforced regardless can pin `true`.
   *
   * Defaults to true when neither this option nor the backend provides a value.
   *
   * Setting it to `false` short-circuits the interceptor before any backend
   * configuration is loaded, so no metadata request is made at all.
   */
  enabled?: boolean;

  /**
   * The single supported backend origin.
   *
   * Defaults to the frontend's own origin (`globalThis.location.origin`) -
   * the standard jEAP SCS deployment where the frontend is served by its
   * backend's web server. Configure it only for cross-origin backends.
   *
   * Examples:
   * - https://api.example.ch
   * - http://localhost:8080
   */
  origin?: string;

  /**
   * Local JWKS path.
   * Used as fallback when the backend metadata does not provide a JWKS path.
   *
   * Defaults to "<base path>/.well-known/jwks.json" when the backend origin
   * is the frontend's own origin: for a frontend served by its backend under
   * a servlet context path, the base path (the Angular base href, from an
   * `APP_BASE_HREF` provider or the `<base>` element) matches the context
   * path, so the default points at the backend's JWKS endpoint without any
   * configuration. For an explicitly configured cross-origin backend it
   * defaults to the root "/.well-known/jwks.json".
   */
  jwksPath?: string;

  /**
   * Backend JWE configuration (metadata) path.
   *
   * Defaults to "<base path>/.well-known/jwe-configuration" when the backend
   * origin is the frontend's own origin: for a frontend served by its backend
   * under a servlet context path, the base path (the Angular base href, from
   * an `APP_BASE_HREF` provider or the `<base>` element) matches the context
   * path, so the default points at the backend's metadata endpoint without
   * any configuration. For an explicitly configured cross-origin backend it
   * defaults to the root "/.well-known/jwe-configuration".
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
 * A {@link JeapJweClientConfig} whose environment-dependent defaults have been
 * resolved (see `resolveClientConfigDefaults`): the discovery endpoint paths
 * are always set; the origin is set whenever a document origin is available to
 * default to.
 */
export interface JeapJweClientConfigWithDefaults extends JeapJweClientConfig {
  jweConfigPath: string;
  jwksPath: string;
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
   * The backend's master switch (`jeap.jwe.enabled`). A backend that has JWE
   * turned off keeps serving this endpoint and publishes `false` here, with
   * empty path lists and no algorithms - that is the only signal the client
   * accepts as "the backend has encryption off".
   *
   * A *failed* metadata load is deliberately not treated the same way: a
   * mistyped `jweConfigPath` or an unreachable backend would then silently
   * downgrade every request to plaintext. The client keeps failing closed with
   * `JWE_CONFIG_LOAD_FAILED` instead. Backends older than the release that
   * introduced this field answer 404 while disabled, so a frontend talking to
   * one still has to set `enabled: false` locally.
   */
  enabled?: boolean;

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
   * Effective global switch after merging local and backend configuration: the
   * local option when it is set, otherwise the backend's published `enabled`,
   * otherwise `true`.
   */
  enabled: boolean;

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
