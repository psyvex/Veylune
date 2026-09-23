# 16. Local Storage Contract

## Goal

Provide durable, private, crash-tolerant project storage without coupling the domain model to a specific browser database.

## Layers

```text
Project repository API
        |
   Storage adapter
        |
 +------+-------+
 |              |
IndexedDB       OPFS
metadata        large binary artifacts
```

## Ownership

- Project metadata, manifests, indexes and small structured records belong in the structured-storage layer.
- Large images, meshes, textures, model files and intermediate artifacts belong in the binary-artifact layer.
- Domain code must depend on repository interfaces, never directly on IndexedDB or OPFS.

## Artifact identity

Every stored artifact has:

- stable ID
- content hash
- media/type metadata
- byte length
- schema/version where applicable
- creation/update timestamps
- provenance reference

## Integrity

On write, validate metadata and enforce configured size limits. For content-addressed artifacts, verify the expected hash before publishing the artifact as complete.

Incomplete writes must remain invisible to normal project reads.

## Atomicity

Project mutations use a staged-write pattern:

1. write new artifact
2. validate artifact
3. write manifest/index update
4. commit logical project revision
5. garbage-collect unreachable artifacts later

A browser crash between stages must leave the previous valid revision readable.

## Quotas

Storage adapters must surface quota pressure as a structured condition. The application should offer cleanup of derived/intermediate artifacts before asking the user to delete source data.

## Privacy

Local storage is still sensitive storage. The application must provide project deletion and cache/derived-data cleanup. No telemetry should enumerate project contents or artifact names unless explicitly enabled by the user.

## Portability

The storage layer must not become the project format. Projects need an explicit export/import representation so users can back up or migrate their work independently of browser storage.
