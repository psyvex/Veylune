/**
 * The single light/dark preference shared by every surface (marketing page,
 * Studio, capture HUD) — one glass theme, not a per-surface choice. Reading
 * and writing goes through this module everywhere so there is exactly one
 * storage key and one meaning for it; Studio previously wrote its own
 * three-accent choice ("obsidian"/"glacier"/"moss") to this same key name,
 * which silently collided with the marketing page's light/dark toggle
 * writing "light"/"dark" to it. See docs/75-production-task-pipeline.md.
 */

const THEME_STORAGE_KEY = "veylune-theme";
export type ThemePreference = "light" | "dark";

/** The system preference, consulted only when the reader has never chosen. */
export function systemTheme(): ThemePreference {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readStoredTheme(): ThemePreference | undefined {
  try {
    const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : undefined;
  } catch {
    // Private browsing / storage disabled: fall through to the system preference, silently.
    return undefined;
  }
}

export function storeTheme(theme: ThemePreference): void {
  try {
    window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing: the choice just won't outlive this tab.
  }
}

/** `data-theme` lives on <html>, not any one mounted root, so it survives a remount
 * and is shared the instant either surface changes it. */
export function applyTheme(theme: ThemePreference): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function currentTheme(): ThemePreference {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export const SUN_ICON = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9"></path></svg>`;
export const MOON_ICON = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.2A8.4 8.4 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2Z"></path></svg>`;

/** Toggles and persists in one call; every theme-toggle button on any surface
 * should be wired to this rather than reimplementing the flip. */
export function toggleTheme(): ThemePreference {
  const next: ThemePreference = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  storeTheme(next);
  return next;
}

/** Call once at each surface's mount, before first paint. */
export function initTheme(): void {
  applyTheme(readStoredTheme() ?? systemTheme());
}
