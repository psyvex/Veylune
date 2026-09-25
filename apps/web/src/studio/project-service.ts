import type { ProjectStore, StudioProjectRecord } from "../storage/contracts";
import { sha256Hex } from "../storage/indexeddb";

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif",
};

export interface ProjectWithAssets extends StudioProjectRecord { readonly assets: readonly { readonly id: string; readonly name: string; readonly type: string; readonly size: number; readonly url: string }[]; }

export class StudioProjectService {
  constructor(private readonly store: ProjectStore, private readonly now: () => Date = () => new Date(), private readonly createId: () => string = () => crypto.randomUUID()) {}

  listProjects(): Promise<readonly StudioProjectRecord[]> { return this.store.listProjects(); }

  /** Deletes one project and everything stored for it (source images, revision
   * history, any saved reconstruction session) in a single store transaction. */
  deleteProject(projectId: string): Promise<void> { return this.store.deleteProject(projectId); }

  /** Deletes every project on this device. Used by the "Clear all local data"
   * action in Preferences; the caller is responsible for confirming with the
   * user first, since this cannot be undone. */
  async clearAllProjects(): Promise<void> {
    const projects = await this.store.listProjects();
    for (const project of projects) await this.store.deleteProject(project.id);
  }

  async loadProject(projectId: string): Promise<ProjectWithAssets | undefined> {
    const project = (await this.store.listProjects()).find((candidate) => candidate.id === projectId);
    if (!project) return undefined;
    const assets = await this.store.readArtifacts(project.assetIds);
    return { ...project, assets: assets.map(({ record, data }) => ({ id: record.id, name: record.provenance ?? record.id, type: record.mediaType, size: record.byteLength, url: URL.createObjectURL(new Blob([data], { type: record.mediaType })) })) };
  }

  async importImages(files: readonly File[], requestedName: string): Promise<StudioProjectRecord> {
    const images = files.filter(isSupportedImage);
    if (!images.length) throw new Error("Choose one or more supported image files to import.");
    if (images.length > 1000) throw new Error("A project can contain up to 1,000 images at a time.");
    const totalBytes = images.reduce((total, file) => total + file.size, 0);
    if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) throw new Error("The selected images are empty or too large to import.");
    const name = requestedName.trim().slice(0, 120) || inferProjectName(images[0]!);
    const id = this.createId();
    const createdAt = this.now().toISOString();
    const assetIds: string[] = [];
    try {
      for (let index = 0; index < images.length; index += 1) {
        const file = images[index]!;
        const data = await file.arrayBuffer();
        const hash = await sha256Hex(data);
        const assetId = `${id}:${index}:${hash.slice(0, 12)}`;
        assetIds.push(assetId);
        const mediaType = file.type || mimeFromName(file.name);
        await this.store.stageArtifact({ id: assetId, hash, byteLength: data.byteLength, mediaType, createdAt, provenance: relativeName(file) }, data);
      }
      const project: StudioProjectRecord = { id, name, createdAt, updatedAt: createdAt, assetIds };
      await this.store.writeProjectMetadata(project);
      await this.store.commitRevision({ projectId: id, revision: 0, schemaVersion: 1, artifactIds: assetIds });
      return project;
    } catch (error) {
      await this.store.deleteProject(id).catch(() => undefined);
      await this.store.deleteArtifacts(assetIds).catch(() => undefined);
      throw error;
    }
  }
}

export function isSupportedImage(file: Pick<File, "name" | "type" | "size">): boolean {
  return file.size > 0 && (file.type.startsWith("image/") && file.type !== "image/svg+xml" || MIME_BY_EXTENSION[extension(file.name)] !== undefined);
}

export function mimeFromName(name: string): string { return MIME_BY_EXTENSION[extension(name)] ?? "application/octet-stream"; }
export function relativeName(file: File): string { return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name; }
function extension(name: string): string { return name.split(".").pop()?.toLowerCase() ?? ""; }
function inferProjectName(file: File): string { const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath; const folder = relativePath?.split("/")[0]; return folder || file.name.replace(/\.[^.]+$/, "") || "Imported project"; }
