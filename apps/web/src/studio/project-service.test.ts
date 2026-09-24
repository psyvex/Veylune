import { describe, expect, it } from "vitest";
import type { ArtifactRecord, ProjectRevision, ProjectStore, StoredArtifactData, StudioProjectRecord } from "../storage/contracts";
import { StudioProjectService, isSupportedImage } from "./project-service";

class MemoryProjectStore implements ProjectStore {
  readonly projects = new Map<string, StudioProjectRecord>();
  readonly artifacts = new Map<string, StoredArtifactData>();
  readonly revisions = new Map<string, ProjectRevision>();
  async readRevision(id: string): Promise<ProjectRevision | undefined> { return this.revisions.get(id); }
  async stageArtifact(record: ArtifactRecord, data: ArrayBuffer): Promise<void> { this.artifacts.set(record.id, { record, data }); }
  async commitRevision(revision: ProjectRevision): Promise<void> { this.revisions.set(revision.projectId, revision); }
  async deleteProject(id: string): Promise<void> { this.projects.delete(id); this.revisions.delete(id); }
  async listProjects(): Promise<readonly StudioProjectRecord[]> { return [...this.projects.values()]; }
  async writeProjectMetadata(project: StudioProjectRecord): Promise<void> { this.projects.set(project.id, project); }
  async readArtifacts(ids: readonly string[]): Promise<readonly StoredArtifactData[]> { return ids.flatMap((id) => this.artifacts.has(id) ? [this.artifacts.get(id)!] : []); }
  async deleteArtifacts(ids: readonly string[]): Promise<void> { ids.forEach((id) => this.artifacts.delete(id)); }
}

describe("StudioProjectService", () => {
  it("filters unsupported files and saves image data with a committed project revision", async () => {
    const store = new MemoryProjectStore();
    const service = new StudioProjectService(store, () => new Date("2026-02-03T04:05:06.000Z"), () => "project-1");
    const image = new File([new Uint8Array([1, 2, 3, 4])], "front.webp", { type: "image/webp" });

    expect(isSupportedImage(image)).toBe(true);
    expect(isSupportedImage(new File(["<svg />"], "vector.svg", { type: "image/svg+xml" }))).toBe(false);
    expect(isSupportedImage(new File(["text"], "notes.txt", { type: "text/plain" }))).toBe(false);

    const project = await service.importImages([image], "  Garden statue  ");
    expect(project.name).toBe("Garden statue");
    expect(project.assetIds).toHaveLength(1);
    expect(store.projects.get(project.id)).toEqual(project);
    expect(store.revisions.get(project.id)).toMatchObject({ projectId: project.id, revision: 0, artifactIds: project.assetIds });
    expect([...store.artifacts.values()][0]?.record).toMatchObject({ mediaType: "image/webp", byteLength: 4, provenance: "front.webp" });
  });

  it("rejects empty selections and cleans staged assets if project commit fails", async () => {
    const store = new MemoryProjectStore();
    const service = new StudioProjectService(store, () => new Date("2026-02-03T04:05:06.000Z"), () => "project-2");
    await expect(service.importImages([], "Empty")).rejects.toThrow("Choose one or more supported image files");
    store.commitRevision = async () => { throw new Error("revision write failed"); };
    await expect(service.importImages([new File([new Uint8Array([5])], "one.png", { type: "image/png" })], "Failed")).rejects.toThrow("revision write failed");
    expect(store.projects.has("project-2")).toBe(false);
    expect(store.artifacts.size).toBe(0);
  });
});
