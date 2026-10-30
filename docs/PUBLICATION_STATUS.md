# Source publication status

As of 2026-10-30, **the complete Harbor Policy Operations v0.2 application is available as a ZIP artifact in the ChatGPT project conversation**. GitHub currently contains the overview, configuration and change-detection module, but not yet all runnable server/UI/fixture files.

Do not infer production readiness from public repository visibility. The offline demo uses synthetic documents and an SQLite database; live monitoring and third-party integrations remain disabled.

## Completed locally

- Evidence receipt JSON with SHA-256 and normalized evidence consistency checks
- Linked PDF $2,000 to $2,500 change detection and idempotent candidates
- Human review and action transitions
- Simulated incomplete coverage and untrusted-text isolation
- **22/22 local automated tests passed**

## Finish the upload without rewriting repository history

1. Download the GitHub-ready ZIP from the ChatGPT conversation.
2. Extract it on a workstation with Git, rsync and GitHub push authentication.
3. Run `bash scripts/publish-to-github.sh` inside the extracted directory.
4. Verify GitHub Actions completes `npm test` and inspect the published source.

The publishing script is in the ZIP, not in this partially populated repository yet.
