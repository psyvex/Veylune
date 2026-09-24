import { describe, expect, it } from "vitest";
import {
  cellTone,
  layoutVoxelCells,
  MARK_VIEWBOX,
  voxelBloomIconSvg,
  voxelBloomSvg,
  voxelCells,
  type VoxelVariant,
} from "./voxel-bloom";

const VARIANTS: readonly VoxelVariant[] = ["micro", "compact", "full"];

/** Cells that make up the volume, as opposed to the one arriving at it. */
function slab(variant: VoxelVariant) {
  return layoutVoxelCells(variant).filter((cell) => cell.tier === "primary");
}

describe("Voxel Bloom geometry", () => {
  it("keeps the primary lattice inside the brief of 5 to 12 cells", () => {
    for (const variant of VARIANTS) {
      expect(slab(variant).length).toBeGreaterThanOrEqual(5);
      expect(slab(variant).length).toBeLessThanOrEqual(12);
    }
  });

  it("drops the arriving cell at favicon sizes and keeps it everywhere else", () => {
    // Not a crop or a smaller drawing: the micro variant is the same lattice with
    // the sub-pixel detail removed, so the 16px tile stays a solid read.
    expect(voxelCells("micro").some((cell) => cell.tier === "secondary")).toBe(false);
    expect(voxelCells("compact").some((cell) => cell.tier === "secondary")).toBe(true);
    expect(voxelCells("full").some((cell) => cell.tier === "secondary")).toBe(true);
    expect(voxelCells("micro").length).toBe(voxelCells("full").length - 1);
  });

  it("draws every volume cell at one size", () => {
    for (const variant of VARIANTS) {
      const sizes = new Set(slab(variant).map((cell) => cell.size));
      expect(sizes.size).toBe(1);
    }
  });

  it("centres a scaled cell in its lattice slot instead of drifting it", () => {
    const cells = layoutVoxelCells("full");
    const key = cells.find((cell) => cell.tier === "secondary")!;
    expect(key.size).toBeLessThan(slab("full")[0]!.size);
    // A smaller cell is centred in its own slot, so it stays on the axis of the
    // column it is aimed at instead of drifting toward the origin and reading as a
    // stray block that lost its place. The only thing allowed to separate the two
    // centres is the deliberate depth shear, which stays well inside a gutter.
    const sameColumn = cells.filter((cell) => cell.column === key.column && cell !== key);
    expect(sameColumn.length).toBeGreaterThan(0);
    sameColumn.forEach((cell) => {
      expect(Math.abs(cell.x + cell.size / 2 - (key.x + key.size / 2))).toBeLessThan(cell.size * 0.2);
    });
  });

  it("keeps every cell inside the shared viewBox with finite numbers", () => {
    for (const variant of VARIANTS) {
      for (const cell of layoutVoxelCells(variant)) {
        expect(Number.isFinite(cell.x) && Number.isFinite(cell.y)).toBe(true);
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.x + cell.size).toBeLessThanOrEqual(MARK_VIEWBOX);
        expect(cell.y + cell.size).toBeLessThanOrEqual(MARK_VIEWBOX);
      }
    }
  });

  it("centres the drawn cells rather than the lattice box", () => {
    // Per-variant centring is what keeps a 16px favicon bold: the micro set has one
    // fewer cell, and still fills its box instead of shrinking inside a margin.
    for (const variant of VARIANTS) {
      const cells = layoutVoxelCells(variant);
      const left = Math.min(...cells.map((cell) => cell.x));
      const right = MARK_VIEWBOX - Math.max(...cells.map((cell) => cell.x + cell.size));
      expect(left).toBeCloseTo(right, 1);
    }
  });

  it("gives every travelling cell a unit direction, outward from the mass", () => {
    for (const variant of VARIANTS) {
      for (const cell of layoutVoxelCells(variant)) {
        // A unit vector keeps the bloom even: every cell separates by the same
        // distance, so the volume opens instead of exploding.
        expect(Math.abs(Math.hypot(cell.bloomX, cell.bloomY) - 1)).toBeLessThan(1e-3);
      }
    }
  });

  it("assembles outward, with the arriving cell last", () => {
    for (const variant of VARIANTS) {
      const cells = layoutVoxelCells(variant);
      const staggers = cells.map((cell) => cell.stagger);
      // Inner cells land well before the corners, so the read is a volume building
      // from the inside rather than a set of blocks appearing at once.
      expect(Math.min(...staggers)).toBeLessThan(Math.max(...staggers) / 2);
      const arriving = cells.filter((cell) => cell.tier === "secondary");
      arriving.forEach((cell) => {
        expect(cell.stagger).toBe(Math.max(...staggers));
      });
    }
  });

  it("reads depth as light, with the nearest cell brightest", () => {
    for (const variant of VARIANTS) {
      const near = cellTone({ depth: 2, tier: "primary" }, variant);
      const middle = cellTone({ depth: 1, tier: "primary" }, variant);
      const far = cellTone({ depth: 0, tier: "primary" }, variant);
      expect(near).toBeGreaterThan(middle);
      expect(middle).toBeGreaterThan(far);
      expect(cellTone({ depth: 2, tier: "secondary" }, variant)).toBeLessThan(far);
      // No variant relies on colour: every tone is a fraction of one ink.
      [near, middle, far].forEach((tone) => expect(tone).toBeGreaterThan(0));
    }
  });

  it("flattens the depth read at favicon sizes", () => {
    const spread = (variant: VoxelVariant): number =>
      cellTone({ depth: 2, tier: "primary" }, variant) - cellTone({ depth: 0, tier: "primary" }, variant);
    expect(spread("micro")).toBeLessThan(spread("full"));
  });
});

describe("Voxel Bloom markup", () => {
  it("renders one mark per call, carrying its variant, state and ambience", () => {
    const markup = voxelBloomSvg({ variant: "compact", state: "formation", ambient: false });
    expect(markup.match(/<svg/g)).toHaveLength(1);
    expect(markup).toContain('class="veylune-mark"');
    expect(markup).toContain(`viewBox="0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}"`);
    expect(markup).toContain('data-variant="compact"');
    expect(markup).toContain('data-state="formation"');
    expect(markup).toContain('data-ambient="false"');
    expect(markup.match(/<rect/g)).toHaveLength(layoutVoxelCells("compact").length);
  });

  it("never emits a broken number into the markup", () => {
    for (const variant of VARIANTS) {
      const markup = voxelBloomSvg({ variant });
      expect(markup).not.toContain("NaN");
      expect(markup).not.toContain("undefined");
      expect(markup).not.toContain("Infinity");
    }
  });

  it("hands motion to CSS through custom properties instead of inline animation", () => {
    const markup = voxelBloomSvg({ variant: "full" });
    expect(markup).toContain("--vb-bloom-x:");
    expect(markup).toContain("--vb-order:");
    // No timing in the markup: retiming and reduced motion stay a stylesheet job.
    expect(markup).not.toContain("animation");
    expect(markup).not.toContain("<style");
  });

  it("names itself when labelled and disappears when it is only decoration", () => {
    const named = voxelBloomSvg({ label: "Veylune" });
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Veylune"');
    expect(named).not.toContain('aria-hidden="true"');

    const decorative = voxelBloomSvg();
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('role="img"');
  });

  it("escapes a label that contains markup", () => {
    const markup = voxelBloomSvg({ label: 'A "V" & <mark>' });
    expect(markup).toContain('&quot;V&quot; &amp; &lt;mark&gt;');
    // An unescaped quote would have closed the attribute and left markup behind.
    expect(markup).not.toContain('"V"');
    expect(markup).not.toContain("<mark>");
  });

  it("paints a standalone icon that needs no stylesheet", () => {
    const markup = voxelBloomIconSvg({ variant: "micro", ink: "#f5f4ef", tile: "#111310", size: 32 });
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('width="32" height="32"');
    expect(markup).toContain('fill="#111310"');
    expect(markup).toContain('fill="#f5f4ef"');
    // Baked tone, because there is no CSS to inherit from in a favicon file.
    expect(markup).toContain('fill-opacity="');
    expect(markup).not.toContain("currentColor");
    // A transparent icon simply leaves the tile out.
    expect(voxelBloomIconSvg({ variant: "micro" })).not.toContain('x="0" y="0" width="64" height="64"');
  });
});
