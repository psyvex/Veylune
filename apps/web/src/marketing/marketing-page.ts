import { mountVoxelObject } from "../branding/voxel-object";
import { voxelBloomSvg } from "../branding/voxel-bloom";
import { mountSpatialScene } from "./spatial-scene";

const STEPS = [
  { title: "Capture the scene", detail: "Move around your subject. Each viewpoint adds another set of visual clues.", label: "01 / CAPTURE" },
  { title: "Align the views", detail: "Keyframes connect into a shared pose graph, giving the map its spatial context.", label: "02 / ALIGN" },
  { title: "Refine the map", detail: "Local optimization revisits the geometry as new frames become available.", label: "03 / REFINE" },
] as const;

const HERO_ENHANCEMENT_STYLES = `
  .marketing-shell .hero-copy-below { top: auto; bottom: 178px; width: min(760px, calc(100% - 40px)); }
  .marketing-shell .hero-copy-below::before { inset: -22px -150px -42px; background: linear-gradient(180deg, #f5f4efd0, #f5f4efeb 64%, #f5f4ef00); }
  .marketing-shell .hero-copy-below h1 { margin-top: 10px; font-size: clamp(42px, 4.7vw, 64px); }
  .marketing-shell .hero-copy-below .marketing-eyebrow { font-size: 8px; }
  .marketing-shell .hero-copy-below > p:not(.marketing-eyebrow) { max-width: 560px; font-size: 11px; }
  .marketing-shell .hero-copy-below .marketing-button { margin-top: 13px; }
  .marketing-shell .hero-enhancement { position: absolute; z-index: 2; inset: 0; pointer-events: none; overflow: hidden; }
  .marketing-shell .hero-orbit { position: absolute; left: 50%; top: 42%; width: min(62vw, 720px); aspect-ratio: 1.72; border: 1px solid #64857835; border-radius: 50%; transform: translate(-50%, -50%) rotate(-7deg); animation: hero-orbit-a 22s linear infinite; }
  .marketing-shell .hero-orbit::before, .marketing-shell .hero-orbit::after { content: ""; position: absolute; inset: 10% 5%; border: 1px solid #b47a5624; border-radius: 50%; transform: rotate(58deg); }
  .marketing-shell .hero-orbit::after { inset: 19% -4%; border-color: #426d5e25; transform: rotate(-36deg); }
  .marketing-shell .hero-orbit-dot { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: var(--clay); box-shadow: 0 0 0 5px #b47a5620, 0 0 24px #b47a5645; animation: orbit-pulse 2.6s ease-in-out infinite; }
  .marketing-shell .hero-orbit-dot.one { left: 15%; top: 20%; }
  .marketing-shell .hero-orbit-dot.two { right: 11%; top: 61%; width: 5px; height: 5px; animation-delay: -.8s; background: var(--green); }
  .marketing-shell .hero-orbit-dot.three { left: 49%; bottom: 7%; width: 4px; height: 4px; animation-delay: -1.4s; background: #839e90; }
  .marketing-shell .hero-scan-line { position: absolute; left: 12%; right: 12%; top: 25%; height: 1px; background: linear-gradient(90deg, transparent, #7b9c8b45 18%, #b47a5660 50%, #7b9c8b45 82%, transparent); opacity: .7; animation: hero-scan 5.5s ease-in-out infinite; }
  .marketing-shell .hero-scan-line::before { content: ""; position: absolute; left: 50%; top: -3px; width: 7px; height: 7px; border-radius: 50%; background: #b47a56; box-shadow: 0 0 0 6px #b47a5619; }
  .marketing-shell .hero-coordinate { position: absolute; color: #71857a; font: 7px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; opacity: .8; }
  .marketing-shell .hero-coordinate b { color: #4f695d; font-weight: 500; }
  .marketing-shell .hero-coordinate.a { left: 8%; top: 38%; }
  .marketing-shell .hero-coordinate.b { right: 8%; top: 44%; text-align: right; }
  .marketing-shell .hero-coordinate.c { left: 12%; top: 60%; }
  .marketing-shell .hero-coordinate.d { right: 12%; top: 59%; text-align: right; }
  .marketing-shell .hero-data-card { position: absolute; width: 138px; padding: 10px 11px; border: 1px solid #66857632; border-radius: 4px; background: #fafaf5bf; box-shadow: 0 10px 30px #40594c0d; backdrop-filter: blur(10px); color: #64766d; font: 7px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
  .marketing-shell .hero-data-card strong { display: block; margin-top: 6px; color: #345448; font: 600 10px Inter, ui-sans-serif, sans-serif; letter-spacing: -.01em; }
  .marketing-shell .hero-data-card span { display: block; margin-top: 4px; color: #89988f; }
  .marketing-shell .hero-data-card.a { left: 8%; top: 50%; animation: card-float-a 6s ease-in-out infinite; }
  .marketing-shell .hero-data-card.b { right: 8%; top: 32%; animation: card-float-b 7s ease-in-out infinite; }
  .marketing-shell .hero-data-meter { height: 2px; margin-top: 9px; overflow: hidden; border-radius: 2px; background: #dbe3db; }
  .marketing-shell .hero-data-meter i { display: block; width: 68%; height: 100%; border-radius: inherit; background: var(--green); animation: meter-breathe 3s ease-in-out infinite; }
  .marketing-shell .hero-frame { position: absolute; left: 50%; top: 41%; width: min(44vw, 540px); height: min(27vw, 300px); border: 1px solid #55786a25; transform: translate(-50%, -50%); }
  .marketing-shell .hero-frame::before, .marketing-shell .hero-frame::after { content: ""; position: absolute; width: 13px; height: 13px; border-color: #56796b70; }
  .marketing-shell .hero-frame::before { left: -1px; top: -1px; border-top: 1px solid; border-left: 1px solid; }
  .marketing-shell .hero-frame::after { right: -1px; bottom: -1px; border-right: 1px solid; border-bottom: 1px solid; }
  .marketing-shell .hero-node { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #5f8877; box-shadow: 0 0 0 4px #5f887718; animation: node-breathe 2.8s ease-in-out infinite; }
  .marketing-shell .hero-node.n1 { left: 33%; top: 36%; }
  .marketing-shell .hero-node.n2 { left: 63%; top: 47%; animation-delay: -.6s; }
  .marketing-shell .hero-node.n3 { left: 43%; top: 53%; animation-delay: -1.1s; }
  .marketing-shell .hero-node.n4 { left: 70%; top: 38%; animation-delay: -1.7s; }
  .marketing-shell .hero-link { position: absolute; height: 1px; transform-origin: left center; background: linear-gradient(90deg, #5f887744, transparent); opacity: .7; }
  .marketing-shell .hero-link.l1 { left: 33%; top: 36%; width: 19%; transform: rotate(17deg); }
  .marketing-shell .hero-link.l2 { left: 43%; top: 53%; width: 24%; transform: rotate(-16deg); }
  .marketing-shell .hero-link.l3 { left: 63%; top: 47%; width: 11%; transform: rotate(-31deg); }
  @keyframes hero-orbit-a { from { transform: translate(-50%, -50%) rotate(-7deg); } to { transform: translate(-50%, -50%) rotate(353deg); } }
  @keyframes orbit-pulse { 0%,100% { transform: scale(.8); opacity: .55; } 50% { transform: scale(1.25); opacity: 1; } }
  @keyframes hero-scan { 0%,100% { transform: translateY(-18px); opacity: .15; } 50% { transform: translateY(170px); opacity: .8; } }
  @keyframes card-float-a { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-8px,0); } }
  @keyframes card-float-b { 0%,100% { transform: translate3d(0,0,0) rotate(.5deg); } 50% { transform: translate3d(0,7px,0) rotate(-.5deg); } }
  @keyframes meter-breathe { 0%,100% { width: 58%; } 50% { width: 82%; } }
  @keyframes node-breathe { 0%,100% { opacity: .4; box-shadow: 0 0 0 3px #5f887712; } 50% { opacity: 1; box-shadow: 0 0 0 6px #5f88771d; } }
  @media (max-width: 800px) {
    .marketing-shell .hero-data-card { display: none; }
    .marketing-shell .hero-coordinate { opacity: .55; }
    .marketing-shell .hero-frame { width: 74vw; height: 33vw; top: 39%; }
    .marketing-shell .hero-orbit { width: 88vw; top: 39%; }
    .marketing-shell .hero-copy-below { bottom: 165px; }
    .marketing-shell .hero-copy-below h1 { font-size: clamp(38px, 10vw, 52px); }
    .marketing-shell .hero-copy-below > p:not(.marketing-eyebrow) { max-width: 430px; }
  }
  @media (max-width: 560px) {
    .marketing-shell .hero-coordinate { display: none; }
    .marketing-shell .hero-frame { top: 36%; width: 82vw; height: 38vw; }
    .marketing-shell .hero-orbit { top: 36%; }
    .marketing-shell .hero-copy-below { bottom: 156px; }
    .marketing-shell .hero-copy-below .marketing-button { margin-top: 10px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .marketing-shell .hero-orbit, .marketing-shell .hero-orbit-dot, .marketing-shell .hero-scan-line, .marketing-shell .hero-data-card, .marketing-shell .hero-data-meter i, .marketing-shell .hero-node, .marketing-shell .scroll-cue i { animation: none !important; }
  }
`;

export function mountMarketingPage(root: HTMLElement): { dispose(): void } {
  root.innerHTML = `<div class="marketing-shell">
    <style>${HERO_ENHANCEMENT_STYLES}</style>
    <header class="marketing-header"><a class="marketing-brand" href="#top" aria-label="Veylune home"><span class="marketing-mark">${voxelBloomSvg({ variant: "compact" })}</span><span>veylune</span></a><button class="marketing-menu-toggle" type="button" aria-expanded="false" aria-controls="marketing-nav">Menu <span aria-hidden="true">＋</span></button><nav class="marketing-nav" id="marketing-nav" aria-label="Main navigation"><a href="#product">Product</a><a href="#workflow">How it works</a><a href="#privacy">Privacy</a><a class="nav-studio-link" href="/studio#/overview">Open Studio <span aria-hidden="true">↗</span></a></nav></header>
    <main id="top"><section class="marketing-hero" aria-labelledby="hero-title">
      <div class="hero-topline"><span>SPATIAL CAPTURE / A LOCAL-FIRST WORKSPACE</span><span class="hero-online"><i></i> READY ON THIS DEVICE</span></div>
      <canvas class="spatial-canvas" aria-label="Interactive three dimensional room scan. Press and hold to grab the room, then drag to spin it a full 360 degrees or tilt it up and down. Release to let go, or use the arrow keys. Use the stage controls to explore capture, alignment, and refinement." role="img" tabindex="0"></canvas>
      <div class="hero-enhancement" aria-hidden="true">
        <div class="hero-frame"></div>
        <div class="hero-orbit"><i class="hero-orbit-dot one"></i><i class="hero-orbit-dot two"></i><i class="hero-orbit-dot three"></i></div>
        <div class="hero-scan-line"></div>
        <span class="hero-node n1"></span><span class="hero-node n2"></span><span class="hero-node n3"></span><span class="hero-node n4"></span>
        <i class="hero-link l1"></i><i class="hero-link l2"></i><i class="hero-link l3"></i>
        <span class="hero-coordinate a">X <b>0.42</b> / Y <b>1.18</b></span>
        <span class="hero-coordinate b">POSE <b>03</b> / VIEW <b>018</b></span>
        <span class="hero-coordinate c">MAP COVERAGE <b>68%</b></span>
        <span class="hero-coordinate d">LOCAL PASS <b>04</b> / ACTIVE</span>
        <div class="hero-data-card a"><span>LIVE INPUT</span><strong>18 keyframes linked</strong><span>coverage improving</span><div class="hero-data-meter"><i></i></div></div>
        <div class="hero-data-card b"><span>LOCAL PROCESSING</span><strong>Map refinement</strong><span>no upload required</span><div class="hero-data-meter"><i></i></div></div>
      </div>
      <div class="scene-vignette" aria-hidden="true"></div>
      <div class="hero-intro hero-copy-below"><p class="marketing-eyebrow"><span></span> FROM MOVEMENT TO SPATIAL CLARITY</p><h1 id="hero-title">See a space<br><em>take shape.</em></h1><p>Move around a subject. Veylune aligns each view and refines a spatial map as you capture.</p><a class="marketing-button" href="/studio#/capture">Explore Veylune Studio <span>↗</span></a></div>
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
