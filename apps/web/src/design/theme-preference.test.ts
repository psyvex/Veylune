import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, currentTheme, initTheme, readStoredTheme, storeTheme, toggleTheme } from "./theme-preference";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("theme-preference", () => {
  it("round-trips a stored choice", () => {
    expect(readStoredTheme()).toBeUndefined();
    storeTheme("dark");
    expect(readStoredTheme()).toBe("dark");
    storeTheme("light");
    expect(readStoredTheme()).toBe("light");
  });

  it("ignores a garbage value left in storage by something else", () => {
    localStorage.setItem("veylune-theme", "obsidian");
    expect(readStoredTheme()).toBeUndefined();
  });

  it("applies to <html>, which currentTheme reads back", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(currentTheme()).toBe("dark");
    applyTheme("light");
    expect(currentTheme()).toBe("light");
  });

  it("toggleTheme flips and persists", () => {
    applyTheme("light");
    expect(toggleTheme()).toBe("dark");
    expect(currentTheme()).toBe("dark");
    expect(readStoredTheme()).toBe("dark");
    expect(toggleTheme()).toBe("light");
    expect(readStoredTheme()).toBe("light");
  });

  it("initTheme uses the stored choice over the system preference when both exist", () => {
    storeTheme("dark");
    initTheme();
    expect(currentTheme()).toBe("dark");
  });
});
