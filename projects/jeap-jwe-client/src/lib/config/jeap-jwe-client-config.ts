export type JeapJweExcludeMergeStrategy = 'extend' | 'override';

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
   * Used as fallback when the backend config does not provide jwksUri.
   *
   * Defaults to "/.well-known/jwks.json".
   */
  jwksPath?: string;

  /**
   * Backend JWE configuration path.
   *
   * Defaults to "/.well-known/jwe-config".
   */
  jweConfigPath?: string;

  /**
   * Whether the client should load backend configuration from jweConfigPath.
   *
   * Defaults to true.
   */
  loadBackendConfig?: boolean;

  /**
   * Local exclude rules.
   *
   * Pure blacklist semantics:
   * every request targeting the configured backend origin is protected
   * unless it matches an exclude rule.
   */
  exclude?: JeapJweExcludeRule[];

  /**
   * Whether default exclude rules should be applied.
   *
   * Defaults to true.
   */
  useDefaultExcludes?: boolean;

  /**
   * Controls how backend-provided exclude rules and local exclude rules are combined.
   *
   * extend:
   *   backend exclude rules + local exclude rules
   *
   * override:
   *   only local exclude rules
   *
   * Defaults to "extend".
   */
  excludeMergeStrategy?: JeapJweExcludeMergeStrategy;
}

export interface JeapJweBackendConfigResponse {
  /**
   * JWKS URI returned by the backend.
   *
   * Example: "/.well-known/jwks.json"
   */
  jwksUri?: string;

  /**
   * Suggested JWKS refresh interval in seconds.
   */
  refreshIntervalSeconds?: number;

  /**
   * Backend-provided exclude rules.
   */
  exclude?: JeapJweExcludeRule[];
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
   * Effective exclude rules after merging local and backend configuration.
   */
  exclude: JeapJweExcludeRule[];
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
   * Effective client configuration used for this request.
   */
  config: JeapJweResolvedClientConfig;
}
