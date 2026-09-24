import { mountVoxelObject } from "../branding/voxel-object";
import { voxelBloomSvg } from "../branding/voxel-bloom";
import { mountSpatialScene } from "./spatial-scene";

const STEPS = [
  { title: "Capture the scene", detail: "Move around your subject. Each viewpoint adds another set of visual clues.", label: "01 / CAPTURE" },
  { title: "Align the views", detail: "Keyframes connect into a shared pose graph, giving the map its spatial context.", label: "02 / ALIGN" },
  { title: "Refine the map", detail: "Local optimization revisits the geometry as new frames become available.", label: "03 / REFINE" },
] as const;

export function mountMarketingPage(root: HTMLElement): { dispose(): void } {
  root.innerHTML = `<div class="marketing-shell">
    <header class="marketing-header"><a class="marketing-brand" href="#top" aria-label="Veylune home"><span class="marketing-mark">${voxelBloomSvg({ variant: "compact" })}</span><span>veylune</span></a><button class="marketing-menu-toggle" type="button" aria-expanded="false" aria-controls="marketing-nav">Menu <span aria-hidden="true">＋</span></button><nav class="marketing-nav" id="marketing-nav" aria-label="Main navigation"><a href="#product">Product</a><a href="#workflow">How it works</a><a href="#privacy">Privacy</a><a class="nav-studio-link" href="/studio#/overview">Open Studio <span aria-hidden="true">↗</span></a></nav></header>
    <main id="top"><section class="marketing-hero" aria-labelledby="hero-title">
      <div class="hero-topline"><span>SPATIAL CAPTURE / A LOCAL-FIRST WORKSPACE</span><span class="hero-online"><i></i> READY ON THIS DEVICE</span></div>
      <canvas class="spatial-canvas" aria-label="Interactive three dimensional room scan. Press and hold to grab the room, then drag to spin it a full 360 degrees or tilt it up and down. Release to let go, or use the arrow keys. Use the stage controls to explore capture, alignment, and refinement." role="img" tabindex="0"></canvas>
      <div class="scene-vignette" aria-hidden="true"></div>
      <div class="hero-intro"><p class="marketing-eyebrow"><span></span> FROM MOVEMENT TO SPATIAL CLARITY</p><h1 id="hero-title">See a space<br><em>take shape.</em></h1><p>Move around a subject. Veylune aligns each view and refines a spatial map as you capture.</p><a class="marketing-button" href="/studio#/capture">Explore Veylune Studio <span>↗</span></a></div>
      <div class="scene-callout callout-left"><span>LIVE INPUT</span><b>Camera keyframes</b><i class="callout-rule"></i></div>
      <div class="scene-callout callout-right"><span>LOCAL PROCESSING</span><b>Map refinement</b><i class="callout-rule"></i></div>
      <div class="scene-caption"><span class="caption-dot"></span><span data-scene-caption>ROOM / KEYFRAME MAP</span><span class="caption-divider">—</span><b>DRAG TO ORBIT</b></div>
      <div class="hero-stage-panel"><div class="stage-description" aria-live="polite"><p data-step-label>01 / CAPTURE</p><h2 data-step-title>Capture the scene</h2><span data-step-detail>Move around your subject. Each viewpoint adds another set of visual clues.</span></div><div class="stage-controls" role="group" aria-label="Explore the reconstruction stages">${STEPS.map((step, index) => `<button type="button" data-scene-step="${index}" aria-pressed="${index === 0}"><span>0${index + 1}</span>${step.title.replace(" the scene", "").replace(" the views", "").replace(" the map", "")}</button>`).join("")}</div></div>
      <a class="scroll-cue" href="#product"><span>SCROLL TO EXPLORE</span><i></i></a>
    </section>
    <section class="principle-strip" aria-label="Veylune principles"><span>CAPTURE WITH INTENTION</span><i></i><span>REFINE AS YOU MOVE</span><i></i><span>KEEP YOUR WORK LOCAL</span></section>
    <section class="manifesto section-reveal" id="product"><div class="section-kicker"><span>THE VEYLUNE METHOD</span><span>01 — 03</span></div><div class="manifesto-grid"><h2>Spatial work<br>should feel <em>natural.</em></h2><div><p>A focused workspace for camera capture, map refinement, and source image organization. Follow the scan without losing sight of the subject.</p><a class="underlined-link" href="/studio#/overview">Step inside the studio <span>↗</span></a></div></div><div class="feature-grid"><article class="feature-card feature-card-wide"><div class="feature-visual capture-visual"><div class="capture-ring"></div><div class="capture-subject"><span></span><span></span><span></span></div><div class="capture-reticle">＋</div><div class="feature-chip">LIVE CAPTURE <i></i></div></div><div class="feature-meta"><span>01 / CAPTURE</span><span>CAMERA GUIDANCE</span></div><h3>Move with intention.</h3><p>Keep the camera steady, cover the subject from useful angles, and watch map refinement progress while you work.</p></article><article class="feature-card"><div class="feature-visual import-visual"><div class="import-stack"><i></i><i></i><i></i><i></i><b>＋</b></div><div class="import-path">/ LOCAL / PROJECT</div></div><div class="feature-meta"><span>02 / ORGANIZE</span><span>IMAGE SETS</span></div><h3>Bring your own frames.</h3><p>Start a local project from individual images or a folder of source photos.</p></article><article class="feature-card"><div class="feature-visual refine-visual"><div class="refine-rings"><i></i><i></i><i></i><b></b></div><div class="refine-tag">MAP <strong>REFINING</strong></div></div><div class="feature-meta"><span>03 / REFINE</span><span>VISIBLE PROGRESS</span></div><h3>Know what’s happening.</h3><p>Follow iteration progress and cost signals, with clear recovery when refinement needs another pass.</p></article></div></section>
    <section class="workflow-section section-reveal" id="workflow"><div class="workflow-heading"><div><p class="marketing-eyebrow">A CLEAR PATH THROUGH THE WORK</p><h2>From first frame<br>to <em>spatial context.</em></h2></div><p>Three deliberate steps. Your files and working map stay close at every stage.</p></div><div class="workflow-timeline"><article><span class="timeline-index">01</span><div class="timeline-icon">⌗</div><p>01 — GATHER</p><h3>Choose a starting point.</h3><span>Open a camera capture, or organize a photo set into a new local project.</span></article><article><span class="timeline-index">02</span><div class="timeline-icon">◉</div><p>02 — MOVE</p><h3>Cover the subject slowly.</h3><span>Use capture guidance to collect keyframes from distinct viewpoints.</span></article><article><span class="timeline-index">03</span><div class="timeline-icon">⌁</div><p>03 — REFINE</p><h3>Review the evolving map.</h3><span>See the optimization state and keep your project ready for the next session.</span></article></div></section>
    <section class="privacy-section section-reveal" id="privacy"><div class="privacy-art"><div class="privacy-mark" data-identity>${voxelBloomSvg({ state: "bloom", ambient: true })}</div><div class="privacy-lock">⌑</div><div class="privacy-data data-a">LOCAL STORAGE <b>ACTIVE</b></div><div class="privacy-data data-b">SOURCE FILES <b>ON DEVICE</b></div></div><div class="privacy-copy"><p class="marketing-eyebrow">PRIVATE BY DEFAULT</p><h2>Your source files<br>stay <em>with you.</em></h2><p>Images and project records are stored in this browser on your device. Veylune’s workspace is designed around local access and visible control.</p><a class="underlined-link" href="/studio#/import">Create a private project <span>↗</span></a></div></section>
    <section class="closing-section section-reveal"><div class="closing-object" data-voxel-object></div><p class="marketing-eyebrow">A MORE CONSIDERED WAY TO CAPTURE</p><h2>Look closer.<br><em>Keep more.</em></h2><a class="marketing-button" href="/studio#/capture">Open Veylune Studio <span>↗</span></a><div class="closing-coordinate">VEYLUNE SPATIAL ENGINE &nbsp;·&nbsp; LOCAL BY DESIGN</div></section></main>
    <footer class="marketing-footer"><a class="marketing-brand" href="#top"><span class="marketing-mark">${voxelBloomSvg({ variant: "compact" })}</span><span>veylune</span></a><span>Spatial capture, made tangible.</span><a href="/studio#/overview">Go to Studio <span>↗</span></a><small>© 2026 VEYLUNE</small></footer></div>`;

  const menu = root.querySelector<HTMLButtonElement>(".marketing-menu-toggle")!;
  const nav = root.querySelector<HTMLElement>(".marketing-nav")!;
  const canvas = root.querySelector<HTMLCanvasElement>(".spatial-canvas")!;
  const title = root.querySelector<HTMLElement>("[data-step-title]")!;
  const detail = root.querySelector<HTMLElement>("[data-step-detail]")!;
  const label = root.querySelector<HTMLElement>("[data-step-label]")!;
  const sceneCaption = root.querySelector<HTMLElement>("[data-scene-caption]")!;
  const stageButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-scene-step]")];
  const scene = mountSpatialScene(canvas);
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
  stageButtons.forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.sceneStep);
    const step = STEPS[index];
    if (!step) return;
    stageButtons.forEach((item, itemIndex) => item.setAttribute("aria-pressed", String(itemIndex === index)));
    title.textContent = step.title;
    detail.textContent = step.detail;
    label.textContent = step.label;
    sceneCaption.textContent = ["ROOM / KEYFRAME MAP", "POSE GRAPH / ALIGNED VIEWS", "SPATIAL MAP / REFINED"][index]!;
    scene.setStage(index);
  }));

  // The identity shown as something you can hold. Same drag convention as the
  // hero scene (both come from spatial/drag-orbit), and the same rule: moving the
  // cursor over it does nothing until the pointer is held down.
  const identitySlot = root.querySelector<HTMLElement>("[data-voxel-object]")!;
  const identity = mountVoxelObject(identitySlot);

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
  // Identity marks are mounted scattered and assemble once their section is
  // reached: the formation state played one time, not a loop. Where the observer
  // cannot run, they are shown finished instead of never assembling.
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

  return { dispose: () => { menu.removeEventListener("click", onMenuClick); scene.dispose(); identity.dispose(); observer?.disconnect(); identityObserver?.disconnect(); } };
}
