import { afterEach, describe, expect, it, vi } from "vitest";
import { mountMarketingPage } from "./marketing-page";

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function mountPage(): HTMLElement {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
  const root = document.createElement("div");
  document.body.append(root);
  dispose = mountMarketingPage(root).dispose;
  return root;
}

describe("Veylune marketing page", () => {
  it("introduces the spatial workflow through a full-width interactive scene", () => {
    const root = mountPage();

    expect(root.querySelector("main h1")?.textContent).toContain("See a space");
    expect(root.querySelector(".spatial-canvas")?.getAttribute("aria-label")).toContain("Move the cursor to orbit through 360 degrees");
    expect(root.querySelector(".scene-caption")?.textContent).toContain("MOVE CURSOR TO ORBIT");
    expect(root.querySelector(".marketing-hero")?.querySelector(".hero-intro")).toBeTruthy();
    expect(root.querySelectorAll(".feature-card")).toHaveLength(3);
    expect(root.querySelectorAll('a[href^="/studio#/"]').length).toBeGreaterThanOrEqual(4);
    expect(root.querySelector("#privacy")?.textContent).toContain("stay with you");
  });

  it("keeps the compact navigation keyboard accessible", () => {
    const root = mountPage();
    const button = root.querySelector<HTMLButtonElement>(".marketing-menu-toggle")!;
    const nav = root.querySelector<HTMLElement>(".marketing-nav")!;

    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(nav.classList.contains("is-open")).toBe(true);
    nav.querySelector<HTMLAnchorElement>('a[href="#product"]')!.click();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(nav.classList.contains("is-open")).toBe(false);
  });

  it("switches the scene explanation and selected reconstruction stage", () => {
    const root = mountPage();
    const align = root.querySelector<HTMLButtonElement>('[data-scene-step="1"]')!;
    align.click();

    expect(root.querySelector("[data-step-title]")?.textContent).toBe("Align the views");
    expect(root.querySelector("[data-scene-caption]")?.textContent).toBe("POSE GRAPH / ALIGNED VIEWS");
    expect(align.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector('[data-scene-step="0"]')?.getAttribute("aria-pressed")).toBe("false");
  });
});
