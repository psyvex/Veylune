import type { CapabilityProfile } from "../runtime/capabilities";
import { mountCaptureApp, type CaptureApp } from "../capture/capture-app";
import { IndexedDbProjectStore } from "../storage/indexeddb";
import { isSupportedImage, relativeName, StudioProjectService, type ProjectWithAssets } from "./project-service";
import { mountVeyluneLoader, type VeyluneLoader } from "../branding/veylune-loader";
import { voxelBloomSvg } from "../branding/voxel-bloom";

type Page = "overview" | "projects" | "import" | "capture" | "settings" | "project";
type Theme = "obsidian" | "glacier" | "moss";
const NAV = [{ route: "overview", label: "Overview", icon: "◫" }, { route: "projects", label: "Projects", icon: "▦" }, { route: "capture", label: "Capture", icon: "◎" }, { route: "settings", label: "Preferences", icon: "⌘" }] as const;
const THEMES: readonly { id: Theme; name: string; detail: string }[] = [{ id: "obsidian", name: "Obsidian", detail: "Deep graphite with electric citron" }, { id: "glacier", name: "Glacier", detail: "Soft stone with crisp blue accents" }, { id: "moss", name: "Moss", detail: "Warm charcoal with botanical green" }];

export function mountStudioApp(root: HTMLElement, capabilities: CapabilityProfile): { dispose(): void } {
  const service = new StudioProjectService(new IndexedDbProjectStore());
  let selectedFiles: File[] = [];
  let activeCapture: CaptureApp | undefined;
  let activeAssetUrls: string[] = [];
  // The import button's loader, kept so a route change or an unmount can stop its
  // timers the same way `activeCapture` is stopped.
  let pendingSave: VeyluneLoader | undefined;
  let disposed = false;
  let theme = readTheme();
  root.innerHTML = `<div class="studio-shell veylune-glass-theme" data-accent="${theme}"><aside class="studio-sidebar"><a class="studio-brand" href="#/overview" aria-label="Veylune Studio home"><span class="brand-glyph">${voxelBloomSvg({ variant: "compact" })}</span><span><b>Veylune</b><small>STUDIO</small></span></a><div class="workspace-switch"><span class="workspace-avatar">P</span><span><b>Personal workspace</b><small>Local library</small></span><span class="switch-chevron">⌄</span></div><nav class="studio-nav" aria-label="Main navigation"><p class="nav-caption">WORKSPACE</p>${NAV.map((item) => `<a href="#/${item.route}" data-nav="${item.route}"><span class="nav-icon" aria-hidden="true">${item.icon}</span>${item.label}<span class="nav-active-mark"></span></a>`).join("")}<p class="nav-caption nav-caption-tools">TOOLS</p><a href="#/import" data-nav="import"><span class="nav-icon" aria-hidden="true">↥</span>Import images<span class="nav-active-mark"></span></a></nav><div class="sidebar-bottom"><div class="local-storage-note"><span class="storage-pulse"></span><span><b>Private by design</b><small>Files stay in this browser</small></span></div><button class="profile-button" type="button"><span class="profile-avatar">P</span><span><b>Personal</b><small>Local account</small></span><span class="switch-chevron">···</span></button></div></aside><div class="studio-main"><header class="studio-topbar"><div class="breadcrumbs"><span>Workspace</span><span class="breadcrumb-slash">/</span><b data-page-title>Overview</b></div><div class="topbar-actions"><span class="local-pill"><span></span>LOCAL PROJECTS</span><button class="icon-button" type="button" data-action="theme" aria-label="Open appearance settings">◐</button><a class="topbar-cta" href="#/import"><span aria-hidden="true">＋</span> New project</a></div></header><main class="studio-content" id="studio-content" tabindex="-1"></main></div></div>`;
  const shell = root.querySelector<HTMLElement>(".studio-shell")!;
  const content = root.querySelector<HTMLElement>("#studio-content")!;
  // Glacier is the one accent that reads as a light theme; the other two stay
  // dark. `data-theme` lives on <html> (the design tokens read it there, see
  // src/design/tokens.css), so this choice also carries over to the
  // marketing page's own light/dark toggle and back.
  document.documentElement.dataset.theme = theme === "glacier" ? "light" : "dark";
  const pageTitle = root.querySelector<HTMLElement>("[data-page-title]")!;
  const routeHandler = (): void => { void renderRoute(); };
  root.addEventListener("click", (event) => { const target = event.target; if (target instanceof Element && target.closest('[data-action="theme"]')) location.hash = "#/settings"; });
  window.addEventListener("hashchange", routeHandler);
  void renderRoute();

  async function renderRoute(): Promise<void> {
    if (disposed) return;
    activeCapture?.dispose(); activeCapture = undefined;
    pendingSave?.dispose(); pendingSave = undefined;
    for (const url of activeAssetUrls) URL.revokeObjectURL(url);
    activeAssetUrls = [];
    const { page, projectId } = parseRoute(location.hash);
    root.querySelectorAll<HTMLElement>("[data-nav]").forEach((link) => { const active = link.dataset.nav === page || page === "project" && link.dataset.nav === "projects"; link.classList.toggle("is-active", active); if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current"); });
    pageTitle.textContent = page === "project" ? "Project" : page === "import" ? "Import images" : page === "settings" ? "Preferences" : page === "capture" ? "Capture" : page === "projects" ? "Projects" : "Overview";
    if (page === "overview") await renderOverview();
    else if (page === "projects") await renderProjects();
    else if (page === "import") renderImport();
    else if (page === "settings") renderSettings();
    else if (page === "capture") renderCapture();
    else await renderProject(projectId);
  }

  async function renderOverview(): Promise<void> {
    const projects = await safeListProjects(); if (disposed) return;
    content.innerHTML = `<section class="welcome-row"><div><p class="overline">YOUR RECONSTRUCTION WORKSPACE</p><h1>Make something <span>real.</span></h1><p class="welcome-copy">Turn photos and camera scans into detailed 3D captures. Everything is processed and stored on this device.</p><div class="hero-actions"><a class="action-primary" href="#/import">＋ &nbsp; Import images</a><a class="action-secondary" href="#/capture">◎ &nbsp; Start a capture</a></div></div><div class="hero-visual" aria-hidden="true"><div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div><div class="hero-shape"><span></span><span></span><span></span><span></span><span></span><span></span></div><div class="hero-coordinate coord-one">X <b>+02.481</b></div><div class="hero-coordinate coord-two">Y <b>−11.203</b></div><div class="hero-coordinate coord-three">Z <b>+04.782</b></div><div class="hero-visual-caption">SPATIAL ENGINE <span>READY</span></div></div></section><section class="quick-stats"><div><span class="stat-label">TOTAL PROJECTS</span><b>${projects.length.toString().padStart(2,"0")}</b><small>Saved on this device</small></div><div><span class="stat-label">SOURCE IMAGES</span><b>${projects.reduce((sum, project) => sum + project.assetIds.length, 0).toString().padStart(2,"0")}</b><small>Available to your projects</small></div><div><span class="stat-label">PROCESSING</span><b class="stat-local">LOCAL</b><small>No cloud uploads</small></div></section><section class="section-block"><div class="section-heading"><div><p class="overline">PICK UP WHERE YOU LEFT OFF</p><h2>Recent projects</h2></div><a class="text-link" href="#/projects">View all projects <span>↗</span></a></div>${projects.length ? projectGrid(projects.slice(0,3)) : emptyProjects()}</section><section class="workflow-strip"><div class="workflow-number">01</div><div><p class="overline">NEW TO VEYLUNE?</p><h3>From images to spatial insight</h3><p>Import a set of photos from your computer or capture a subject from multiple angles.</p></div><a href="#/import" class="workflow-link">Explore import workflow <span>→</span></a></section>`;
  }

  async function renderProjects(): Promise<void> {
    const projects = await safeListProjects(); if (disposed) return;
    content.innerHTML = `<section class="page-intro"><div><p class="overline">YOUR LIBRARY</p><h1>Projects</h1><p>All of your source images and captures, stored privately on this device.</p></div><a class="action-primary" href="#/import">＋ &nbsp; New project</a></section>${projects.length ? projectGrid(projects) : emptyProjects()}`;
  }

  function renderImport(): void {
    selectedFiles = [];
    content.innerHTML = `<section class="page-intro"><div><p class="overline">LOCAL FILE IMPORT</p><h1>Bring your images in.</h1><p>Choose individual photos or an entire folder. Files are saved locally in this browser.</p></div></section><section class="import-layout"><div class="import-main-card"><div class="drop-zone" data-drop-zone tabindex="0" role="button" aria-label="Choose or drop image files to import"><div class="drop-icon" aria-hidden="true">↥</div><h2>Drop images here</h2><p>or browse your computer to select JPG, PNG, WebP, AVIF, HEIC, or TIFF files</p><div class="drop-actions"><button class="action-primary" type="button" data-action="choose-files">Choose images</button><button class="action-secondary" type="button" data-action="choose-folder">Choose folder</button></div><small>Up to 1,000 images · Files stay on this device</small></div><input hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp,image/tiff,image/heic,image/heif" multiple data-file-input><input hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp,image/tiff,image/heic,image/heif" multiple data-folder-input><div class="selected-files" data-selected-files hidden></div></div><aside class="import-aside"><div class="import-info-card"><div class="info-card-mark">✳</div><h3>Private local storage</h3><p>Your source images are written to this browser’s IndexedDB. Veylune does not upload them.</p><div class="privacy-line"><span>Storage</span><b>On this device</b></div><div class="privacy-line"><span>Original files</span><b>Preserved</b></div></div><div class="import-info-card supported-card"><p class="overline">SUPPORTED FORMATS</p><div class="format-tags"><span>JPG</span><span>PNG</span><span>WEBP</span><span>AVIF</span><span>HEIC</span><span>TIFF</span></div><p class="small-note">Choose a directory when importing a complete photo set.</p></div></aside></section><p class="import-error" data-import-error role="status" aria-live="polite"></p>`;
    const fileInput = content.querySelector<HTMLInputElement>("[data-file-input]")!;
    const folderInput = content.querySelector<HTMLInputElement>("[data-folder-input]")!;
    folderInput.setAttribute("webkitdirectory", ""); folderInput.setAttribute("directory", "");
    content.querySelector('[data-action="choose-files"]')!.addEventListener("click", () => fileInput.click());
    content.querySelector('[data-action="choose-folder"]')!.addEventListener("click", () => folderInput.click());
    fileInput.addEventListener("change", () => showSelectedFiles(Array.from(fileInput.files ?? [])));
    folderInput.addEventListener("change", () => showSelectedFiles(Array.from(folderInput.files ?? [])));
    const dropZone = content.querySelector<HTMLElement>("[data-drop-zone]")!;
    dropZone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); } });
    dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("is-dragging"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
    dropZone.addEventListener("drop", (event) => { event.preventDefault(); dropZone.classList.remove("is-dragging"); showSelectedFiles(Array.from(event.dataTransfer?.files ?? [])); });
  }

  function showSelectedFiles(files: File[]): void {
    const supported = files.filter(isSupportedImage);
    const rejectedCount = files.length - supported.length;
    selectedFiles = supported;
    const list = content.querySelector<HTMLElement>("[data-selected-files]")!;
    const error = content.querySelector<HTMLElement>("[data-import-error]")!;
    error.textContent = rejectedCount ? `${rejectedCount} unsupported or empty file${rejectedCount === 1 ? " was" : "s were"} skipped.` : "";
    list.hidden = supported.length === 0;
    if (!supported.length) { list.innerHTML = ""; return; }
    const name = inferName(supported);
    list.innerHTML = `<div class="selected-heading"><div><p class="overline">READY TO IMPORT</p><h2>${supported.length} image${supported.length === 1 ? "" : "s"} selected</h2></div><button type="button" class="quiet-button" data-action="clear-files">Clear</button></div><label class="project-name-label" for="new-project-name">Project name</label><input class="project-name-input" id="new-project-name" value="${escapeHTML(name)}" maxlength="120"><div class="file-list">${supported.slice(0,6).map((file) => `<div><span class="file-type-mark">${escapeHTML(file.name.split(".").pop()?.slice(0,4).toUpperCase() ?? "IMG")}</span><span class="file-name">${escapeHTML(relativeName(file))}</span><span class="file-size">${formatBytes(file.size)}</span></div>`).join("")}${supported.length > 6 ? `<p class="more-files">and ${supported.length - 6} more images</p>` : ""}</div><button class="action-primary import-submit" type="button" data-action="import-submit">Save project locally <span>→</span></button>`;
    list.querySelector('[data-action="clear-files"]')!.addEventListener("click", () => showSelectedFiles([]));
    list.querySelector('[data-action="import-submit"]')!.addEventListener("click", () => { const input = list.querySelector<HTMLInputElement>("#new-project-name")!; void saveImport(input.value); });
  }

  async function saveImport(name: string): Promise<void> {
    const error = content.querySelector<HTMLElement>("[data-import-error]")!;
    const button = content.querySelector<HTMLButtonElement>('[data-action="import-submit"]');
    if (!button) return;
    button.disabled = true;
    button.innerHTML = `<span data-button-loader></span> Saving to this device…`;
    // The identity assembling itself, instead of a spinner: it forms once and then
    // rests for as long as the import takes. The button's own text is the
    // announcement, so the loader stays out of the accessibility tree.
    const loader = mountVeyluneLoader(button.querySelector<HTMLElement>("[data-button-loader]")!, {
      size: "inline",
      className: "button-loader",
      announce: false,
    });
    pendingSave = loader;
    // The loader belongs to this import only: a route change may have already
    // disposed it while the import was running, and an unmount must not leave its
    // timers writing attributes onto nodes that are gone.
    const done = (): void => {
      if (pendingSave === loader) pendingSave = undefined;
      loader.dispose();
    };
    try {
      const project = await service.importImages(selectedFiles, name);
      done();
      if (!disposed) location.hash = `#/project/${encodeURIComponent(project.id)}`;
    } catch (cause) {
      done();
      if (disposed) return;
      error.textContent = cause instanceof Error ? cause.message : "Images could not be saved. Check your browser storage and try again.";
      button.disabled = false; button.innerHTML = "Try again <span>→</span>";
    }
  }

  function renderSettings(): void {
    content.innerHTML = `<section class="page-intro"><div><p class="overline">MAKE IT YOUR SPACE</p><h1>Preferences</h1><p>Adjust the Studio’s appearance. Your choice is saved on this device.</p></div></section><section class="settings-section"><div class="settings-heading"><div><h2>Color theme</h2><p>Professional palettes designed for long sessions and accurate contrast.</p></div><span class="settings-saved">Saved automatically</span></div><div class="theme-grid">${THEMES.map((item) => `<button class="theme-option ${theme === item.id ? "is-selected" : ""}" data-theme-option="${item.id}" type="button" aria-pressed="${theme === item.id}"><span class="theme-preview theme-${item.id}"><i></i><i></i><i></i><b></b></span><span class="theme-copy"><b>${item.name}</b><small>${item.detail}</small></span><span class="theme-check" aria-hidden="true">✓</span></button>`).join("")}</div></section><section class="settings-section privacy-settings"><div class="settings-heading"><div><h2>Local-first storage</h2><p>Imported images and project records remain in this browser’s IndexedDB.</p></div></div><div class="storage-status"><span class="storage-pulse"></span><div><b>Browser storage enabled</b><small>Veylune does not send source images to a server.</small></div></div></section>`;
    content.querySelectorAll<HTMLButtonElement>("[data-theme-option]").forEach((button) => button.addEventListener("click", () => { const next = button.dataset.themeOption as Theme; if (!THEMES.some((option) => option.id === next)) return; theme = next; shell.dataset.accent = theme; document.documentElement.dataset.theme = theme === "glacier" ? "light" : "dark"; try { localStorage.setItem("veylune-theme", theme); } catch { /* Theme remains active for this visit. */ } renderSettings(); }));
  }

  function renderCapture(): void {
    content.innerHTML = `<section class="capture-route-heading"><div><p class="overline">LIVE RECONSTRUCTION</p><h1>Capture</h1><p>Move slowly around your subject. Refinement runs while you scan.</p></div><a href="#/projects" class="text-link">Back to projects <span>↗</span></a></section><div class="embedded-capture" data-capture-root></div>`;
    activeCapture = mountCaptureApp(content.querySelector<HTMLElement>("[data-capture-root]")!, capabilities);
  }

  async function renderProject(projectId: string): Promise<void> {
    const project = await service.loadProject(projectId); if (disposed) return;
    if (!project) { content.innerHTML = `<div class="empty-state"><div class="empty-symbol">?</div><h1>Project not found</h1><p>This project may have been removed from this browser.</p><a class="action-primary" href="#/projects">Back to projects</a></div>`; return; }
    activeAssetUrls = project.assets.map((asset) => asset.url);
    content.innerHTML = `<section class="page-intro project-detail-intro"><div><a class="back-link" href="#/projects">← All projects</a><p class="overline">LOCAL PROJECT · ${new Date(project.createdAt).toLocaleDateString()}</p><h1>${escapeHTML(project.name)}</h1><p>${project.assets.length} source image${project.assets.length === 1 ? "" : "s"} · Stored on this device</p></div><a class="action-primary" href="#/capture">◎ &nbsp; Start a capture</a></section><section class="section-block asset-section"><div class="section-heading"><div><p class="overline">SOURCE MATERIAL</p><h2>Imported images</h2></div><span class="asset-count">${project.assets.length.toString().padStart(2,"0")} FILES</span></div><div class="asset-grid">${project.assets.map((asset) => `<figure class="asset-card"><img src="${asset.url}" alt="${escapeHTML(asset.name)}" loading="lazy"><figcaption><span>${escapeHTML(asset.name.split("/").pop() ?? asset.name)}</span><small>${formatBytes(asset.size)}</small></figcaption></figure>`).join("")}</div></section>`;
  }

  async function safeListProjects() { try { return await service.listProjects(); } catch { return []; } }
  function dispose(): void { if (disposed) return; disposed = true; pendingSave?.dispose(); pendingSave = undefined; activeCapture?.dispose(); activeAssetUrls.forEach(URL.revokeObjectURL); window.removeEventListener("hashchange", routeHandler); }
  return { dispose };
}

function parseRoute(hash: string): { page: Page; projectId: string } { const [first, second] = hash.replace(/^#\/?/, "").split("/"); if (first === "projects" && second) return { page: "project", projectId: decodeURIComponent(second) }; if (first === "projects" || first === "import" || first === "capture" || first === "settings") return { page: first, projectId: "" }; return { page: "overview", projectId: "" }; }
function readTheme(): Theme { try { const stored = localStorage.getItem("veylune-theme"); return THEMES.some((item) => item.id === stored) ? stored as Theme : "obsidian"; } catch { return "obsidian"; } }
function projectGrid(projects: readonly { id: string; name: string; createdAt: string; updatedAt: string; assetIds: readonly string[] }[]): string { return `<div class="project-grid">${projects.map((project,index) => `<a class="project-card" href="#/projects/${encodeURIComponent(project.id)}"><div class="project-cover cover-${index % 3}"><div class="cover-orb"></div><span class="cover-label">${project.assetIds.length ? `${project.assetIds.length} SOURCE IMAGES` : "CAMERA CAPTURE"}</span><span class="cover-index">${String(index + 1).padStart(2,"0")}</span></div><div class="project-card-info"><div><h3>${escapeHTML(project.name)}</h3><p>Updated ${escapeHTML(new Date(project.updatedAt).toLocaleDateString())}</p></div><span class="project-arrow">↗</span></div></a>`).join("")}</div>`; }
function emptyProjects(): string { return `<div class="empty-state"><div class="empty-symbol">＋</div><h2>Your first project starts here</h2><p>Import a photo set from your computer or start a live camera capture.</p><div class="empty-actions"><a href="#/import" class="action-primary">Import images</a><a href="#/capture" class="action-secondary">Start a capture</a></div></div>`; }
function inferName(files: readonly File[]): string { const first = files[0]!; const folder = (first as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0]; return folder || first.name.replace(/\.[^.]+$/, "") || "Imported project"; }
function escapeHTML(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
function formatBytes(bytes: number): string { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
