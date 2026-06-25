import { HttpErrorResponse } from '@angular/common/http';

import { JeapJweError, JeapJweErrorCode } from './jeap-jwe-error';

interface BackendErrorMapping {
  readonly code: JeapJweErrorCode;
  readonly retryable: boolean;
  readonly message: string;
}

/**
 * The only backend code that triggers an automatic JWKS refresh and retry.
 */
const RETRYABLE_BACKEND_JWE_CODE: JeapJweErrorCode = 'JWE_UNKNOWN_KEY_ID';

/**
 * Maps the backend problem+json `code` values to typed client errors.
 *
 * Only the unknown-key-id code is retryable; the backend rejects an unknown
 * key identifier while decrypting the request, before any controller or
 * side-effecting logic runs, which makes a single retry safe.
 */
const BACKEND_ERROR_MAPPINGS: Readonly<Record<string, BackendErrorMapping>> = {
  JWE_REQUEST_ENCRYPTION_REQUIRED: {
    code: 'JWE_REQUEST_ENCRYPTION_REQUIRED',
    retryable: false,
    message: 'The backend requires an encrypted request body.',
  },
  JWE_RESPONSE_ENCRYPTION_REQUIRED: {
    code: 'JWE_RESPONSE_ENCRYPTION_REQUIRED',
    retryable: false,
    message: 'The backend only returns encrypted responses.',
  },
  JWE_RESPONSE_KEY_REQUIRED: {
    code: 'JWE_RESPONSE_KEY_REQUIRED',
    retryable: false,
    message: 'The backend requires a response-key envelope.',
  },
  JWE_RESPONSE_KEY_INVALID: {
    code: 'JWE_RESPONSE_KEY_INVALID',
    retryable: false,
    message: 'The backend rejected the response-key envelope as invalid.',
  },
  JWE_INVALID_CONTENT_TYPE: {
    code: 'JWE_INVALID_CONTENT_TYPE',
    retryable: false,
    message: 'The backend rejected the JWE content type.',
  },
  JWE_PAYLOAD_TOO_LARGE: {
    code: 'JWE_PAYLOAD_TOO_LARGE',
    retryable: false,
    message:
      'The encrypted request exceeds the maximum size accepted by the backend.',
  },
  JWE_MALFORMED: {
    code: 'JWE_MALFORMED',
    retryable: false,
    message: 'The backend could not parse or decrypt the request JWE.',
  },
  JWE_UNSUPPORTED_ALGORITHM: {
    code: 'JWE_UNSUPPORTED_ALGORITHM',
    retryable: false,
    message: 'The backend rejected the JWE algorithms.',
  },
  JWE_UNKNOWN_KEY_ID: {
    code: RETRYABLE_BACKEND_JWE_CODE,
    retryable: true,
    message:
      'The backend rejected the JWE because the key identifier is unknown or no longer accepted.',
  },
};

/**
 * Maps a backend error response to a typed JWE error.
 *
 * Returns undefined for non-HTTP errors and for HTTP errors without a
 * recognized JWE `code`, so ordinary HTTP and business errors pass through
 * unchanged.
 */
export function mapBackendJweError(error: unknown): JeapJweError | undefined {
  if (!(error instanceof HttpErrorResponse)) {
    return undefined;
  }

  const code = extractBackendErrorCode(error.error);

  if (code === undefined) {
    return undefined;
  }

  const mapping = BACKEND_ERROR_MAPPINGS[code];

  if (mapping === undefined) {
    return undefined;
  }

  return new JeapJweError(
    mapping.code,
    mapping.message,
    mapping.retryable,
    error
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
