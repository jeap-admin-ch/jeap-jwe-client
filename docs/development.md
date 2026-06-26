# Development

How to develop, test and build `jeap-jwe-client` locally. For how to *use* the published library in an
Angular application, start with [Getting started](./getting-started.md). For the release process, see
[Publishing and versioning](./publishing-and-versioning.md).

## Prerequisites

- **Node.js 24** (the CI and release workflows pin `NODE_VERSION`; Angular 22 requires Node `>= 24.15.0`,
  or `22.22.3`/`26.0.0`). Use a version manager such as `nvm` to match it:

  ```bash
  nvm install 24
  nvm use 24
  ```

- **npm** (bundled with Node).
- **Chrome / Chromium** for the headless Karma test runner. Set `CHROME_BIN` if it is not auto-detected:

  ```bash
  export CHROME_BIN="$(which google-chrome || which chromium)"
  ```

## Workspace layout

This repository is an Angular workspace. The publishable library lives in `projects/jeap-jwe-client`;
the workspace root `package.json` is private and only holds development tooling and scripts.

| Path                                    | Purpose                                        |
|-----------------------------------------|------------------------------------------------|
| `projects/jeap-jwe-client/src/`         | Library source and specs                       |
| `projects/jeap-jwe-client/package.json` | Library package metadata and **published version** |
| `dist/jeap-jwe-client/`                 | Built package (output of `build:lib`)          |

## Install

```bash
npm ci
```

Use `npm ci` (not `npm install`) to install the exact locked dependency versions.

## Common scripts

All scripts are run from the workspace root.

| Script                          | What it does                                                        |
|---------------------------------|--------------------------------------------------------------------|
| `npm run format`                | Format `src/**/*.ts` with Prettier (writes fixes in place)         |
| `npm run format:check`          | Verify formatting without writing (what CI runs)                   |
| `npm run lint`                  | Lint `src/**/*.ts` with ESLint                                     |
| `npm run test`                  | Run the library unit/integration tests once (headless Chrome)      |
| `npm run test:watch`           | Run the tests in watch mode                                        |
| `npm run build:lib`             | Build the publishable library into `dist/jeap-jwe-client/`         |
| `npm run pack:lib`              | Create an npm tarball from the built package                       |
| `npm run publish:lib:dry-run`   | Dry-run `npm publish` from the built package                       |

The test strategy (unit areas, integration flow, protocol trace) is documented in
[Testing](./testing.md).

## Before you commit

CI fails the build on any Prettier, ESLint, test or build error, so run the same checks locally first:

```bash
npm run format   # writes fixes; or format:check to only verify
npm run lint
npm run test
npm run build:lib
```

Newly added or rewritten source/spec files are the most common cause of a CI `format:check` failure —
running `npm run format` before committing avoids it.

## Continuous integration

`.github/workflows/library-ci.yml` runs on every push and pull request with the following jobs:

| Job                                | What it checks                                                                                     |
|------------------------------------|----------------------------------------------------------------------------------------------------|
| **Lint and format**                | `npm run format:check` then `npm run lint`                                                         |
| **Update third-party licenses**    | Regenerates `THIRD-PARTY-LICENSES.md`; commits it on non-fork branches if outdated                 |
| **Angular 20/21/22 compatibility** | Installs the latest patch of each Angular major, then runs tests and builds the library against it |
| **Package**                        | Runs tests, builds, verifies the dist contents, creates the npm tarball and runs a publish dry run |

`.github/workflows/library-release.yml` runs on `v*.*.*` tags and performs the publish flow via npm
trusted publishing (see [Publishing and versioning](./publishing-and-versioning.md) and
[npm publishing setup](./npm-publishing-setup.md)).

### Reproducing the compatibility matrix locally

CI tests the library against multiple Angular majors. To reproduce one locally, install that major's
toolchain without touching the lock file, then test and build:

```bash
npm ci
npm install --no-save --package-lock=false \
  @angular/core@21 @angular/common@21 @angular/compiler@21 \
  @angular/compiler-cli@21 @angular/cli@21 @angular-devkit/build-angular@21 \
  ng-packagr@21 typescript@~5.9.0
npx ng test jeap-jwe-client --watch=false --browsers=ChromeHeadless
npx ng build jeap-jwe-client
```

## Troubleshooting

- **`The Angular CLI requires a minimum Node.js version of ...`** — your Node version is too old. Switch
  to Node 24 (`nvm use 24`).
- **Karma cannot find a browser** — install Chrome/Chromium and export `CHROME_BIN`.
- **`format:check` fails in CI but the code looks fine** — run `npm run format` locally and commit the
  result; Prettier and your editor may disagree on formatting.
