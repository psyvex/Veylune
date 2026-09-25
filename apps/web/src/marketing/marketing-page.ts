/**
 * The public marketing page: hero + editorial sections + footer.
 *
 * `mountMarketingPage(root)` renders into `root` and returns `{ dispose }`, the same
 * mount/dispose contract used elsewhere in this codebase (`mountSpatialScene`,
 * `mountVoxelObject`, `mountVeyluneLoader`, …) — construct via `innerHTML`, wire listeners
 * and observers, and hand back a `dispose()` that undoes every side effect this mount made
 * (listeners, observers, rAF loops, child mounts) so a caller can tear down and remount
 * cleanly (route change, hot reload, test teardown).
 *
 * File layout:
 *   1. Static content/config (steps, frame rail, theme helpers, scene annotations)
 *   2. `render*()` — pure template-string builders, one per page section, composed by
 *      `mountMarketingPage` into a single `innerHTML` write. Kept as plain strings rather
 *      than a framework because the rest of this app already does DOM-by-`innerHTML`
 *      (see `spatial-scene.ts`, `voxel-object.ts`) — no new dependency, no build step change.
 *   3. `mountMarketingPage()` — the one exported entry point: render, then wire.
 */

import { mountVoxelObject } from "../branding/voxel-object";
import { voxelBloomSvg } from "../branding/voxel-bloom";
import { formatPoseReadout, INITIAL_POSE, mountSpatialScene } from "./spatial-scene";

// ---------------------------------------------------------------------------------------
// Static content & config
// ---------------------------------------------------------------------------------------

/** The three states the spatial-scene stage controls (and hero-adjacent panel) cycle. */
const STEPS = [
  { title: "Capture the scene", detail: "Move around your subject. Each viewpoint adds another set of visual clues.", label: "01 / CAPTURE" },
  { title: "Align the views", detail: "Keyframes connect into a shared pose graph, giving the map its spatial context.", label: "02 / ALIGN" },
  { title: "Refine the map", detail: "Local optimization revisits the geometry as new frames become available.", label: "03 / REFINE" },
] as const;

/** Per-step caption shown next to the canvas (`.scene-caption`), indexed like `STEPS`. */
const SCENE_CAPTIONS = ["ROOM / KEYFRAME MAP", "POSE GRAPH / ALIGNED VIEWS", "SPATIAL MAP / REFINED"] as const;

/**
 * The station numbers under the canvas. Eight, because the rig in the scene is eight
 * — the rail is a caption for a thing that is actually being drawn, not a decoration
 * that happens to look technical.
 */
const FRAME_RAIL = Array.from({ length: 8 }, (_, index) => `<li>${String(index + 1).padStart(2, "0")}</li>`).join("");

/**
 * What the scene is doing, in words, at the edges of the frame. Every label here
 * names something the canvas is drawing: the ring of keyframes, the graph between
 * them, the beam crossing the room. Nothing is a stand-in for depth the scene should
 * have painted itself, and the whole layer is decorative chrome to a screen reader —
 * the canvas already carries the one accessible description.
 */
const SCENE_ANNOTATIONS = `
      <div class="hero-annotations" aria-hidden="true">
        <div class="hero-note note-camera"><span>CAMERA INPUT</span><b>Keyframe 08</b><i class="note-rule"></i></div>
        <div class="hero-note note-orbit"><span>ORBIT</span><b data-scene-pose>${formatPoseReadout(INITIAL_POSE.yaw, INITIAL_POSE.pitch)}</b></div>
        <div class="hero-note note-depth"><span>DEPTH SOLVE</span><b>Local pass 04</b><i class="note-rule"></i></div>
        <div class="hero-note note-pose"><span>POSE GRAPH</span><b>8 views linked</b><i class="note-rule"></i></div>
        <div class="hero-note note-coverage"><span>COVERAGE</span><b>72%</b><i class="note-meter"><i></i></i></div>
      </div>`;

// ---------------------------------------------------------------------------------------
// Theme (light/dark)
// ---------------------------------------------------------------------------------------

/** Storage key for the reader's explicit theme choice. Absent until they pick one. */
const THEME_STORAGE_KEY = "veylune-theme";
type Theme = "light" | "dark";

/**
 * The system preference, read once. Only consulted when the reader has never chosen —
 * a stored choice always wins, on this visit and every one after, until they change it.
 */
const systemTheme = (): Theme => (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");

const readStoredTheme = (): Theme | undefined => {
  try {
    const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : undefined;
  } catch {
    // Private browsing / storage disabled: fall through to the system preference, silently.
    return undefined;
  }
};

/** `data-theme` lives on `<html>`, not the mounted root, so it survives a remount. */
const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute("data-theme", theme);
};

const SUN_ICON = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9"></path></svg>`;
const MOON_ICON = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.2A8.4 8.4 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2Z"></path></svg>`;

// ---------------------------------------------------------------------------------------
// Common components
//
// Small pieces repeated verbatim across sections (the brand mark, the eyebrow label, the
// filled CTA, the underlined link) — pulled out once so every call site stays in sync with
// a single source of markup instead of four copies that can drift apart under edits.
// ---------------------------------------------------------------------------------------

/** The brand mark: identical in the header and the footer, only the aria-label differs. */
function renderBrandMark(options?: { ariaLabel?: string }): string {
  const aria = options?.ariaLabel ? ` aria-label="${options.ariaLabel}"` : "";
  return `<a class="marketing-brand" href="#top"${aria}><span class="marketing-mark">${voxelBloomSvg({ variant: "compact" })}</span><span>veylune</span></a>`;
}

/** The small kicker label above a heading. Only the hero's carries the leading clay dot. */
function renderEyebrow(text: string, options?: { withDot?: boolean }): string {
  return `<p class="marketing-eyebrow">${options?.withDot ? "<span></span> " : ""}${text}</p>`;
}

/** The filled primary CTA — every instance points at Studio and carries the same arrow. */
function renderCtaButton(href: string, label: string): string {
  return `<a class="marketing-button" href="${href}">${label} <span>↗</span></a>`;
}

/** The quieter, underlined in-section link — same arrow treatment as the CTA, less weight. */
function renderUnderlinedLink(href: string, label: string): string {
  return `<a class="underlined-link" href="${href}">${label} <span>↗</span></a>`;
}

// ---------------------------------------------------------------------------------------
// Section templates
//
// Each function below returns one page section's markup verbatim (same classes, ids,
// attributes, and document order as before this file was split up) — this is purely a
// decomposition of what used to be one large `innerHTML` literal, so DOM structure and
// every selector `marketing-page.test.ts` relies on is unchanged.
// ---------------------------------------------------------------------------------------

function renderHeader(): string {
  return `<header class="marketing-header">${renderBrandMark({ ariaLabel: "Veylune home" })}<div class="header-actions"><button class="marketing-menu-toggle" type="button" aria-expanded="false" aria-controls="marketing-nav">Menu <span aria-hidden="true">＋</span></button><nav class="marketing-nav" id="marketing-nav" aria-label="Main navigation"><a href="#product">Product</a><a href="#workflow">How it works</a><a href="#privacy">Privacy</a><a class="nav-studio-link" href="/studio#/overview">Open Studio <span aria-hidden="true">↗</span></a></nav><button class="theme-toggle" type="button" aria-label="Switch between light and dark theme">${SUN_ICON}${MOON_ICON}</button></div></header>`;
}

/**
 * The spatial hero: a full-viewport canvas reconstruction with an SVG "survey" layer
 * behind it (atmosphere + architecture, both purely decorative/`aria-hidden`), a status
 * line, the live scene annotations, the (currently hidden, see marketing.css `.hero-detail`)
 * keyframe rail, the capture/align/refine stage panel, and the hero copy + CTA.
 */
function renderHero(): string {
  return `<section class="marketing-hero" aria-labelledby="hero-title">
      <div class="hero-atmosphere" aria-hidden="true"><i class="atmosphere-field"></i><i class="atmosphere-warmth"></i><i class="atmosphere-edge"></i></div>
      <div class="hero-architecture" aria-hidden="true"><svg class="architecture-geometry" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" focusable="false"><g class="architecture-frame"><path d="M 186 128 H 1254 V 292"></path><path d="M 1254 610 V 776 H 186 V 612"></path><path class="crosshair" d="M 720 96 V 148 M 694 122 H 746"></path><path class="crosshair" d="M 720 758 V 810 M 694 784 H 746"></path></g></svg></div>
      <div class="hero-topline"><span>SPATIAL CAPTURE / A LOCAL-FIRST WORKSPACE</span><span class="hero-online"><i></i> READY ON THIS DEVICE</span></div>
      <div class="hero-stage">
        <canvas class="spatial-canvas" aria-label="Interactive three dimensional room scan. Press and hold to grab the room, then drag to spin it a full 360 degrees or tilt it up and down. Release to let go, or use the arrow keys. Use the stage controls to explore capture, alignment, and refinement." role="img" tabindex="0"></canvas>${SCENE_ANNOTATIONS}
        <div class="scene-caption"><span class="caption-dot"></span><span data-scene-caption>${SCENE_CAPTIONS[0]}</span><span class="caption-divider">—</span><b>DRAG TO ORBIT</b></div>
      </div>
      <div class="hero-detail" aria-hidden="true"><span>KEYFRAME RAIL</span><ol class="frame-rail">${FRAME_RAIL}</ol><i class="detail-rule"></i><span>POSE GRAPH / 8 LINKS</span></div>
      <div class="hero-stage-panel"><div class="stage-description" aria-live="polite"><p data-step-label>${STEPS[0].label}</p><p class="stage-title" data-step-title>${STEPS[0].title}</p><span data-step-detail>${STEPS[0].detail}</span></div><div class="stage-controls" role="group" aria-label="Explore the reconstruction stages">${STEPS.map((step, index) => `<button type="button" data-scene-step="${index}" aria-pressed="${index === 0}"><span>0${index + 1}</span>${step.title.replace(" the scene", "").replace(" the views", "").replace(" the map", "")}</button>`).join("")}</div></div>
      <div class="hero-intro">${renderEyebrow("FROM MOVEMENT TO SPATIAL CLARITY", { withDot: true })}<h1 id="hero-title">See a space<br><em>take shape.</em></h1><p class="intro-lede">Move around a subject. Veylune aligns each view and refines a spatial map as you capture.</p>${renderCtaButton("/studio#/capture", "Explore Veylune Studio")}</div>
      <a class="scroll-cue" href="#product"><span>SCROLL TO EXPLORE</span><i></i></a>
    </section>`;
}

function renderPrincipleStrip(): string {
  return `<section class="principle-strip" aria-label="Veylune principles"><span>CAPTURE WITH INTENTION</span><i></i><span>REFINE AS YOU MOVE</span><i></i><span>KEEP YOUR WORK LOCAL</span></section>`;
}

function renderManifesto(): string {
  return `<section class="manifesto section-reveal" id="product"><div class="section-kicker"><span>THE VEYLUNE METHOD</span><span>01 — 03</span></div><div class="manifesto-grid"><h2>Spatial work<br>should feel <em>natural.</em></h2><div><p>A focused workspace for camera capture, map refinement, and source image organization. Follow the scan without losing sight of the subject.</p>${renderUnderlinedLink("/studio#/overview", "Step inside the studio")}</div></div><div class="feature-grid"><article class="feature-card feature-card-wide"><div class="feature-visual capture-visual"><div class="capture-ring"></div><div class="capture-subject"><span></span><span></span><span></span></div><div class="capture-reticle">＋</div><div class="feature-chip">LIVE CAPTURE <i></i></div></div><div class="feature-meta"><span>01 / CAPTURE</span><span>CAMERA GUIDANCE</span></div><h3>Move with intention.</h3><p>Keep the camera steady, cover the subject from useful angles, and watch map refinement progress while you work.</p></article><article class="feature-card"><div class="feature-visual import-visual"><div class="import-stack"><i></i><i></i><i></i><i></i><b>＋</b></div><div class="import-path">/ LOCAL / PROJECT</div></div><div class="feature-meta"><span>02 / ORGANIZE</span><span>IMAGE SETS</span></div><h3>Bring your own frames.</h3><p>Start a local project from individual images or a folder of source photos.</p></article><article class="feature-card"><div class="feature-visual refine-visual"><div class="refine-rings"><i></i><i></i><i></i><b></b></div><div class="refine-tag">MAP <strong>REFINING</strong></div></div><div class="feature-meta"><span>03 / REFINE</span><span>VISIBLE PROGRESS</span></div><h3>Know what’s happening.</h3><p>Follow iteration progress and cost signals, with clear recovery when refinement needs another pass.</p></article></div></section>`;
}

function renderWorkflow(): string {
  return `<section class="workflow-section section-reveal" id="workflow"><div class="workflow-heading"><div>${renderEyebrow("A CLEAR PATH THROUGH THE WORK")}<h2>From first frame<br>to <em>spatial context.</em></h2></div><p>Three deliberate steps. Your files and working map stay close at every stage.</p></div><div class="workflow-timeline"><article><span class="timeline-index">01</span><div class="timeline-icon">⌗</div><p>01 — GATHER</p><h3>Choose a starting point.</h3><span>Open a camera capture, or organize a photo set into a new local project.</span></article><article><span class="timeline-index">02</span><div class="timeline-icon">◉</div><p>02 — MOVE</p><h3>Cover the subject slowly.</h3><span>Use capture guidance to collect keyframes from distinct viewpoints.</span></article><article><span class="timeline-index">03</span><div class="timeline-icon">⌁</div><p>03 — REFINE</p><h3>Review the evolving map.</h3><span>See the optimization state and keep your project ready for the next session.</span></article></div></section>`;
}

/**
 * The pipeline the hero's canvas is only ever a picture of. Each stage names a real part
 * of `apps/web/src/capture/` and `apps/web/src/inference/` — feature tracking, bundle
 * adjustment, relocalization, on-device inference — in the terms someone evaluating the
 * product would look for, not the file names themselves. Nothing here is aspirational
 * copy: it is what the Studio actually runs, one level more technical than the workflow
 * section above it.
 */
function renderPipeline(): string {
  const stages = [
    { index: "01", icon: "⌁", title: "Track", body: "Features are matched frame to frame and filtered temporally, giving every keyframe a local pose estimate before it reaches the map.", tag: "FEATURES · LOCAL POSE" },
    { index: "02", icon: "∑", title: "Solve", body: "Bundle adjustment minimizes reprojection error across the whole map with a Schur-complement solve over the sparse normal equations.", tag: "BUNDLE ADJUSTMENT" },
    { index: "03", icon: "⟲", title: "Recover", body: "Lost tracking relocalizes against the existing map instead of restarting the scan, so a shaky pass doesn't cost you the session.", tag: "RELOCALIZATION" },
    { index: "04", icon: "▣", title: "Run", body: "Inference falls back across WebGPU and WASM automatically, so the same pipeline runs on whatever the device supports — no server round-trip.", tag: "ON-DEVICE INFERENCE" },
  ] as const;
  const rail = stages.map((stage) => `<article class="pipeline-stage"><span class="pipeline-index">${stage.index}</span><div class="pipeline-icon">${stage.icon}</div><h3>${stage.title}</h3><p>${stage.body}</p><span class="pipeline-tag">${stage.tag}</span></article>`).join("");
  return `<section class="pipeline-section section-reveal" id="pipeline"><div class="section-kicker"><span>INSIDE THE RECONSTRUCTION</span><span>04 STAGES</span></div><div class="pipeline-heading">${renderEyebrow("REAL GEOMETRY, SOLVED LOCALLY")}<h2>The same math a<br>reconstruction <em>runs on.</em></h2><p>Every frame you capture moves through one numerical pipeline — tracked, optimized, and recovered on this device, without a round trip to a server.</p></div><div class="pipeline-rail">${rail}</div></section>`;
}

function renderPrivacy(): string {
  return `<section class="privacy-section section-reveal" id="privacy"><div class="privacy-art"><div class="privacy-mark" data-identity>${voxelBloomSvg({ state: "bloom", ambient: true })}</div><div class="privacy-data data-a">LOCAL STORAGE <b>ACTIVE</b></div><div class="privacy-data data-b">SOURCE FILES <b>ON DEVICE</b></div></div><div class="privacy-copy">${renderEyebrow("PRIVATE BY DEFAULT")}<h2>Your source files<br>stay <em>with you.</em></h2><p>Images and project records are stored in this browser on your device. Veylune’s workspace is designed around local access and visible control.</p>${renderUnderlinedLink("/studio#/import", "Create a private project")}</div></section>`;
}

function renderClosing(): string {
  return `<section class="closing-section section-reveal"><div class="closing-object" data-voxel-object></div>${renderEyebrow("A MORE CONSIDERED WAY TO CAPTURE")}<h2>Look closer.<br><em>Keep more.</em></h2>${renderCtaButton("/studio#/capture", "Open Veylune Studio")}<div class="closing-coordinate">VEYLUNE SPATIAL ENGINE &nbsp;·&nbsp; LOCAL BY DESIGN</div></section>`;
}

// ---------------------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------------------

export function mountMarketingPage(root: HTMLElement): { dispose(): void } {
  // Applied before the first paint of this mount: a stored choice persists across visits,
  // otherwise the page opens on whatever the OS/browser already prefers.
  applyTheme(readStoredTheme() ?? systemTheme());

  root.innerHTML = `<div class="marketing-shell">
    ${renderHeader()}
    <main id="top">
      ${renderHero()}
      ${renderPrincipleStrip()}
      ${renderManifesto()}
      ${renderWorkflow()}
      ${renderPipeline()}
      ${renderPrivacy()}
      ${renderClosing()}
    </main>
  </div>`;

  // --- Theme toggle ----------------------------------------------------------------
  const themeToggle = root.querySelector<HTMLButtonElement>(".theme-toggle")!;
  const onThemeToggleClick = (): void => {
    const next: Theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { window.localStorage?.setItem(THEME_STORAGE_KEY, next); } catch { /* private browsing: the choice just won't outlive this tab */ }
  };
  themeToggle.addEventListener("click", onThemeToggleClick);

  // --- Mobile nav --------------------------------------------------------------------
  const menu = root.querySelector<HTMLButtonElement>(".marketing-menu-toggle")!;
  const nav = root.querySelector<HTMLElement>(".marketing-nav")!;
  const onMenuClick = (): void => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  };
  menu.addEventListener("click", onMenuClick);
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    menu.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
  }));

  // --- Spatial scene + stage controls -------------------------------------------------
  const canvas = root.querySelector<HTMLCanvasElement>(".spatial-canvas")!;
  const title = root.querySelector<HTMLElement>("[data-step-title]")!;
  const detail = root.querySelector<HTMLElement>("[data-step-detail]")!;
  const label = root.querySelector<HTMLElement>("[data-step-label]")!;
  const sceneCaption = root.querySelector<HTMLElement>("[data-scene-caption]")!;
  const poseReadout = root.querySelector<HTMLElement>("[data-scene-pose]")!;
  const stageButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-scene-step]")];
  // The readout is seeded by the template with the pose the scene opens on and after
  // that reports whatever the scene reports. It is never given a value of its own.
  const scene = mountSpatialScene(canvas, {
    onPose: (yaw, pitch) => {
      const pose = formatPoseReadout(yaw, pitch);
      if (poseReadout.textContent !== pose) poseReadout.textContent = pose;
    },
  });
  stageButtons.forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.sceneStep);
    const step = STEPS[index];
    if (!step) return;
    stageButtons.forEach((item, itemIndex) => item.setAttribute("aria-pressed", String(itemIndex === index)));
    title.textContent = step.title;
    detail.textContent = step.detail;
    label.textContent = step.label;
    sceneCaption.textContent = SCENE_CAPTIONS[index]!;
    scene.setStage(index);
  }));

  // --- Identity mark (closing section) ------------------------------------------------
  const identitySlot = root.querySelector<HTMLElement>("[data-voxel-object]")!;
  const identity = mountVoxelObject(identitySlot);

  // --- Scroll-triggered reveals --------------------------------------------------------
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const revealElements = root.querySelectorAll<HTMLElement>(".section-reveal");
  let observer: IntersectionObserver | undefined;
  if (!reduceMotion && "IntersectionObserver" in window) {
    observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer?.unobserve(entry.target); }
    }), { threshold: 0.14 });
    revealElements.forEach((element) => observer?.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add("is-visible"));
  }

  const identities = [...root.querySelectorAll<HTMLElement>("[data-identity]")]
    .flatMap((host) => [...host.querySelectorAll<SVGSVGElement>(".veylune-mark")]);
  const assemble = (mark: SVGSVGElement): void => { mark.setAttribute("data-state", "stable"); };
  let identityObserver: IntersectionObserver | undefined;
  if (!reduceMotion && "IntersectionObserver" in window) {
    identityObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      assemble(entry.target as SVGSVGElement);
      identityObserver?.unobserve(entry.target);
    }), { threshold: 0.3 });
    identities.forEach((mark) => identityObserver?.observe(mark));
  } else {
    identities.forEach(assemble);
  }

  // --- Interactive feature-card tilt ---------------------------------------------------
  // Perspective rotation toward wherever the pointer actually is over the card, not a
  // fixed "hover pose" — the card leans into the cursor rather than just lifting. Bound to
  // a small angle (±7deg) and eased back to flat on leave via the CSS transition already on
  // `.feature-card`, so this only ever writes two custom properties, never touches `transform`
  // directly. Same fine-pointer/reduced-motion gates as the hero drift, for the same reason:
  // nothing here should run on a touch device that has no hover to report in the first place.
  const tiltCards = [...root.querySelectorAll<HTMLElement>(".feature-card")];
  const cardFinePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;
  const onCardPointerMove = (event: PointerEvent): void => {
    const card = event.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty("--tilt-x", `${(-y * 7).toFixed(2)}deg`);
    card.style.setProperty("--tilt-y", `${(x * 7).toFixed(2)}deg`);
  };
  const onCardPointerLeave = (event: PointerEvent): void => {
    const card = event.currentTarget as HTMLElement;
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
  };
  if (!reduceMotion && cardFinePointer) {
    tiltCards.forEach((card) => {
      card.addEventListener("pointermove", onCardPointerMove);
      card.addEventListener("pointerleave", onCardPointerLeave);
    });
  }

  // --- Hero pointer-drift atmosphere ---------------------------------------------------
  // The atmosphere sits a few pixels from where it was laid down, always against the
  // pointer, so the air reads as something the eye moves through rather than a wall
  // colour behind it. Nothing else follows the cursor: the reconstruction is orbiting
  // already, and a subject that also swivelled under the mouse would fight its own rig.
  // Two custom properties, written at most once per frame, are the whole cost.
  const hero = root.querySelector<HTMLElement>(".marketing-hero")!;
  const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;
  let driftFrame = 0;
  let pointerX = 0;
  let pointerY = 0;
  const applyDrift = (): void => {
    driftFrame = 0;
    hero.style.setProperty("--drift-x", `${(-pointerX * 12).toFixed(2)}px`);
    hero.style.setProperty("--drift-y", `${(-pointerY * 8).toFixed(2)}px`);
  };
  const onHeroPointerMove = (event: PointerEvent): void => {
    pointerX = event.clientX / Math.max(1, window.innerWidth) - 0.5;
    pointerY = event.clientY / Math.max(1, window.innerHeight) - 0.5;
    if (!driftFrame) driftFrame = requestAnimationFrame(applyDrift);
  };
  const onHeroPointerLeave = (): void => {
    pointerX = 0;
    pointerY = 0;
    if (!driftFrame) driftFrame = requestAnimationFrame(applyDrift);
  };
  if (!reduceMotion && finePointer) {
    hero.addEventListener("pointermove", onHeroPointerMove);
    hero.addEventListener("pointerleave", onHeroPointerLeave);
  }

  return { dispose: () => {
    tiltCards.forEach((card) => {
      card.removeEventListener("pointermove", onCardPointerMove);
      card.removeEventListener("pointerleave", onCardPointerLeave);
    });
    themeToggle.removeEventListener("click", onThemeToggleClick);
    menu.removeEventListener("click", onMenuClick);
    hero.removeEventListener("pointermove", onHeroPointerMove);
    hero.removeEventListener("pointerleave", onHeroPointerLeave);
    if (driftFrame) cancelAnimationFrame(driftFrame);
    scene.dispose();
    identity.dispose();
    observer?.disconnect();
    identityObserver?.disconnect();
  } };
}
