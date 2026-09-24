import { afterEach, describe, expect, it } from "vitest";
import { mountMarketingPage } from "./marketing-page";

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

describe("Veylune marketing page", () => {
  it("introduces the spatial workflow and links into the Studio", () => {
    const root = document.createElement("div");
    document.body.append(root);
    dispose = mountMarketingPage(root).dispose;

    expect(root.querySelector("main h1")?.textContent).toContain("Capture a place.");
    expect(root.querySelectorAll(".feature-card")).toHaveLength(3);
    expect(root.querySelectorAll('a[href^="/studio#/"]').length).toBeGreaterThanOrEqual(4);
    expect(root.querySelector("#privacy")?.textContent).toContain("stay with you");
  });

  it("keeps the compact navigation keyboard accessible", () => {
    const root = document.createElement("div");
    document.body.append(root);
    dispose = mountMarketingPage(root).dispose;
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
});
