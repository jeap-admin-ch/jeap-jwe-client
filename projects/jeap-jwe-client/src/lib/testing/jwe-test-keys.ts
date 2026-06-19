import { exportJWK, generateKeyPair } from 'jose';
import type { JWK } from 'jose';

import { JeapJwePublicJwk } from '../jwks/jwk.model';

export interface JeapJweTestKeyPair {
  readonly kid: string;
  readonly publicKey: CryptoKey;
  readonly privateKey: CryptoKey;
  readonly publicJwk: JeapJwePublicJwk;
}

/**
 * Creates an RSA test key pair for request JWE encryption tests.
 *
 * Test keys are generated at runtime so no private key material is committed
 * to the repository.
 */
export async function createJeapJweTestKeyPair(
  kid: string
): Promise<JeapJweTestKeyPair> {
  const keyPair = await generateKeyPair('RSA-OAEP-256', {
    extractable: true,
    modulusLength: 2048,
  });

  const exportedPublicJwk = await exportJWK(keyPair.publicKey);

  const publicJwk: JeapJwePublicJwk = {
    ...exportedPublicJwk,
    kty: 'RSA',
    kid,
    use: 'enc',
    alg: 'RSA-OAEP-256',
    n: requireJwkStringParameter(exportedPublicJwk, 'n'),
    e: requireJwkStringParameter(exportedPublicJwk, 'e'),
  };

  return {
    kid,
    publicKey: keyPair.publicKey as CryptoKey,
    privateKey: keyPair.privateKey as CryptoKey,
    publicJwk,
  };
}

function requireJwkStringParameter(
  jwk: JWK,
  parameterName: keyof JWK
): string {
  const value = jwk[parameterName];

  if (typeof value !== 'string') {
    throw new Error(`Generated test JWK is missing "${String(parameterName)}".`);
  }

  return value;
}
