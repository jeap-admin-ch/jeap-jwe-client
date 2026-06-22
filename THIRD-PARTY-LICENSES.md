# Third-Party Dependency Licenses

Third-party dependencies grouped by their license type.

This file documents the direct dependencies declared by this repository and the publishable Angular
library package. It is intended as a human-readable overview for the repository. For a release or
compliance process, generate and archive a complete transitive dependency report from the exact
`package-lock.json` used for the build.

## Scope

This repository contains an Angular workspace and the publishable library project:

```text
package.json
projects/jeap-jwe-client/package.json
```

The publishable package is built from:

```text
projects/jeap-jwe-client/
```

The generated package is written to:

```text
dist/jeap-jwe-client/
```

## Publishable library dependencies

The published `jeap-jwe-client` package declares:

### Peer dependencies

These packages are provided by the consuming Angular application:

| Package           |      Version range | License    |
|-------------------|-------------------:|------------|
| `@angular/common` | `>=20.0.0 <23.0.0` | MIT        |
| `@angular/core`   | `>=20.0.0 <23.0.0` | MIT        |
| `rxjs`            |           `^7.4.0` | Apache-2.0 |

### Runtime dependencies

These packages are installed as runtime dependencies of the library package:

| Package |  Version | License |
|---------|---------:|---------|
| `jose`  |  `6.2.2` | MIT     |
| `tslib` | `^2.3.0` | 0BSD    |

## Workspace dependencies

The workspace root package is private and is used for development, testing, and building the library.

### MIT License

| Package                     |   Version |
|-----------------------------|----------:|
| `@angular/animations`       |  `22.0.2` |
| `@angular/common`           |  `22.0.2` |
| `@angular/compiler`         |  `22.0.2` |
| `@angular/core`             |  `22.0.2` |
| `@angular/forms`            |  `22.0.2` |
| `@angular/platform-browser` |  `22.0.2` |
| `@angular/router`           |  `22.0.2` |
| `jose`                      |   `6.2.2` |
| `zone.js`                   | `~0.15.0` |

### Apache License Version 2.0

| Package |  Version |
|---------|---------:|
| `rxjs`  | `^7.8.0` |

### 0BSD License

| Package |  Version |
|---------|---------:|
| `tslib` | `^2.3.0` |

## Workspace development dependencies

Development dependencies are used for local builds, tests, packaging, and type checking. They are not
runtime dependencies of the published library package.

### MIT License

| Package                         |   Version |
|---------------------------------|----------:|
| `@angular-devkit/build-angular` |  `22.0.2` |
| `@angular/cli`                  |  `22.0.2` |
| `@angular/compiler-cli`         |  `22.0.2` |
| `@types/jasmine`                |  `~6.0.0` |
| `jasmine-core`                  |  `~6.2.0` |
| `karma`                         |  `~6.4.0` |
| `karma-chrome-launcher`         |  `~3.2.0` |
| `karma-coverage`                |  `~2.2.0` |
| `karma-jasmine`                 |  `~5.1.0` |
| `karma-jasmine-html-reporter`   |  `~2.2.0` |
| `ng-packagr`                    | `^22.0.0` |

### Apache License Version 2.0

| Package      |  Version |
|--------------|---------:|
| `typescript` | `~6.0.0` |

## Complete transitive dependency report

This file lists direct dependencies only. A full compliance report must include transitive
dependencies resolved by `package-lock.json`.

Recommended command for a local report:

```bash
npx license-checker-rseidelsohn --summary
```

Recommended command for a full JSON report:

```bash
npx license-checker-rseidelsohn --json --out third-party-licenses.full.json
```

Recommended command for production dependencies only:

```bash
npx license-checker-rseidelsohn --production --json --out third-party-licenses.production.json
```

If a CI release pipeline publishes the library, the pipeline should generate the transitive license
report from the same lockfile and dependency installation used for the release build.

## Notes

- This file is not legal advice.
- Verify licenses during every release, especially after dependency updates.
- Keep this file in the workspace root if it describes the whole repository.
- If a separate license report is needed for the published package only, place it under
  `projects/jeap-jwe-client/` and include it as an asset in `ng-package.json`.
