# Architecture rules

- Convert uploaded PDF files to inline multimodal file parts in the shared request helper, never run a local PDF engine in edge workers; PDF parsing can exceed their resource budget.
- Hash complete media content for analysis cache keys; prefix-only hashes can replay an unrelated document's analysis.- Extension: subdirectory extension/ holds the MV3 browser extension; it authenticates with revocable per-user tokens (hash-only in DB) via save-job, and the job tracker imports saved_jobs on load. Why: extensions cannot share the site session.
