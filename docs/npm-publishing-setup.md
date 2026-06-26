# npm publishing setup

This document describes the one-time, maintainer-facing setup required to publish
`@jeap/jeap-jwe-client` to the public npm registry. It covers everything that must
be configured **outside the repository** (on npmjs.com and in the GitHub repository
settings).

The goal is the state required by the project: the package is published publicly
under the npm [`@jeap` organization](https://www.npmjs.com/org/jeap), releases run
through GitHub Actions using **npm Trusted Publishing (OIDC)**, and **no long-lived
npm token is stored in CI**.

## How releases work

There is a single workflow, `.github/workflows/build-and-release.yml`. On a push to `main`
it runs the checks (lint, licenses, compatibility, packaging) and then a `release`
job:

- **Release on merge to `main`.** When the version in
  `projects/jeap-jwe-client/package.json` has not been released yet (no matching
  `v<version>` tag), the `release` job publishes it. A merge that does not bump the
  version is a no-op (the tag already exists, so the job skips).
- The job runs in the protected `release` environment (see below).
- The publish step uses OIDC trusted publishing in the steady state (no token,
  provenance generated automatically).
- After a successful publish it pushes a `vX.Y.Z` tag as a record of the release,
  using the default `GITHUB_TOKEN`. The tag is a marker and idempotency guard — it
  is **not** a release trigger — so no PAT (`CI_PUSH_TOKEN`) is needed.
- Requirements (already satisfied by the workflow): the job has
  `permissions: id-token: write` (and `contents: write` to push the tag), runs on a
  GitHub-hosted runner (`ubuntu-latest`), and upgrades npm to a version that
  supports trusted publishing (`npm install -g npm@latest`; trusted publishing needs
  npm ≥ 11.5.1 and Node ≥ 22.14.0).

## One-time prerequisites (npmjs.com)

1. The npm **`jeap` organization** must exist (https://www.npmjs.com/org/jeap),
   and the publishing maintainer must be a member with rights to publish to the
   `@jeap` scope.
2. The package is scoped and published publicly. This is already declared in
   `projects/jeap-jwe-client/package.json` via
   `"publishConfig": { "access": "public" }`, and the workflow also passes
   `--access public`.

No PAT is required. The release job pushes its record tag with the default
`GITHUB_TOKEN`, and OIDC handles publishing.

## Why a one-time bootstrap is needed

npm cannot configure a trusted publisher for a package that does not exist yet —
the Trusted Publishing settings only appear on an already-published package. So the
**very first version** must be published with a token. After that, trusted
publishing takes over and the token is removed.

The workflow handles this automatically: while the `NPM_TOKEN` secret exists
(scoped to the `release` environment), it publishes with that token; once the
secret is deleted, it publishes via OIDC. No workflow edit is needed to switch over.

## The `release` environment

The release job runs in a GitHub Actions environment named **`release`**
(`environment: release` in `build-and-release.yml`). It is used to:

- restrict publishing to `main`,
- scope the bootstrap `NPM_TOKEN` secret to the publish job only,
- bind the npm trusted publisher to the same environment name once OIDC is enabled.

There is no manual approval gate; releases publish automatically on merge to `main`.

## Step 1 — Create the `release` environment

1. In the GitHub repository: **Settings → Environments → New environment**, name it
   **`release`**.
2. Under **Deployment branches and tags**, choose **Selected branches and tags**
   and add a branch rule: `main`.
3. (No required reviewers — this environment publishes without manual approval.)

## Step 2 — Bootstrap the first release with a temporary token

1. On npmjs.com, create an **Automation** access token scoped to publish for the
   `@jeap` organization (Account → Access Tokens → Generate New Token →
   Automation).
2. Add it as an **environment secret** named **`NPM_TOKEN`** on the `release`
   environment (Settings → Environments → `release` → Add environment secret).
3. Make sure `projects/jeap-jwe-client/package.json` is at the version you want to
   release (`1.0.0` for the initial release) and that `CHANGELOG.md` and
   `publiccode.yml` match.
4. Get that version onto `main` (merge the version bump). The `release` job sees
   there is no `v1.0.0` tag yet, publishes `@jeap/jeap-jwe-client@1.0.0` to npm
   (public, with provenance) using the token, and pushes the `v1.0.0` record tag.

> Set up the `release` environment and the `NPM_TOKEN` secret **before** the
> `1.0.0` version reaches `main`, otherwise the release runs before the token
> exists and fails. A failed release is harmless — fix the setup and re-run the
> workflow (`Run workflow` on `main`); the guard re-publishes because no `v1.0.0`
> tag was pushed yet.

## Step 3 — Configure the trusted publisher on npm

Once the package exists on npm:

1. Go to https://www.npmjs.com/package/@jeap/jeap-jwe-client → **Settings** →
   **Trusted Publishing**.
2. Add a **GitHub Actions** trusted publisher:
   - **Organization or user**: `jeap-admin-ch`
   - **Repository**: `jeap-jwe-client`
   - **Workflow filename**: `build-and-release.yml` (filename only, not a path)
   - **Environment name**: `release` (must match the workflow's `environment:`)
   - **Allowed actions**: `npm publish`
3. Save.

> The GitHub environment name and npm's **Environment name** must match. If you set
> one on npm but not in the workflow (or vice versa), OIDC publishing fails.

## Step 4 — Remove the long-lived token from CI

1. Delete the **`NPM_TOKEN`** environment secret
   (Settings → Environments → `release` → remove the secret).

From now on the workflow's OIDC publish step runs and **no long-lived npm token is
stored in CI**, satisfying the project's security requirement.

## Steady-state releases

For every subsequent release:

1. Bump the version in `projects/jeap-jwe-client/package.json` and update
   `publiccode.yml` (`softwareVersion`/`releaseDate`) to match.
2. Update `CHANGELOG.md`.
3. Merge the version bump to `main`.
4. The `release` job builds, verifies, publishes via OIDC trusted publishing, and
   pushes the `vX.Y.Z` record tag.

## Notes and caveats

- **Runner support**: trusted publishing requires GitHub-hosted runners.
  Self-hosted runners are not yet supported.
- **Provenance** is generated automatically under OIDC; the `--provenance` flag is
  not required (it is only passed on the bootstrap/token path so the first release
  is also attested).
- **Provenance requires a public source repository** — the repository is public,
  so this is satisfied.
- Each package can have only one trusted publisher configured at a time.
