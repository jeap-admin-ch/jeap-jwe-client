/**
 * Helpers for comparing HTTP media types without their parameters.
 *
 * Shared by the request encryptor and response decryptor so that media-type
 * handling stays consistent across the encryption pipeline.
 */

/**
 * Returns the lower-cased base media type without parameters, e.g.
 * `"application/json; charset=utf-8"` becomes `"application/json"`.
 */
export function baseMediaType(contentType: string): string {
  return contentType.split(';', 1)[0].trim().toLowerCase();
}

/**
 * Returns true for `application/json` and any structured `+json` media type.
 */
export function isJsonMediaType(contentType: string): boolean {
  const base = baseMediaType(contentType);

  return base === 'application/json' || base.endsWith('+json');
}

/**
 * Returns true when the content type matches an entry in the backend-advertised
 * allowlist. Comparison is on the base media type and case-insensitive.
 */
export function isAllowedContentType(
  contentType: string,
  allowlist: readonly string[]
): boolean {
  const base = baseMediaType(contentType);

  return allowlist.some(allowed => baseMediaType(allowed) === base);
}
