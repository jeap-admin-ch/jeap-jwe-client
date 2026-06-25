#!/bin/bash

          test -f "${LIBRARY_DIST}/package.json"
          test -f "${LIBRARY_DIST}/README.md"
          test -f "${LIBRARY_DIST}/LICENSE"
          test -f "${LIBRARY_DIST}/CHANGELOG.md"
          test -f "${LIBRARY_DIST}/THIRD-PARTY-LICENSES.md"

          node -e "const p=require('./${LIBRARY_DIST}/package.json'); if (!p.name || !p.version) throw new Error('Missing package name or version'); if (p.private === true) throw new Error('Library package must not be private'); console.log(`${p.name}@${p.version}`)"

