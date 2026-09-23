# 20. Project Revision Model

## Goal

Make project persistence crash-safe, undoable, migratable and independently exportable.

## Revision identity

Every committed project state has:

- project ID
- monotonically increasing revision number
- schema version
- parent revision
- creation timestamp
- content/artifact references

## Mutation model

User changes are applied to an in-memory working state and committed as a new logical revision.

```text
Stable revision
      |
      v
Working state
      |
 validate
      |
      v
New revision
```

Invalid mutations must never replace the last valid revision.

## Undo/redo

Undo/redo operates on project mutations or revision deltas, not on duplicated binary assets. Large unchanged artifacts remain content-addressed and shared.

## Autosave

Autosave should use debounced commits during active editing and an immediate checkpoint before destructive or long-running operations.

## Recovery

On startup:

1. locate the last committed revision
2. detect incomplete staged writes
3. discard incomplete writes
4. restore the last valid revision
5. offer recovery of a newer recoverable working state when integrity checks pass

## Migration

Opening an older schema invokes an explicit migration chain.

```text
v1 -> v2 -> v3 -> current
```

Migrations must be deterministic, tested fixtures must exist for every supported legacy version, and the original imported project must remain recoverable until migration succeeds.

## Export

Export creates a portable project package independent of browser storage. It includes the project manifest, required assets, provenance metadata and schema version.

## Deletion

Deleting a project removes its logical root and eventually garbage-collects unreachable artifacts. User-facing deletion should provide a clear distinction between project data and cached/derived data.
