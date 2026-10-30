-- Harbor local demo schema (migration 001, idempotent DDL)
CREATE TABLE IF NOT EXISTS sources(
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL CHECK(org_id='harbor-demo'), name TEXT NOT NULL,
      canonical_url TEXT NOT NULL,allowed_host TEXT NOT NULL,document_types TEXT NOT NULL,
      cadence_minutes INTEGER NOT NULL CHECK(cadence_minutes BETWEEN 15 AND 10080),
      attachment_depth INTEGER NOT NULL CHECK(attachment_depth BETWEEN 0 AND 3),
      program_labels TEXT NOT NULL,timezone TEXT NOT NULL,owner TEXT NOT NULL,
      replay_cursor INTEGER NOT NULL DEFAULT 0, last_attempt_at TEXT,last_success_at TEXT,
      latest_status TEXT NOT NULL DEFAULT 'never_checked',latest_error TEXT);
    CREATE TABLE IF NOT EXISTS source_policy_versions(
      id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),config TEXT NOT NULL,
      created_at TEXT NOT NULL,created_by TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fetch_attempts(
      id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),fixture_version INTEGER NOT NULL,
      attempted_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('success','failure')),
      reason TEXT,scope_decisions TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshots(
      id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),fixture_version INTEGER NOT NULL,
      homepage_original BLOB NOT NULL,homepage_sha TEXT NOT NULL,retrieved_at TEXT NOT NULL,
      published_date TEXT,UNIQUE(source_id,fixture_version));
    CREATE TABLE IF NOT EXISTS linked_documents(
      id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),document_key TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,UNIQUE(source_id,document_key));
    CREATE TABLE IF NOT EXISTS document_versions(
      id TEXT PRIMARY KEY,linked_document_id TEXT NOT NULL REFERENCES linked_documents(id),
      original_bytes BLOB NOT NULL,sha256 TEXT NOT NULL,extracted_text TEXT NOT NULL,
      content_type TEXT NOT NULL,extraction_method TEXT NOT NULL,extraction_uncertain INTEGER NOT NULL,
      recorded_at TEXT NOT NULL,UNIQUE(linked_document_id,sha256));
    CREATE TABLE IF NOT EXISTS snapshot_documents(
      snapshot_id TEXT NOT NULL REFERENCES snapshots(id),document_version_id TEXT NOT NULL REFERENCES document_versions(id),
      source_path TEXT NOT NULL,depth INTEGER NOT NULL,PRIMARY KEY(snapshot_id,document_version_id));
    CREATE TABLE IF NOT EXISTS normalization_runs(
      id TEXT PRIMARY KEY,document_version_id TEXT NOT NULL REFERENCES document_versions(id),
      normalizer_version TEXT NOT NULL,normalized_text TEXT NOT NULL,normalized_hash TEXT NOT NULL,
      UNIQUE(document_version_id,normalizer_version));
    CREATE TABLE IF NOT EXISTS change_candidates(
      id TEXT PRIMARY KEY,org_id TEXT NOT NULL CHECK(org_id='harbor-demo'),source_id TEXT NOT NULL REFERENCES sources(id),
      snapshot_id TEXT NOT NULL REFERENCES snapshots(id),linked_document_id TEXT NOT NULL REFERENCES linked_documents(id),
      before_version_id TEXT,after_version_id TEXT,before_sha TEXT NOT NULL,after_sha TEXT NOT NULL,
      source_path TEXT NOT NULL,change_kind TEXT NOT NULL,summary TEXT NOT NULL,
      detected_at TEXT NOT NULL,published_date TEXT,effective_date_candidate TEXT,date_uncertainty TEXT,
      normalization_version TEXT NOT NULL,machine_suggestion TEXT NOT NULL,
      UNIQUE(source_id,linked_document_id,before_sha,after_sha,normalization_version));
    CREATE TABLE IF NOT EXISTS diff_hunks(
      id TEXT PRIMARY KEY,candidate_id TEXT NOT NULL REFERENCES change_candidates(id),ordinal INTEGER NOT NULL,
      kind TEXT NOT NULL,section TEXT NOT NULL,before_text TEXT NOT NULL,after_text TEXT NOT NULL,
      UNIQUE(candidate_id,ordinal));
    CREATE TABLE IF NOT EXISTS review_dispositions(
      id TEXT PRIMARY KEY,candidate_id TEXT NOT NULL REFERENCES change_candidates(id),
      classification TEXT NOT NULL CHECK(classification IN ('editorial','relevant','urgent','needs_domain_review','dismissed')),
      reviewer TEXT NOT NULL,note TEXT NOT NULL,confirmed_effective_date TEXT,
      reviewed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS action_items(
      id TEXT PRIMARY KEY,org_id TEXT NOT NULL CHECK(org_id='harbor-demo'),candidate_id TEXT NOT NULL UNIQUE REFERENCES change_candidates(id),
      owner TEXT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('assigned','acknowledged','resolved')),
      note TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS digest_drafts(
      id TEXT PRIMARY KEY,org_id TEXT NOT NULL CHECK(org_id='harbor-demo'),body TEXT NOT NULL,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_events(
      id TEXT PRIMARY KEY,org_id TEXT NOT NULL CHECK(org_id='harbor-demo'),object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,event TEXT NOT NULL,actor TEXT NOT NULL,metadata TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_candidates_source ON change_candidates(source_id);
    CREATE INDEX IF NOT EXISTS idx_actions_status ON action_items(status);
