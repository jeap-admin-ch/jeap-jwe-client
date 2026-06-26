# Publishing and versioning

This document describes how `jeap-jwe-client` is versioned, packaged, documented, and published.

## Scope

This document applies to the Angular library project:

```text
projects/jeap-jwe-client/
```

The workspace root is only used for development tooling, tests, and build scripts. The publishable artifact is the built library package under:

```text
dist/jeap-jwe-client/
```

## Where the library version lives

The library version is defined in:

```text
projects/jeap-jwe-client/package.json
```

Example:

```json
{
  "name": "@jeap/jeap-jwe-client",
  "version": "1.0.0"
}
```

This version is copied into the generated package:

```text
dist/jeap-jwe-client/package.json
```

The root `package.json` version is not the library version. The root package should stay private.

Recommended root metadata:

```json
{
  "name": "jeap-jwe-client-workspace",
  "version": "0.0.0",
  "private": true
}
```

## Documentation versioning

Documentation is versioned together with the library.

A release tag should represent code, package metadata, changelog, and documentation together.

Tag format:

```text
v1.0.0
```


## Documentation location

The documentation lives in the repository root `docs/` directory so the jEAP
documentation pipeline (Docusaurus) discovers and aggregates it, and so it renders
on GitHub:

```text
README.md
docs/
projects/jeap-jwe-client/
```

The documentation is not bundled into the published npm package. The library
`README.md` links to the public documentation instead:

- the jEAP documentation site,
- the `docs/` directory on GitHub.

This keeps a single source of truth for the documentation and avoids broken
relative links on npmjs.com.

## Packaging documentation assets

The published package includes the library README, the changelog, and the third-party
license notices.

`projects/jeap-jwe-client/ng-package.json`:

```json
{
  "assets": [
    "README.md",
    "CHANGELOG.md",
    "THIRD-PARTY-LICENSES.md"
  ]
}
```

## Release flow

The package is published to the public npm registry as `@jeap/jeap-jwe-client`
through GitHub Actions, using **npm Trusted Publishing (OIDC)** — no long-lived
npm token is stored in CI in the steady state.

A release is triggered by pushing a Git tag of the form `vX.Y.Z` on `main`:

1. Bump the version in `projects/jeap-jwe-client/package.json` and update
   `publiccode.yml` (`softwareVersion`/`releaseDate`) to match.
2. Add a matching `CHANGELOG.md` entry.
3. Tag the release commit `vX.Y.Z` and push the tag.
4. `.github/workflows/library-release.yml` verifies the tag is on `main` and
   matches the package version, regenerates and diffs `THIRD-PARTY-LICENSES.md`,
   runs the tests, builds the library, verifies the package contents, and
   publishes `dist/jeap-jwe-client/` to npm with provenance.

The one-time maintainer setup that makes publishing work (npm org, the first
bootstrap release, and configuring the trusted publisher) is documented in
[npm publishing setup](./npm-publishing-setup.md).
