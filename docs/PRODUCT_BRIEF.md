# Product brief · Harbor Policy Operations (P0)

**Primary persona:** Policy analyst at a fictional nonprofit coordinating updates across housing, food, youth, provider and accessibility programs.

**Problem:** A landing page may stay unchanged while a linked attachment silently changes. Manual comparison can overlook material changes or misinterpret a broken fetch as no change.

**Promise:** Auditable detection coverage and reviewed operational follow-up, **not** legal interpretation, complete recall or production regulatory assurance.

**Initial assumptions:** All demo inputs are synthetic, all monitored hosts are preapproved and static, no real credentials or accounts are provided, a single local demo organization is adequate, and dates can be recorded without interpreting their legal effect. **No blocking question** was required to construct the demo.

## Smallest complete workflow

1. Replay bounded approved source fixture → record attempt and original snapshot/version hashes.
2. Normalize text separately from original → create diff hunks and idempotent change candidate.
3. Analyst opens provenance and before/after passages → explicitly records classification.
4. Only relevant/urgent reviewed candidate permits owner/date assignment.
5. Owner acknowledges/resolves action with a note → digest available as local draft; all records survive restart.

**Riskiest dependency:** Reliable capture/extraction of complex official websites and linked PDF scans under access controls. **Mitigation for first version:** Captured synthetic pages, original synthetic PDFs, transcription sidecars, bounded local replay and explicit uncertainty. This proves workflow orchestration, not live-source extraction.

## P0 state model

- `Source`: never_checked → success / failure (failure distinct from unchanged; last-success timestamp retained).
- `SourcePolicyVersion`: immutable configuration history upon each settings save.
- `FetchAttempt`: success or failure; never inferred from changes.
- `Snapshot`: original homepage captured at a retrieval time; linked document references preserve original URL path.
- `LinkedDocument` and `DocumentVersion`: stable document identity, original binary hash, separately extracted text and uncertain-extraction flag.
- `NormalizationRun`: deterministic normalized text keyed by document version and normalizer version.
- `DiffHunk`: section/path and verbatim before/after excerpts.
- `ChangeCandidate`: machine-suggested classification, unconfirmed date candidate and uncertainty note. Document disappearance is a candidate, never an inferred withdrawal.
- `ReviewDisposition`: append-only reviewer classification record (`editorial`, `relevant`, `urgent`, `needs_domain_review`, `dismissed`), optional confirmed effective date.
- `ActionItem`: assigned → acknowledged → resolved, with mandatory resolution note. Exactly one action per candidate; requires latest reviewer classification relevant/urgent.
- `DigestDraft`: locally previewed text; no send operation exists.
- `AuditEvent`: append-only metadata about detection, path movement, review, assignment, state changes, and coverage failure.

**Date convention:** Retrieval/detection and review events use ISO UTC timestamps, source publication dates remain separate, the display timezone is stored on the source, and action due dates are local date-only `YYYY-MM-DD`. Effective-date candidates are not confirmed dates; ambiguous years remain null.

## Acceptance criteria defined before implementation

1. Housing attachment explicitly preserves both `$2,000` and `$2,500` (pass).
2. Identical repeated polling creates no duplicate change candidate (pass).
3. URL relocation with identical original document hash only creates path audit (pass).
4. PDF disappearance and timeout are distinguished from substantive withdrawal/no-change (pass).
5. Footer/nav edit is classifiable as editorial (pass).
6. Human classification, assignment, due-date edit, acknowledgment and resolution persist after reopening DB (pass).
7. Deterministic normalizer produces same diff from same text under fixed version (pass).
8. Ambiguous date and source-embedded instructions cannot auto-approve an action (pass).

## P0 included

Five fixture sources with 16 events; approved host config; synthetic replay; original captured bytes; content hashes; annotated text diffs; review and action workflow; coverage dashboards; archive search; local draft digest; demo reset; audit history; responsive interface; test suite; operator instructions.

## Parking lot (excluded from prototype)

Network fetcher and allowlist manager with DNS resolution and redirect checks; production document extraction/OCR; automatic scheduler; production identities/roles; consent and retention/legal approval; real operational integrations; AI summarization provider; complex legal effective-date logic; multi-document batch diff ranking; trained change classifier; statistical detection guarantees. Each requires real sample sources and acceptance tests before promotion.
