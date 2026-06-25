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
   * Exclude rules owned by the client.
   *
   * Pure blacklist semantics: every request targeting the configured backend
   * origin is protected unless it matches an exclude rule. The backend does not
   * publish exclude rules, so path exclusions are defined entirely on the client.
   */
  exclude?: JeapJweExcludeRule[];

  /**
   * Whether default exclude rules should be applied.
   *
   * Defaults to true.
   */
  useDefaultExcludes?: boolean;
}

/**
 * Backend protocol metadata served at the JWE configuration endpoint.
 *
 * The field names follow the backend contract. The backend does not publish
 * exclude rules or a refresh interval, so those are owned by the client.
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
   * Effective exclude rules.
   */
  exclude: JeapJweExcludeRule[];

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

export interface JeapJweExcludeRule {
  /**
   * HTTP method.
   *
   * Examples:
   * - GET
   * - POST
   * - PUT
   * - PATCH
   * - DELETE
   * - *
   *
   * Undefined means "*".
   */
  method?: string;

  /**
   * Path pattern.
   *
   * Supported examples:
   * - /health
   * - /actuator/**
   * - /.well-known/**
   * - /api/{wildcard}/metadata
   * - /**
   */
  path: string;
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
