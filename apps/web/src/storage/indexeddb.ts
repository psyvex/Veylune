import type { ArtifactRecord, ProjectRevision, ProjectStore } from "./contracts";

const DATABASE_VERSION = 1;
const ARTIFACTS = "artifacts";
const REVISIONS = "revisions";

interface StoredArtifact extends ArtifactRecord { data: ArrayBuffer }

export class IndexedDbProjectStore implements ProjectStore {
  constructor(private readonly databaseName = "veylune") {}

  async readRevision(projectId: string): Promise<ProjectRevision | undefined> {
    assertProjectId(projectId);
    const db = await openDatabase(this.databaseName);
    try {
      return await requestValue<ProjectRevision | undefined>(db.transaction(REVISIONS, "readonly").objectStore(REVISIONS).get(projectId));
    } finally {
      db.close();
    }
  }

  async stageArtifact(record: ArtifactRecord, data: ArrayBuffer): Promise<void> {
    validateArtifact(record, data);
    const actualHash = await sha256Hex(data);
    if (actualHash !== record.hash) throw new Error("Artifact hash does not match content.");
    const db = await openDatabase(this.databaseName);
    try {
      const transaction = db.transaction(ARTIFACTS, "readwrite");
      transaction.objectStore(ARTIFACTS).put({ ...record, data } satisfies StoredArtifact);
      await transactionComplete(transaction);
    } finally {
      db.close();
    }
  }

  async commitRevision(revision: ProjectRevision): Promise<void> {
    validateRevision(revision);
    const db = await openDatabase(this.databaseName);
    try {
      const transaction = db.transaction(REVISIONS, "readwrite");
      const store = transaction.objectStore(REVISIONS);
      const current = await requestValue<ProjectRevision | undefined>(store.get(revision.projectId));
      if (current && (revision.parentRevision === undefined || revision.parentRevision !== current.revision)) {
        transaction.abort();
        throw new Error("Revision conflict: parent revision is stale.");
      }
      if (!current && revision.parentRevision !== undefined) {
        transaction.abort();
        throw new Error("Revision conflict: project does not exist.");
      }
      if (current && revision.revision !== current.revision + 1) {
        transaction.abort();
        throw new Error("Revision numbers must increase monotonically.");
      }
      store.put(revision);
      await transactionComplete(transaction);
    } finally {
      db.close();
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    assertProjectId(projectId);
    const db = await openDatabase(this.databaseName);
    try {
      const transaction = db.transaction(REVISIONS, "readwrite");
      transaction.objectStore(REVISIONS).delete(projectId);
      await transactionComplete(transaction);
    } finally {
      db.close();
    }
  }
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ARTIFACTS)) db.createObjectStore(ARTIFACTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(REVISIONS)) db.createObjectStore(REVISIONS, { keyPath: "projectId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function validateArtifact(record: ArtifactRecord, data: ArrayBuffer): void {
  if (!record.id || record.id.length > 256) throw new Error("Invalid artifact ID.");
  if (!/^[a-f0-9]{64}$/.test(record.hash)) throw new Error("Artifact hash must be SHA-256 hex.");
  if (!Number.isSafeInteger(record.byteLength) || record.byteLength !== data.byteLength || record.byteLength < 0) throw new Error("Artifact byte length mismatch.");
  if (!record.mediaType || record.mediaType.length > 256 || !record.createdAt) throw new Error("Invalid artifact metadata.");
}

function validateRevision(revision: ProjectRevision): void {
  if (!revision.projectId || revision.projectId.length > 256) throw new Error("Invalid project ID.");
  if (!Number.isSafeInteger(revision.revision) || revision.revision < 0) throw new Error("Invalid revision number.");
  if (!Number.isSafeInteger(revision.schemaVersion) || revision.schemaVersion <= 0) throw new Error("Invalid schema version.");
  if (revision.parentRevision !== undefined && (!Number.isSafeInteger(revision.parentRevision) || revision.parentRevision < 0)) throw new Error("Invalid parent revision.");
  if (new Set(revision.artifactIds).size !== revision.artifactIds.length) throw new Error("Duplicate artifact reference.");
}

function assertProjectId(projectId: string): void {
  if (!projectId || projectId.length > 256) throw new Error("Invalid project ID.");
}
