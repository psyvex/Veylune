# Worker Job Lifecycle

`WorkerJobTransport` is the browser boundary for long-running reconstruction work. Job IDs are authoritative: messages for unknown or already-completed jobs are ignored, while malformed messages are rejected before reaching application listeners.

A job transitions from active to cancelling when cancellation is requested. A worker `cancelled` response is surfaced as a terminal cancelled job event. Worker failures fail every active job and clear their active state. Disposal removes listeners, clears state, and terminates the worker when supported.

The transport deliberately does not own reconstruction state or numerical optimization. Version-aware state validation belongs to the reconstruction state layer; the worker controller must pass the correct session/version into the job and reject stale results before commit.
