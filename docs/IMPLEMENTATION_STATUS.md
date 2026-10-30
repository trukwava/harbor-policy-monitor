# Implementation status · 2026-10-29

## Verified in the local build

- [x] Blank workspace inspected; no existing repository overwritten.
- [x] Five synthetic official-like source fixtures, 16 chronological events, 15 successful captures and one explicit timeout.
- [x] Seven actual PDF originals, including three raster-only scan PDFs with uncertain **sidecar** transcriptions.
- [x] Source policy metadata, local fixed allowlist, bounded attachment depth/size, persistent attempts and source status.
- [x] Original bytes, SHA-256 versions, source-relative paths, distinct timestamps, snapshots and linkage tables.
- [x] Versioned deterministic normalizer, line comparison, retained before/after evidence, metadata-only relocated link audit.
- [x] Disappearance treated as missing attachment and failure treated as incomplete coverage.
- [x] Human disposition and explicit latest-review rule before action creation.
- [x] Action owner, due-date edit, acknowledgement, resolution note, and SQLite persistence.
- [x] Local digest draft, archive search, audit history, demo reset, narrow HTTP API, source text escaping.
- [x] Responsive desktop/mobile interface, loading/empty/failure/invalid-input states, keyboard focus treatment.
- [x] `migrations/001_init.sql`, no-credential local run instructions, twenty-two focused tests.

## Actual verification

**Unit/integration:** `npm test`: 22/22 passed. In particular, the action state survived database close/reopen; repeated replay produced zero duplicate candidates.

**Browser rendering:** Headless Chromium DOM exercises were run with compiled browser JavaScript, static CSS and the actual local API reached via a test transport bridge. Actual forms were used to classify housing, assign, acknowledge, resolve, then inspect state in a fresh page. Coverage warning and mobile rendering were checked; observed JavaScript errors: zero. Direct Chromium HTTP navigation was blocked by this execution environment, so real browser HTTP end-to-end is still a local operator verification step rather than an independently established result.

**Important fixture caveat:** Synthetic scanned PDFs are raster-only; transcription sidecars are supplied. No OCR model is run. No accuracy claim follows from this test.

## Not implemented or not verified

- [ ] Production HTTP fetcher / browser crawler / redirect and DNS network security; **never** enable arbitrary live URL input on this code.
- [ ] Native OCR or arbitrary external PDF text extraction.
- [ ] Real authentication, enterprise RBAC, organization isolation beyond a fixed one-org local demo.
- [ ] Recurring scheduler, retries/backoff, push alerts, worker service.
- [ ] Real AI provider suggestions and failure fallback integration (manual text comparison already works without AI).
- [ ] External email, Teams, or action system integration.
- [ ] Client ground-truth measurement, legal review, real-world reliability / recall / time-savings validation.
- [ ] Production deployments, public hosting, penetration test, or real data retention compliance.

## Known tradeoffs

- A simple line-level normalizer is explainable and repeatable but may group multi-paragraph edits imprecisely. The fixed v1 normalizer currently strips clearly labelled NAV, FOOTER and page number lines; external page boilerplate needs source-specific normalization policies.
- Fixture metadata includes allowed host and size/depth. The external-link policy is intentionally not a production URL fetcher. Changing source scope within demo should be reviewed before replay; bounded synthetic fixture schemas are not an assurance about hostile documents.
- A `reviewed` latest classification can be revised, but once an action exists the demo prevents downgrading to editorial/dismissed, retaining a clear audit obligation. A future production system needs explicit retraction/correction workflows.
- Node's built-in SQLite module is experimental in Node 22; verify behavior before a deployment-oriented stack choice.

## v0.2 verification and publication

- [x] Evidence receipts, local hash and normalization checks, audit history, integrity UI.
- [x] Bound pathological diff processing, strict calendar date extraction, resolved-action immutability, no-op idempotence.
- [x] HTTP route tests, origin guard, Host-header checks.
- [x] 22/22 automated tests and bridged browser exercise.
- [ ] Complete-source GitHub upload; local ZIP includes safe publication script.
- [ ] Independent connected-source ingestion hardening and pilot evaluation.