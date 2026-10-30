# v0.2 — Evidence integrity, bounded comparisons, and stricter review invariants

**Release type:** Synthetic offline demonstration (not a connected monitor).

## Implemented and exercised

1. **Evidence receipt export.** Every candidate has a local JSON evidence packet downloadable in the review interface at `/api/candidates/:id/evidence.json`. The receipt includes both source version hashes, the retained passage-level diff, source location, publication/detection timestamps, current review history, current action, and linked audit events.
2. **Local consistency checks.** Original BLOBs are re-hashed and compared against their recorded SHA-256 values and candidate references. Normalized text and retained diff hunks are recomputed; integrity failures are surfaced explicitly rather than called verified. A stable digest binds the immutable detection data. **This is not a signature or a proof of official publication.**
3. **Bounded diff.** The algorithm avoids allocating quadratic LCS tables beyond 400,000 paragraph-pair cells. Oversized comparisons return a plainly labelled coarse hunk; original source bytes remain available.
4. **Date-extraction correction.** Impossible dates are rejected as uncertain rather than normalized to an unrelated calendar day. Calendar valid leap years continue to be recognized.
5. **Review transition correction.** Resolved action records cannot be modified. Repeated exact same-state updates do not create duplicate audit entries; assignment notes now have a 2,000-character bound.
6. **Loopback Host validation.** Unknown Host headers return HTTP 400, reducing DNS-rebinding risk in the intentionally loopback-only demo. The demo remains unsuitable for public service.
7. **Interface extension.** The review detail now includes a visible local-integrity status and evidence receipt download affordance.
8. **End-to-end HTTP test.** The test suite boots the app on an ephemeral local port and exercises source counts, evidence download, cross-origin write denial, human review, action assignment, invalid Host denial, and missing-candidate handling.

## Measured verification

`npm test` completed **22/22 passing tests**. An isolated browser test loaded the interface with a local Python API bridge (Chromium cannot navigate directly to loopback in this environment), verified the evidence panel, submitted a human review and an action, and observed no page JavaScript errors. This is bounded local verification, not a production browser deployment test.

## Limitations still present

- Live HTTP ingestion, DNS/IP/redirect inspection, OCR processing, secure background scheduling, organization authentication, human-annotated recall evaluation and actual third-party integrations have not been built.
- Audit entries are append-only by application convention, but a holder of write access to the SQLite database can modify data; no external notarization or signed ledger exists.
- Semantic relevance remains a human disposition, not an automatic policy or legal interpretation.
- `normalizer-v1` is retained; a large-text coarse-diff fallback has been documented. Historical data need versioned migration before deployment to mixed-version archives.

## Publication status

The local ZIP archives contain the full source and synthetic evidence. The connected GitHub repository has initial documentation and several source/configuration files, but publication of the **complete** source tree remains a separate step. Run `scripts/publish-to-github.sh` from the extracted archive on a workstation with GitHub push authentication to finish publication without rewriting repository history.
