import { HttpErrorResponse } from '@angular/common/http';

import { JeapJweError } from './jeap-jwe-error';

const RETRYABLE_BACKEND_JWE_CODE = 'JWE_UNKNOWN_KID' as const;

/**
 * Maps the explicit backend key error to a typed retryable JWE error.
 *
 * A generic HTTP 400 is never mapped because it can represent ordinary
 * validation or business errors.
 */
export function mapRetryableBackendJweError(
  error: unknown
): JeapJweError | undefined {
  if (!(error instanceof HttpErrorResponse) || error.status !== 400) {
    return undefined;
  }

  const code = extractBackendErrorCode(error.error);

  if (code !== RETRYABLE_BACKEND_JWE_CODE) {
    return undefined;
  }

  return new JeapJweError(
    'JWE_UNKNOWN_KID',
    'The backend rejected the JWE because the key identifier is unknown or no longer accepted.',
    true
  );
}

function extractBackendErrorCode(body: unknown): string | undefined {
  const parsedBody = parseBodyIfNecessary(body);

  if (!isRecord(parsedBody)) {
    return undefined;
  }

  const code = parsedBody['code'];

  return typeof code === 'string' ? code : undefined;
}

function parseBodyIfNecessary(body: unknown): unknown {
  if (typeof body !== 'string') {
    return body;
  }

  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
