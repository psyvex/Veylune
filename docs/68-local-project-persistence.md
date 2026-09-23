# 68. Local Project Persistence

Veylune now has an IndexedDB-backed project store for browser-local persistence.

## Storage model

- artifacts are stored as binary data with metadata and SHA-256 content hashes
- project revisions are stored separately and advance monotonically
- revision commits use an IndexedDB read/write transaction
- stale parent revisions are rejected
- project deletion removes the project revision record without assuming an artifact is unreferenced elsewhere

## Integrity and privacy

Artifact byte length and SHA-256 content are verified before persistence. No server round trip is required by this storage layer, keeping capture/project data local by default.

The store does not silently upload or synchronize data. Any future cloud sync must be an explicit higher-level feature with separate consent, authentication, retention, and deletion semantics.

## Production follow-up

- quota estimation and graceful low-storage handling
- schema migration tests
- artifact reference counting and garbage collection
- project export/import validation
- crash and reload recovery fixtures
