import { HttpErrorResponse } from '@angular/common/http';

import { JeapJweError } from './jeap-jwe-error';
import { mapBackendJweError } from './jwe-backend-error-mapper';

describe('mapBackendJweError', () => {
  function backendError(status: number, code: string): HttpErrorResponse {
    return new HttpErrorResponse({
      status,
      statusText: 'Error',
      error: { code },
    });
  }

  it('maps the unknown-key-id problem response to a retryable typed error', () => {
    const mappedError = mapBackendJweError(
      backendError(400, 'JWE_UNKNOWN_KEY_ID')
    );

    expect(mappedError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_UNKNOWN_KEY_ID',
        retryable: true,
      })
    );

    expect(mappedError instanceof JeapJweError).toBeTrue();
  });

  it('maps backend enforcement codes to non-retryable typed errors', () => {
    const nonRetryableCodes = [
      'JWE_REQUEST_ENCRYPTION_REQUIRED',
      'JWE_RESPONSE_ENCRYPTION_REQUIRED',
      'JWE_RESPONSE_KEY_REQUIRED',
      'JWE_RESPONSE_KEY_INVALID',
      'JWE_INVALID_CONTENT_TYPE',
      'JWE_PAYLOAD_TOO_LARGE',
      'JWE_MALFORMED',
      'JWE_UNSUPPORTED_ALGORITHM',
    ];

    for (const code of nonRetryableCodes) {
      const mappedError = mapBackendJweError(backendError(400, code));

      expect(mappedError).toEqual(
        jasmine.objectContaining({ code, retryable: false })
      );
    }
  });

  it('parses a JSON string error body', () => {
    const stringBodyError = new HttpErrorResponse({
      status: 413,
      statusText: 'Payload Too Large',
      error: JSON.stringify({ code: 'JWE_PAYLOAD_TOO_LARGE' }),
    });

    expect(mapBackendJweError(stringBodyError)).toEqual(
      jasmine.objectContaining({ code: 'JWE_PAYLOAD_TOO_LARGE' })
    );
  });

  it('does not map ordinary validation errors', () => {
    expect(
      mapBackendJweError(backendError(400, 'VALIDATION_FAILED'))
    ).toBeUndefined();
  });

  it('does not map errors without a code field', () => {
    const noCodeError = new HttpErrorResponse({
      status: 400,
      statusText: 'Bad Request',
      error: { message: 'oops' },
    });

    expect(mapBackendJweError(noCodeError)).toBeUndefined();
  });

  it('does not map non-HTTP errors', () => {
    expect(mapBackendJweError(new Error('client side'))).toBeUndefined();
  });
});
