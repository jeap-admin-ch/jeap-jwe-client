import { HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

import { JeapJweRequestContext } from './jwe-request-encryptor';

export abstract class JweResponseDecryptor {
  abstract decrypt(
    response: HttpResponse<unknown>,
    context: JeapJweRequestContext
  ): Observable<HttpResponse<unknown>>;
}
