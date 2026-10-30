# Harbor Policy Operations — Policy-Change Monitor and Action Queue

> **Publication status:** The full working source archive has been prepared and tested locally. Repository source upload is still in progress; the installation commands below apply to the complete archive rather than this repository until all files are present.


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
npm test                     # 17 focused acceptance tests
PORT=4180 npm start         # optional non-default local port
DB_PATH=/tmp/harbor.sqlite npm start  # optional local database location
```

The only development dependency is TypeScript 5.8.3. The supplied `.env.example` documents the recognized settings. The app does **not** automatically load `.env`; export variables in your shell if customized. Set `DEMO_MODE=true` or omit it. `DEMO_MODE=false` deliberately fails: no connected source adapter is implemented.

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
- **API:** Node.js built-in HTTP server, JSON routes, same-origin write check, 32 KB request cap, loopback binding, no external HTTP requests.
- **Persistence:** embedded SQLite (`node:sqlite`) and `migrations/001_init.sql`. Source originals are stored as BLOBs; extracted text and normalization runs are separate. Unique database constraints prevent identical version/candidate duplication.
- **Deterministic detector:** `normalizer-v1` removes labelled navigation, footers and page number artifacts from extracted lines while retaining the original unnormalized content. A stable, simple LCS-based text comparison emits `modified`, `added`, `removed`, or `editorial` hunks. A changed link path with identical original hash produces only audit metadata.
- **Fixture adapter:** five approved fictional HTTPS hostnames and 16 replay events. The PDFs are real bundled originals. Three scanned-accessibility PDFs contain raster pages; their text comes from uncertain, synthetic transcription sidecars **rather than on-the-fly OCR**. This is an explicit test limitation.
- **Provider/connector boundary:** there is no AI provider integration, production fetcher, mailbox, Teams, automatic legal interpretation, or remote crawling. A future provider can supply suggestions but must never bypass deterministic diffing or review.

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

`npm test` verifies these behaviors , a source-scope exclusion test, and a reviewer workflow that persists across close/reopen of SQLite. Tests use only in-memory or temporary synthetic databases. **17 of 17 focused tests passed in the latest local build.** A headless browser DOM verification also exercised actual front-end forms against the local API using a bridge, because direct HTTP navigation by Chromium was blocked in the execution environment. It verified reviewer classification, action assignment, acknowledgment, resolution, reload/new-page persistence, coverage state and mobile layout; no page JS errors were observed. This is not equivalent to testing a browser's full HTTP deployment path.

## Security and limitations

**Demo boundaries:** Strict host/path/type/depth/2 MB checks apply to synthetic fixture documents; source host identity is fixed by the seed. Source configuration allows editing owner, cadence, depth, timezone, and program labels, with a new policy version and audit entry. It does **not** enable arbitrary URL crawling. The browser renders retrieved text as escaped text, no scripts from documents execute, original downloads are forced as attachments, and the server is loopback-only. Source instructions are treated as data.

**Not implemented / not production ready:** Real site fetchers; DNS/IP/redirect SSRF defense; actual OCR or untrusted PDF text extraction; real authentication, multi-tenant roles and authorization; job scheduling/retries outside a manual replay; semantic/paragraph-heading-aware diff; real versioned source-adapter migrations; external exports/integrations; incident alerting; a privacy/retention policy suitable for real client records; independent security review. A local organization label plus loopback binding is **not** production identity security. Do not expose the demo server to an untrusted network.

Data retention: SQLite rows persist until the synthetic reset, manual deletion of the DB, or removal of the project. `reset` wipes only the synthetic organization within this single-organization demo; the application is not built to hold non-demo records. Copies of original snapshots are intentionally retained for audit traceability. No external transmission or analytics telemetry exists.

## Further documentation

- `docs/PRODUCT_BRIEF.md` — product scope, workflow/state model, acceptance and risks.
- `docs/PILOT_PLAN.md` — client discovery, shadow-mode protocol, measures and stop criteria.
- `docs/IMPLEMENTATION_STATUS.md` — implemented vs deferred with verification observations.
- `docs/TEST_RESULTS.md` — test observations and explicitly bounded verification claims.
- `migrations/001_init.sql` — full database schema.
- `fixtures/history.json`, `fixtures/expected.json` and `fixtures/raw/` — synthetic input sequences, expected result manifest and original PDFs.
- `fixtures/generate.py` — optional deterministic fixture regeneration script (requires Python, ReportLab and Pillow, but is *not* required to run the app).

### Inspiration and provenance

Harbor Policy Operations is a fictional, original implementation using synthetic records. The project does not incorporate third-party code, branding, customer records, interview findings or performance figures. It should not be interpreted as evidence of customer validation.