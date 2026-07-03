/**
 * Helpers that keep JWE backend traffic on the configured origin and over a
 * secure transport. They guard against a configuration or metadata response
 * pointing key/config retrieval at another host or at plaintext HTTP.
 */

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLocalhostHostname(hostname: string): boolean {
  return LOCALHOST_HOSTNAMES.has(hostname.toLowerCase());
}

/**
 * Returns true for HTTPS URLs, and for plaintext HTTP only on localhost so that
 * local development keeps working.
 */
export function isSecureBackendUrl(url: URL): boolean {
  if (url.protocol === 'https:') {
    return true;
  }

  return url.protocol === 'http:' && isLocalhostHostname(url.hostname);
}

/**
 * Resolves the configured origin to a URL, falling back to the current document
 * origin for relative or omitted values.
 */
export function resolveBackendOrigin(origin?: string): URL {
  return new URL(origin ?? '', globalThis.location?.origin);
}

/**
 * Derives the application base path from the document base URI (the Angular
 * base href). For a frontend served by its backend under a servlet context
 * path (base href "/myapp/"), this returns "/myapp"; for a root-served
 * frontend it returns "". A file-like base URI without a trailing slash
 * resolves to its directory.
 *
 * Outside a browser (no document), the base path is empty.
 */
export function deriveBasePath(baseUri = globalThis.document?.baseURI): string {
  if (!baseUri) {
    return '';
  }

  const pathname = new URL(baseUri).pathname;
  return pathname.slice(0, pathname.lastIndexOf('/'));
}
