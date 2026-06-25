import { HttpErrorResponse } from '@angular/common/http';

import { JeapJweError } from './jeap-jwe-error';
import { mapRetryableBackendJweError } from './jwe-backend-error-mapper';

describe('mapRetryableBackendJweError', () => {
  it('maps an unknown-kid problem response to a retryable typed error', () => {
    const backendError = new HttpErrorResponse({
      status: 400,
      statusText: 'Bad Request',
      error: {
        code: 'JWE_UNKNOWN_KID',
      },
    });

    const mappedError = mapRetryableBackendJweError(backendError);

    expect(mappedError).toEqual(
      jasmine.objectContaining({
        name: 'JeapJweError',
        code: 'JWE_UNKNOWN_KID',
        retryable: true,
      })
    );

    expect(mappedError instanceof JeapJweError).toBeTrue();
  });

  it('does not map ordinary validation errors', () => {
    const backendError = new HttpErrorResponse({
      status: 400,
      statusText: 'Bad Request',
      error: {
        code: 'VALIDATION_FAILED',
      },
    });

    expect(mapRetryableBackendJweError(backendError)).toBeUndefined();
  });

  it('does not map non-400 responses', () => {
    const backendError = new HttpErrorResponse({
      status: 500,
      statusText: 'Internal Server Error',
      error: {
        code: 'ANOTHER_CODE',
      },
    });

    expect(mapRetryableBackendJweError(backendError)).toBeUndefined();
  });
});
