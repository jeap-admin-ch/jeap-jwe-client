import {
  deriveBasePath,
  isSameOriginBackend,
  resolveBackendOrigin,
} from './backend-url';

describe('backend-url', () => {
  describe('deriveBasePath', () => {
    it('derives the context path from a base href with a trailing slash', () => {
      expect(deriveBasePath('https://app.example.ch/jme-jwe-scs/')).toBe(
        '/jme-jwe-scs'
      );
    });

    it('derives an empty base path from a root base href', () => {
      expect(deriveBasePath('https://app.example.ch/')).toBe('');
    });

    it('derives the directory from a file-like base URI', () => {
      expect(deriveBasePath('https://app.example.ch/context.html')).toBe('');
      expect(deriveBasePath('https://app.example.ch/myapp/index.html')).toBe(
        '/myapp'
      );
    });

    it('derives the context path from a relative base href', () => {
      expect(deriveBasePath('/myapp/')).toBe('/myapp');
      expect(deriveBasePath('/')).toBe('');
    });

    it('derives an empty base path when no base URI is available', () => {
      expect(deriveBasePath(undefined)).toBe('');
    });

    it('derives the base path of the current document by default', () => {
      expect(deriveBasePath()).toBe(deriveBasePath(document.baseURI));
    });
  });

  describe('isSameOriginBackend', () => {
    it('treats an omitted origin as same-origin', () => {
      expect(isSameOriginBackend(undefined)).toBe(true);
    });

    it('treats a relative origin as same-origin', () => {
      expect(isSameOriginBackend('')).toBe(true);
    });

    it("treats the frontend's own origin as same-origin", () => {
      expect(isSameOriginBackend(globalThis.location.origin)).toBe(true);
    });

    it('treats another origin as cross-origin', () => {
      expect(isSameOriginBackend('https://api.example.ch')).toBe(false);
    });
  });

  describe('resolveBackendOrigin', () => {
    it('resolves an absolute origin', () => {
      expect(resolveBackendOrigin('https://api.example.ch').origin).toBe(
        'https://api.example.ch'
      );
    });

    it('falls back to the document origin when no origin is configured', () => {
      expect(resolveBackendOrigin(undefined).origin).toBe(
        globalThis.location.origin
      );
    });
  });
});
