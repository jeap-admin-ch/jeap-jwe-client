import { HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';

import { JeapJweEndpointMatch } from '../config/jeap-jwe-client-config';

export interface JeapJweRequestContext {
  method: string;
  url: string;
  path: string;
  match: JeapJweEndpointMatch;

  /**
   * The original request media type before replacing the body with a JWE.
   */
  originalRequestContentType?: string;

  /**
   * The original Angular response type before forcing the transport response
   * to text for compact JWE handling.
   */
  originalResponseType: 'arraybuffer' | 'blob' | 'json' | 'text';

  /**
   * Request-local CEK used by the response decryptor.
   *
   * This key must never be logged, persisted, cached, or exposed outside
   * the request/response pipeline.
   */
  responseContentEncryptionKey: Uint8Array;
}

export interface JeapJweEncryptedRequest {
  request: HttpRequest<unknown>;
  context: JeapJweRequestContext;
}

export abstract class JweRequestEncryptor {
  abstract encrypt(
    request: HttpRequest<unknown>,
    match: JeapJweEndpointMatch
  ): Observable<JeapJweEncryptedRequest>;
}
