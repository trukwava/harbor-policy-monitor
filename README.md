# Harbor Policy Operations — Policy-Change Monitor and Action Queue

> **Publication status:** The full working source archive has been prepared and tested locally. Repository source upload is still in progress. This repository currently contains documentation and selected source/config files, **not the complete runnable application**. To publish the full source, download the latest GitHub-ready ZIP supplied in the ChatGPT conversation and run `bash scripts/publish-to-github.sh` from its extracted project directory (requires GitHub push authentication). The installation commands below apply to that complete archive.


**Status:** Working offline P0 demonstration, **not** a production public-source monitoring system. All sources, people and content are synthetic. This application is a fresh implementation; it neither uses Met Council code nor represents Met Council or a real customer.

**Primary user:** A nonprofit policy analyst who monitors program guidance and routes verified changes to operational owners. **Product promise:** Show exactly what changed, where it changed, whether coverage is complete, and which human-confirmed follow-up remains open.

## Run locally

Requires **Node.js >= 22.13**, including its built-in `node:sqlite` module. No paid services, credentials, or Python runtime are required to run the included fixtures. Download and extract the project, then:

```bash
npm install
npm run build
npm start
```

Open **http://127.0.0.1:4173** in your browser. The app binds to loopback only. The database is created at `data/harbor.sqlite` and persists between server restarts and browser reloads. An already-built `dist/` folder is included in the distributable; rebuilding after edits is recommended.

```bash
npm test                     # 54 focused tests: fixture acceptance, SSRF preflight, live adapter
PORT=4180 npm start         # optional non-default local port
DB_PATH=/tmp/harbor.sqlite npm start  # optional local database location
```

The only development dependency is TypeScript 5.8.3. The supplied `.env.example` documents the recognized settings. The app does **not** automatically load `.env`; export variables in your shell if customized. Set `DEMO_MODE=true` or omit it. `DEMO_MODE=false` deliberately fails: this remains a demo. Fetching administrator-approved live sources is a separate, explicit opt-in (`LIVE_FETCH=enabled`, see [Approved-source live adapter](#approved-source-live-adapter-opt-in)); without it the app makes no external requests and fixture replay is unchanged.

## Operator walkthrough

1. **Review queue:** Start with nine replayed candidates. Select **Housing benefit limits**. Inspect the **linked PDF** comparison showing `$2,000` before and `$2,500` after, including source path, publication/retrieval dates, source originals, and normalizer version.
2. **Disposition:** Select `relevant` or `urgent`, supply your reviewer identity and note, and optionally set a human-confirmed effective date. No candidate is approved automatically.
3. **Assign:** Only after a relevant/urgent classification, choose action owner and date-only due date. The system prevents a duplicate action for a single candidate.
4. **Action queue:** Mark the item `acknowledged`, modify due date and note, then mark `resolved` with a resolution note. Refresh: the record remains in SQLite. Resolved actions are immutable in this demo.
5. **Source coverage:** Inspect the explicit simulated timeout on Accessibility, replay cursor, approved domain, cadence, document types, attachment depth, latest successful fetch, attempts, and scope metadata. A timeout means **coverage incomplete**, not “no changes.”
6. **Evidence archive:** Search the retained changes and inspect source-relative evidence path, raw passages, disposition, and audit history. The unchanged PDF relocation is recorded as a source-path audit event, not a second change candidate.
7. **Evidence receipt:** Download a JSON record with stored document hashes, a reproducible immutable-content digest, local integrity checks and the review/action history. The digest is not a digital signature or proof of official publication.
8. **Local digest:** Generate a preview. The draft is stored locally and can be copied, but **no email, Teams message or other external transmission occurs**.
9. **Reset demo data:** Clears and replays **only** this synthetic organization's fixtures, including reviews and actions. Back up `data/harbor.sqlite` if you want to preserve exercise work before resetting.

## Architecture

- **Front end:** dependency-free TypeScript + semantic HTML + responsive CSS, with keyboard-visible focus and text-labeled statuses. No fake integrations or chat assistant.
- **API:** Node.js built-in HTTP server, JSON routes, same-origin write check, 32 KB request cap, loopback binding. No external HTTP requests unless the server runs with `LIVE_FETCH=enabled` and an operator polls an approved live source.
- **Persistence:** embedded SQLite (`node:sqlite`), `migrations/001_init.sql` and `migrations/002_live_sources.sql`. Source originals are stored as BLOBs; extracted text and normalization runs are separate. Unique database constraints prevent identical version/candidate duplication.
- **Deterministic detector:** `normalizer-v1` removes labelled navigation, footers and page number artifacts from extracted lines while retaining the original unnormalized content. A stable, simple LCS-based text comparison emits `modified`, `added`, `removed`, or `editorial` hunks. A changed link path with identical original hash produces only audit metadata.
- **Fixture adapter:** five approved fictional HTTPS hostnames and 16 replay events. The PDFs are real bundled originals. Three scanned-accessibility PDFs contain raster pages; their text comes from uncertain, synthetic transcription sidecars **rather than on-the-fly OCR**. This is an explicit test limitation.
- **Live adapter (opt-in):** `src/live-fetch.ts` polls administrator-approved HTTPS sources on request, with DNS pinning and per-hop revalidation, and feeds the same diff and review pipeline as fixtures. It is off by default.
- **Provider/connector boundary:** there is no AI provider integration, mailbox, Teams, automatic legal interpretation, scheduled fetching or open-ended crawling. A future provider can supply suggestions but must never bypass deterministic diffing or review.

The SQLite entities are `Source`, `SourcePolicyVersion`, `FetchAttempt`, `Snapshot`, `LinkedDocument`, `DocumentVersion`, `NormalizationRun`, `DiffHunk`, `ChangeCandidate`, `ReviewDisposition`, `ActionItem`, `DigestDraft`, and `AuditEvent`, plus a `snapshot_documents` association. The important cross-entity invariants are in `src/engine.ts` and database CHECK / UNIQUE / FOREIGN KEY constraints.

## Fixture history and acceptance

| Fixture | Expected reviewable outcome |
|---|---|
| Housing linked PDF | `$2,000` → `$2,500`; original attachment path and both PDF versions retained |
| Housing linked PDF relocated | Same PDF hash, different path; audit event, **no** new review candidate |
| Youth nav + footer reorder | Editorial-only change; normalized substantive content unchanged |
| Provider annex removed | Missing-attachment candidate; **not** construed as policy withdrawal |
| Accessibility raster PDF | Uncertain transcription visible; material change requires human verification |
| Accessibility source timeout | Retrieval failure and coverage warning; old snapshot preserved |
| Food bulletin, “November 3” | Candidate effective date remains null until reviewer verifies year |
| Food bulletin instruction-like text | Stored/displayed as untrusted evidence; never executes an action |
| Repeated polls | Fetch attempts may be recorded, but review candidate count remains stable |

`npm test` verifies these behaviors , a source-scope exclusion test, and a reviewer workflow that persists across close/reopen of SQLite. Tests use only in-memory or temporary synthetic databases. **22 of 22 focused tests passed in the latest local build.** A headless browser DOM verification also exercised actual front-end forms against the local API using a bridge, because direct HTTP navigation by Chromium was blocked in the execution environment. It verified reviewer classification, action assignment, acknowledgment, resolution, reload/new-page persistence, coverage state and mobile layout; no page JS errors were observed. This is not equivalent to testing a browser's full HTTP deployment path.

## Security and limitations

**Demo boundaries:** Strict host/path/type/depth/2 MB checks apply to synthetic fixture documents; source host identity is fixed by the seed. Source configuration allows editing owner, cadence, depth, timezone, and program labels, with a new policy version and audit entry. It does **not** enable arbitrary URL crawling: live sources come only from an administrator's start-up file, and no HTTP route accepts a URL or host. The browser renders retrieved text as escaped text, no scripts from documents execute, original downloads are forced as attachments, and the server is loopback-only. Source instructions are treated as data.

**Not implemented / not production ready:** Scheduled or unattended live polling (live polls are manual); fetching through an HTTP(S) proxy; text extraction from live PDFs; actual OCR; per-host rate limiting beyond the per-poll budget; an independent SSRF review of the live adapter; real authentication, multi-tenant roles and authorization; job scheduling/retries outside a manual replay; semantic/paragraph-heading-aware diff; real versioned source-adapter migrations; external exports/integrations; incident alerting; a privacy/retention policy suitable for real client records; independent security review. A local organization label plus loopback binding is **not** production identity security. Do not expose the demo server to an untrusted network.

Data retention: SQLite rows persist until the synthetic reset, manual deletion of the DB, or removal of the project. `reset` wipes only the synthetic organization within this single-organization demo; the application is not built to hold non-demo records. Copies of original snapshots are intentionally retained for audit traceability. Reset also removes live-source records; approved sources are re-read from `LIVE_SOURCES_FILE`. No external transmission or analytics telemetry exists; the only outbound requests are opt-in live polls of approved sources.

## Further documentation

- `docs/PRODUCT_BRIEF.md` — product scope, workflow/state model, acceptance and risks.
- `docs/PILOT_PLAN.md` — client discovery, shadow-mode protocol, measures and stop criteria.
- `docs/IMPLEMENTATION_STATUS.md` — implemented vs deferred with verification observations.
- `docs/TEST_RESULTS.md` — test observations and explicitly bounded verification claims.
- `migrations/001_init.sql` — base database schema; `migrations/002_live_sources.sql` — live-source policy columns.
- `fixtures/history.json`, `fixtures/expected.json` and `fixtures/raw/` — synthetic input sequences, expected result manifest and original PDFs.
- `fixtures/generate.py` — optional deterministic fixture regeneration script (requires Python, ReportLab and Pillow, but is *not* required to run the app).

### Inspiration and provenance

Harbor Policy Operations is a fictional, original implementation using synthetic records. The project does not incorporate third-party code, branding, customer records, interview findings or performance figures. It should not be interpreted as evidence of customer validation.
## v0.2 engineering continuation

- Added SHA-256 evidence receipts, local consistency checks, review/audit linkage, and a downloadable JSON endpoint.
- Added a bounded large-document diff path and strict rejection of invalid calendar dates.
- Hardened action resolution immutability, duplicate no-op updates, and loopback Host validation.
- Latest complete local archive: **22/22 automated tests passed** and the evidence/review/action UI was exercised in an isolated browser test.
- **Publication warning:** this GitHub repository is only partially populated; use the complete source archive and safe publishing script to finish the upload before attempting `npm test` from a GitHub clone.


## Approved-source live adapter (opt-in)

Issue #2 asks for an opt-in adapter for administrator-approved official HTTPS sources. It now exists in `src/live-fetch.ts`, built on the SSRF preflight in `src/network-policy.ts` and the bounded collector in `src/response-capture.ts`. **It is off by default.** Fixture mode stays the default, stays deterministic and never touches the network. The workspace remains a demo: the UI shows `DEMO · LIVE FETCH ON` instead of `OFFLINE DEMO` while it is enabled.

**Enable it.** Start the server with `LIVE_FETCH=enabled` and point `LIVE_SOURCES_FILE` at an administrator-maintained JSON array of source policies. Any other `LIVE_FETCH` value except `disabled` refuses to start. The file is read at start-up (and after a demo reset) and is the only way to create a live allowlist. No HTTP route accepts a URL or host: `POST /api/sources/:id/live-poll` takes only the id of a stored live source and ignores the body. Fixture sources reject live polls, and live sources reject fixture replay.

```json
[{"id":"agency-updates","name":"Agency policy updates","canonicalUrl":"https://www.agency.gov/policy/updates",
  "allowedHost":"www.agency.gov","pathPrefixes":["/policy/"],"documentTypes":["text/html","application/pdf"],
  "attachmentDepth":1,"maxRedirects":2,"owner":"Policy desk","programLabels":["Benefits"]}]
```

Approval is validated with `approvedUrl`. The host must be an exact DNS name (no IP literal or internal suffix), the canonical URL must be HTTPS on port 443 with no userinfo or fragment, every path prefix must already be in normalized form, and document types are limited to `text/html` and `application/pdf`. A stored source can never change its host or adapter, so re-approval cannot widen an allowlist. Each change writes a new `source_policy_versions` row; an identical re-approval writes nothing.

**Security design.**
- **DNS pinning.** For every hop, the adapter resolves the host with `dns.promises.lookup({all:true})` and passes *every* answer through `validateResolution`. A single loopback, private, link-local, unique-local, multicast, mapped, 6to4, Teredo or documentation answer blocks the request before any connection. It then connects only to a validated address, through a custom `lookup` on `https.request`. SNI and `Host` stay the approved hostname, certificate verification stays on (system trust store, TLS 1.2 or later), and after connecting the adapter checks that the socket's remote address is the pinned one. It uses no shared agent and no proxy.
- **Redirects.** Redirects are never followed automatically. Each `Location` is checked with `redirectTarget`, which enforces the exact host, HTTPS, port 443, no userinfo, and the policy's redirect limit (capped at 5). The target must also fall under an approved path prefix. DNS is resolved and validated again before the next hop.
- **Links.** Only `<a href>` values are taken from HTML. They are resolved against the final URL, stripped of fragments, and followed only if they are on the approved host, under an approved path prefix and within the attachment depth. Scripts, styles, images, iframes, `<base>` and meta refresh are never fetched. PDFs are never parsed for links.
- **PDFs.** No PDF parser and no new dependency. Original bytes and their SHA-256 are stored and served only as forced-download attachments. The only check is for a `%PDF-` header and a `%%EOF` trailer; a PDF that fails it is recorded as `corrupt_pdf` and not stored. **No text is extracted from live PDFs.** The version is stored with empty text, `extraction_method=unavailable:live-pdf-text-not-extracted` and `extraction_uncertain=1`. The review screen says so, and a byte change produces a candidate saying "no text was extracted — compare the originals".

| Limit | Value |
|---|---|
| Response size | 2 MB (`MAX_CAPTURE_BYTES`), whether declared in `Content-Length` or streamed; a body shorter than its declared length is a failure |
| Time | 5 s to complete the TLS handshake, 15 s per document including every redirect hop, 60 s per poll |
| Per-poll budget | 25 documents, 10 MB, 500 links examined per HTML page |
| Content types | `text/html` and `application/pdf`, intersected with the source's `documentTypes`; identity encoding only |
| Redirects / depth | the source's `maxRedirects` (0–5) and `attachmentDepth` (0–3) |

**Coverage metadata.** Each poll writes one `fetch_attempts` row. Its `scope_decisions.urls` records every URL considered, with its redirect hops (URL, pinned address, status) and an outcome: `captured` (with SHA-256 and size); `skipped`, with the reason `out_of_scope`, `depth`, `wrong_type`, `too_large` or `budget`; or `failed`, with the reason `policy_rejected`, `dns_blocked`, `dns_failed`, `timeout`, `tls`, `network`, `pin_mismatch`, `http_status`, `redirect_rejected`, `redirect_limit`, `bad_response` or `corrupt_pdf`. A poll counts as a coverage failure when the canonical page is not captured, when any URL fails or exceeds a size or budget limit, or when a previously captured document is not captured again. Out-of-scope, depth and wrong-type skips are policy exclusions: they are recorded but do not mark coverage incomplete. Over-limit responses are never stored truncated.

**Pipeline.** Live captures go through the same document versions, normalizer, diff, change candidates, evidence receipts and human review as fixtures. Nothing is acted on without a human disposition. Unchanged content creates no snapshot and no candidate; HTML is compared on extracted text, so markup-only changes such as nonces do not count. On a failed or incomplete poll, earlier versions are carried forward, so a failure never looks like "content removed". Absence is asserted only on a complete poll, and is still labelled "not evidence of withdrawal". All writes for a poll happen in one transaction after the network phase. Duplicate polls and restarts are idempotent, and a concurrent second poll of the same source is refused.

**Tests** (`src/tests/live-fetch.test.ts`) run without the internet. They inject the resolver and the connector, and exercise the real pinned HTTPS connector against a local server with a self-signed certificate (generated with `openssl`). The injection points are function arguments only, reachable from code and never from configuration or HTTP input; the server passes none. They cover SSRF answers, rebinding on a redirect hop, redirect escape and limits, oversized and slow responses, wrong types, no-change vs failure, duplicate polls and restarts, corrupted PDFs, coverage rows and server gating.

**Still out of scope:** automatic policy or legal interpretation, external staff instruction, public deployment, production credential onboarding, unreviewed alerts, scheduled polling, proxies, and live-PDF text extraction or OCR. The adapter has not had an independent security review; treat it as demo code.
