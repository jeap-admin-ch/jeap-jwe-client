export const JWE_TEST_JWKS_PATH = '/.well-known/jwks.json';
export const JWE_TEST_CONFIG_PATH = '/.well-known/jwe-config';

export const JWE_TEST_PROTECTED_PERSONS_PATH = '/api/persons';
export const JWE_TEST_PROTECTED_PERSON_PATH = '/api/persons/123';
export const JWE_TEST_EXCLUDED_HEALTH_PATH = '/actuator/health';

export interface CreatePersonRequest {
  name: string;
}

export interface PersonResponse {
  id: number;
  name: string;
}

export interface HealthResponse {
  status: string;
}

export function currentTestOrigin(): string {
  return globalThis.location.origin;
}

/**
 * Lets promise-based crypto and RxJS continuations progress in integration tests.
 *
 * The JWE pipeline uses jose/WebCrypto promises, so the encrypted API request
 * is not always visible synchronously right after flushing JWKS.
 */
export async function waitForJweAsyncPipeline(): Promise<void> {
  await Promise.resolve();

  await new Promise<void>(resolve => {
    setTimeout(resolve, 0);
  });

  await Promise.resolve();
}
