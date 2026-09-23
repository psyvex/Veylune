# Reconstruction Persistence and Worker Boundary

Reconstruction sessions are persisted separately from binary project artifacts. IndexedDB schema version 2 creates a `reconstructionSessions` object store without disturbing existing artifact/revision stores.

Session execution has a serializable job boundary. Jobs validate the complete session before entering optimization, expose cancellation, and return only optimization metrics and commit status. A cancelled job must never be treated as successfully committed.

The worker boundary remains deliberately thin: numerical ownership stays in the reconstruction optimizer and state ownership stays in the versioned reconstruction state store. This prevents worker transport code from becoming a second state-management implementation.

A production worker controller should additionally enforce one active job per session, job IDs for stale-result rejection, memory/iteration budgets, and explicit worker termination. The current job boundary is the contract used by that controller.
