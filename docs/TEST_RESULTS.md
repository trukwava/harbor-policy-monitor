# Test observations · 29 October 2026

**Run:** `npm test` in the extracted project with Node.js v22.16.0.

**Result:** 13 passed, 0 failed, 0 skipped. Exact test source is `src/tests/engine.test.ts`; the runner uses Node's built-in test library and SQLite (no external services). Tests cover:

1. All five sources have 3+ successful synthetic snapshots and explicit timeout coverage gap.
2. Linked PDF change detects the literal `$2,000` and `$2,500` in original before/after evidence.
3. Moved but byte-identical PDF emits path audit only, not duplicate alert.
4. Navigation/footer reordering is editorial.
5. Disappeared attachment does not imply policy withdrawal.
6. Yearless effective-date candidate remains unconfirmed; instruction-like source text creates no automatic action.
7. OCR uncertainty flag is retained.
8. Repeated replay/poll produces no duplicate candidates.
9. Fixed normalizer produces identical change hunks.
10. Human review → assign → acknowledge → edit date → resolve persists after DB close/reopen.
11. Source-policy configuration enforces bounds and immutable change history.
12. Local digest does not send externally and remains in SQLite.
13. Out-of-scope attachment after a scope edit is a visible coverage failure, not a false disappearance.

**HTTP smoke:** A fresh local SQLite database booted the API with 5 sources, 9 unreviewed candidates, 1 coverage gap. `/api/health` and `/api/overview` returned well-formed JSON. Original PDF evidence is stored in BLOB columns and downloadable as attachments.

**Browser DOM smoke:** The compiled front-end HTML/CSS/JS was exercised in headless Chromium with local-API request bridging. The test executed the actual review/classification, assignment, acknowledgement, and resolution forms; reopened a fresh page, then verified persisted resolution and adjusted date. It visited source coverage and rendered desktop/mobile screenshots. No JavaScript errors were observed. Chromium HTTP navigation was restricted in the execution environment; this method is **not** a full browser HTTP integration test. A user should verify the local URL from their own browser after `npm start`.

**Not claimed:** real site detection recall, OCR accuracy, multi-user security, live-source crawling, performance or reliability in a production environment.

## v0.2 additional verification

22/22 focused tests passed. New checks cover stable and tamper-aware evidence receipts, review/audit linkage, large-text bounded diff, invalid date extraction, resolved-action immutability, bounded assignment notes, and end-to-end HTTP route behavior. Browser verification exercised review and action assignment using a local API bridge, with no observed JavaScript errors.
