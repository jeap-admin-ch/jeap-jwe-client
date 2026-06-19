import { TestRequest } from '@angular/common/http/testing';
import { decodeProtectedHeader } from 'jose';

import { JEAP_JWE_RESPONSE_KEY_HEADER } from '../crypto/jwe-algorithms';

export class JeapJweTestTrace {
  constructor(private readonly enabled: boolean = false) {}

  section(title: string): void {
    if (!this.enabled) {
      return;
    }

    console.info(`\n[JWE integration] ${title}`);
  }

  message(message: string): void {
    if (!this.enabled) {
      return;
    }

    console.info(`[JWE integration] ${message}`);
  }

  json(label: string, value: unknown): void {
    if (!this.enabled) {
      return;
    }

    console.info(`[JWE integration] ${label}:`, value);
  }

  request(label: string, request: TestRequest): void {
    if (!this.enabled) {
      return;
    }

    const responseKey = request.request.headers.get(
      JEAP_JWE_RESPONSE_KEY_HEADER
    );

    console.info(`[JWE integration] ${label}:`, {
      method: request.request.method,
      url: request.request.urlWithParams,
      headers: {
        accept: request.request.headers.get('Accept'),
        contentType: request.request.headers.get('Content-Type'),
        jweResponseKey: responseKey
          ? `<compact-jwe length=${responseKey.length}>`
          : null,
      },
      body: this.describeBody(request.request.body),
    });
  }

  jweHeader(label: string, compactJwe: string | null): void {
    if (!this.enabled || !compactJwe) {
      return;
    }

    const protectedHeader = decodeProtectedHeader(compactJwe);

    console.info(`[JWE integration] ${label}:`, {
      alg: protectedHeader.alg,
      enc: protectedHeader.enc,
      kid: protectedHeader.kid,
      cty: protectedHeader.cty,
      compactJwe: `<compact-jwe length=${compactJwe.length}>`,
    });
  }

  responseKeyHeader(label: string, request: TestRequest): void {
    const responseKey = request.request.headers.get(
      JEAP_JWE_RESPONSE_KEY_HEADER
    );

    this.jweHeader(label, responseKey);
  }

  private describeBody(body: unknown): unknown {
    if (typeof body === 'string') {
      return `<compact-jwe length=${body.length}>`;
    }

    return body;
  }
}
