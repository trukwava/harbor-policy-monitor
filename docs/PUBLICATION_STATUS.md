# Repository publication and verification

This file accompanies the **v0.2 complete-source package**. Its presence alone does not prove that every required file is committed; verify the repository contents and CI results.

The complete package contains `src/engine.ts`, `src/server.ts`, `src/diff.ts`, `src/frontend/main.ts`, `src/tests/`, `fixtures/history.json`, `fixtures/raw/*.pdf`, `migrations/001_init.sql`, `public/`, and the corresponding documentation. GitHub Actions should run `node scripts/verify-package.mjs` followed by `npm test`.

The application is an **offline synthetic demonstration**, not production-ready public monitoring. External retrieval, independent provenance attestation and live integrations are not enabled.

## Full-source publication procedure

Use `bash scripts/publish-to-github.sh` from the extracted archive with authenticated Git push. The script clones the existing repository, checks the local file manifest, stages the complete source (excluding `.env`, SQLite files and build artifacts), and pushes without force. Check the resulting commit and workflow run before calling publication complete.