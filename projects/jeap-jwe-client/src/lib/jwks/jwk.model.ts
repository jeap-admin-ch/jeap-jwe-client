import { JeapJweResolvedClientConfig } from '../config/jeap-jwe-client-config';

/**
 * Public RSA JWKs accepted by the JWE client.
 *
 * The backend publishes only public parameters. The client rejects
 * key sets that contain private RSA key parameters.
 */
export interface JeapJwePublicJwk {
  readonly kty: 'RSA';
  readonly kid: string;
  readonly use: 'enc';
  readonly alg: 'RSA-OAEP-256';
  readonly n: string;
  readonly e: string;

  /**
   * Allows standard optional public JWK members such as x5c, x5t or key_ops.
   */
  readonly [parameter: string]: unknown;
}

/**
 * In-memory representation of a validated and indexed JWKS response.
 *
 * The keys array preserves the backend-provided order. The backend contract
 * defines keys[0] as the newest active encryption key.
 */
export interface JeapJwksSnapshot {
  readonly keys: readonly JeapJwePublicJwk[];
  readonly keysByKid: ReadonlyMap<string, JeapJwePublicJwk>;
  readonly loadedAt: number;
  readonly jwksUri: string;
  readonly refreshIntervalSeconds: number;
  readonly config: JeapJweResolvedClientConfig;
}
