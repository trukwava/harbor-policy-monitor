# Publish this demo to GitHub

**Current status:** The public repository now exists but has only a subset of files. For the current workflow, skip the create-new-repository section below and use the existing-repository script at the end of this guide.

This archive contains a complete **offline demonstration** of Harbor Policy Operations. It does not include customer data or connected accounts. Review the README's security limits before making any code public. Public GitHub visibility does not make a locally hosted Node server publicly deployable or production-safe.

## Create the empty repository

1. Open https://github.com/new, signed in to your GitHub account.
2. Repository name: **harbor-policy-monitor**.
3. Visibility: **Public**.
4. Leave the new repository **empty**: don't add a README, license, or `.gitignore` on GitHub (the archive already has them except for a license; the package is currently marked `UNLICENSED`).
5. Select **Create repository**.

## Upload from the extracted project directory

With Git installed and GitHub authentication configured in your shell:

```bash
git init -b main
git add .
git commit -m "Initial offline policy-change monitor demo"
git remote add origin https://github.com/trukwava/harbor-policy-monitor.git
git push -u origin main
```

`dist/`, `data/`, `.env`, and SQLite files are excluded by `.gitignore`. CI uses Node 22.13.1 and the pinned TypeScript 5.8.3 compiler to compile and run the deterministic tests. If the account/organization differs from `trukwava`, replace the owner in the remote URL.

This only publishes **source code**. Deployment of the server is intentionally out of scope until real authentication, production ingestion, SSRF protections, and independent review are implemented.

## Existing repository: safer complete-source upload

The repository `trukwava/harbor-policy-monitor` now exists and has initial GitHub commits. Do **not** initialize a disconnected Git history and force-push over those commits. From an extracted copy of the **v0.2 GitHub-ready ZIP**, with Git and rsync installed and authenticated GitHub push access, run:

```bash
bash scripts/publish-to-github.sh
```

The script clones the existing repository, stages only source/fixtures/docs, reviews the staged paths, commits, and pushes without force. It never includes `data/`, SQLite files, `.env`, `node_modules/`, or `dist/`. This finishes publication when the connected plugin cannot transfer a local binary ZIP directly.
