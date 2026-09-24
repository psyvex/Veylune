/**
 * Voxel Bloom — the Veylune identity geometry.
 *
 * One cell lattice, one cell size, one spacing rule. Every surface that shows
 * the identity (logo, loader, splash, favicon, app icons, marketing) renders
 * from the cells exported here, so the mark never drifts between contexts.
 *
 * The object is a slab of precise cells with a keyway cut into one edge, and
 * the cell that belongs in that keyway held just above it. It is an assembly
 * caught one step short of finishing: the slab carries the silhouette and the
 * read at 16px, the keyway and the hovering cell carry the story at 256px.
 *
 * Nothing about it needs colour, and it is not a letter — the brand initial
 * stays absent rather than being drawn. Tone is light, not palette: depth 2
 * reads nearest and brightest and falls away toward the lower right, so the
 * volume looks lit rather than decorated.
 */

export type VoxelVariant = "micro" | "compact" | "full";
export type VoxelDepth = 0 | 1 | 2;
export type VoxelTier = "primary" | "secondary";
export type VoxelState = "dormant" | "bloom" | "formation" | "stable" | "dissolve";

export interface VoxelCell {
  readonly id: string;
  readonly column: number;
  readonly row: number;
  /** 2 reads nearest and brightest, 0 farthest. Drives tone and parallax. */
  readonly depth: VoxelDepth;
  readonly tier: VoxelTier;
  /**
   * Size relative to a lattice cell, centred in its slot. The volume's cells all
   * use 1, so dimensions stay consistent where the eye measures them; only the
   * arriving and departing cells are smaller, which is what keeps them reading
   * as motes rather than stray blocks that lost their place.
   */
  readonly scale?: number;
}

/** A cell resolved to geometry in the mark's own user-space units. */
export interface VoxelCellLayout extends VoxelCell {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly radius: number;
  /** Unit vector away from the centre of mass, used for the bloom translation. */
  readonly bloomX: number;
  readonly bloomY: number;
  /** Travel order, outward from the core, for assembly timing. */
  readonly stagger: number;
}

/** Shared user-space box for every variant. */
export const MARK_VIEWBOX = 64;

/**
 * Fraction of a lattice step a cell fills. The gutter is the remainder.
 *
 * The fill is tuned so simplification is automatic rather than special-cased:
 * at 16-32px a micro gutter is a fraction of a pixel, so the volume optically
 * merges into one solid block, while at 64px and up the same lattice reads as
 * separate cells. One geometry, two reads, no separate favicon drawing.
 */
const CELL_FILL: Record<VoxelVariant, number> = {
  micro: 0.94,
  compact: 0.88,
  full: 0.8,
};

/**
 * Depth parallax as a fraction of a lattice step. Far (dark) cells sit slightly
 * up-left of near (bright) ones, so the volume reads as stacked plates rather
 * than a flat grid. Switched off at favicon sizes, where a sub-pixel shear would
 * only fuzz the merged silhouette.
 */
const DEPTH_SHIFT: Record<VoxelVariant, number> = {
  micro: 0,
  compact: 0.04,
  full: 0.07,
};

/**
 * Monochrome depth read: how much of the mark's ink a cell shows.
 *
 * The on-page mark gets the same values from voxel-bloom.css (it has to, to stay
 * `currentColor` and theme-aware), so the numbers are repeated there. They live
 * here because the rasterised icons and the standalone favicon are baked without
 * CSS and must not drift from it.
 */
const DEPTH_TONE: Record<VoxelVariant, Record<VoxelDepth, number>> = {
  compact: { 0: 0.56, 1: 0.8, 2: 1 },
  full: { 0: 0.5, 1: 0.78, 2: 1 },
  // Favicon sizes: gutters fall below a pixel, so tone flattens out too.
  micro: { 0: 0.86, 1: 0.96, 2: 1 },
};

/** The key cell reads fainter at large sizes and near-flat at small ones. */
const SECONDARY_TONE: Record<VoxelVariant, number> = { micro: 0.7, compact: 0.42, full: 0.36 };

/** Ink strength for one cell, in the variant it is drawn at. */
export function cellTone(cell: Pick<VoxelCell, "depth" | "tier">, variant: VoxelVariant): number {
  const table = DEPTH_TONE[variant] ?? DEPTH_TONE.full;
  return cell.tier === "secondary" ? (SECONDARY_TONE[variant] ?? 0.36) : table[cell.depth];
}

/**
 * The lattice. Column 0..4 left to right, row 0..4 top to bottom.
 *
 * Ten primary cells form a slab four wide and three tall with a keyway cut a
 * cell wide and two cells deep into its top edge. The secondary cell is the cell
 * that fills that keyway, held just above the mouth of it: the object is
 * captured one step short of assembling itself, which is the whole identity in
 * one image and the reason every animation reads as arrival rather than
 * decoration.
 *
 * Two things keep this from reading as a grid of tiles or as a letter. The
 * keyway is two cells deep, so it reads as a machined slot rather than a nick in
 * the corner, and it sits one cell in from the left, so the arms either side of
 * it are unequal and the silhouette has an axis and a direction rather than two
 * equal teeth.
 *
 * Tone is light, not palette: depth 2 reads brightest, 0 farthest, falling away
 * on a north-west to south-east diagonal, so the slab looks lit from the upper
 * left instead of being coloured. The mark stays legible in one flat ink
 * regardless — depth is a hint, not a dependency.
 */
const LATTICE_CELLS: readonly VoxelCell[] = [
  { id: "jamb-west", column: 0, row: 1, depth: 2, tier: "primary" },
  { id: "jamb-east", column: 2, row: 1, depth: 1, tier: "primary" },
  { id: "shoulder-east", column: 3, row: 1, depth: 1, tier: "primary" },
  { id: "flank-west", column: 0, row: 2, depth: 2, tier: "primary" },
  { id: "core", column: 2, row: 2, depth: 1, tier: "primary" },
  { id: "flank-east", column: 3, row: 2, depth: 0, tier: "primary" },
  { id: "base-west", column: 0, row: 3, depth: 1, tier: "primary" },
  { id: "base-mid", column: 1, row: 3, depth: 1, tier: "primary" },
  { id: "base-centre", column: 2, row: 3, depth: 0, tier: "primary" },
  { id: "base-east", column: 3, row: 3, depth: 0, tier: "primary" },
  // The cell the keyway is waiting for, held above its mouth. Smaller and
  // fainter on purpose: it is not part of the slab yet, and it must never
  // compete with it for the read.
  { id: "key", column: 1, row: 0, depth: 2, tier: "secondary", scale: 0.72 },
];

export function voxelCells(variant: VoxelVariant): readonly VoxelCell[] {
  // Favicons drop the key cell. Separated from the slab by a sub-pixel gutter at
  // 16px it would smear into the keyway instead of reading as a second object,
  // and the keyway alone is what makes the silhouette recognisable at that size.
  if (variant === "micro") return LATTICE_CELLS.filter((cell) => cell.tier === "primary");
  return LATTICE_CELLS.slice();
}

/** Optical padding: the mark always occupies this much of its own box. */
const MARK_INSET = 0.11;

/**
 * Resolve the lattice to geometry, centred on the cells the variant actually
 * draws. Centring per variant is what keeps a 16px favicon bold: the merged
 * volume fills the tile instead of shrinking inside a five-by-five margin.
 *
 * `bloomX`/`bloomY` are unit vectors away from the centre of the *mass* rather
 * than the centre of the box, so the travelling cells move farthest and the
 * volume itself only opens slightly — expansion reads as the object breathing,
 * not as an explosion.
 */
export function layoutVoxelCells(variant: VoxelVariant): readonly VoxelCellLayout[] {
  const cells = voxelCells(variant);
  const fill = CELL_FILL[variant];
  const shear = DEPTH_SHIFT[variant];
  const span = MARK_VIEWBOX * (1 - MARK_INSET * 2);
  const edge = (cells: readonly VoxelCell[], key: "column" | "row", pick: "min" | "max"): number =>
    Math[pick](...cells.map((cell) => cell[key]));
  const columns = edge(cells, "column", "min");
  const rows = edge(cells, "row", "min");
  const extent = (key: "column" | "row"): number => edge(cells, key, "max") - (key === "column" ? columns : rows);
  const step = Math.min(span / (extent("column") + fill), span / (extent("row") + fill));
  const size = step * fill;
  const originX = (MARK_VIEWBOX - (extent("column") * step + size)) / 2;
  const originY = (MARK_VIEWBOX - (extent("row") * step + size)) / 2;
  const volume = cells.filter((cell) => cell.tier === "primary" && (cell.scale ?? 1) === 1);
  const massX = originX + (edge(volume, "column", "max") - columns) * step * 0.5 + size / 2;
  const massY = originY + (edge(volume, "row", "max") - rows) * step * 0.5 + size / 2;

  const laid = cells.map((cell) => {
    const drift = (cell.depth - 1) * step * shear;
    // Centred in its lattice slot, so a smaller cell stays on the same axis as
    // the cells around it instead of drifting toward the origin.
    const cellSize = size * (cell.scale ?? 1);
    const inset = (size - cellSize) / 2;
    const rawX = originX + (cell.column - columns) * step + drift + inset;
    const rawY = originY + (cell.row - rows) * step + drift + inset;
    const offsetX = rawX + cellSize / 2 - massX;
    const offsetY = rawY + cellSize / 2 - massY;
    const distance = Math.hypot(offsetX, offsetY);
    // A cell at the centre of mass has nowhere to travel, and dividing by a
    // distance that small would give its tiny offset an arbitrary direction. It
    // stays put, which is also correct: the core is what everything else
    // assembles around.
    const settled = distance < step * 0.25;
    return {
      ...cell,
      x: round(rawX),
      y: round(rawY),
      size: round(cellSize),
      radius: round(cellSize * (variant === "micro" ? 0.2 : 0.16)),
      bloomX: settled ? 0 : round(offsetX / distance),
      bloomY: settled ? 0 : round(offsetY / distance),
      stagger: Math.round((distance / step) * 10) / 10,
    };
  });

  // The arriving cell is last by definition, wherever it happens to sit: the volume
  // assembles outward from the core and the key follows it into the keyway. Ordered
  // purely by distance it would land mid-pack, and the assembly would lose the one
  // gesture the mark is built around. Dissolve reverses the same order, so the key
  // is the first cell to leave.
  const last = Math.max(...laid.filter((cell) => cell.tier === "primary").map((cell) => cell.stagger));
  return laid.map((cell) => (cell.tier === "primary" ? cell : { ...cell, stagger: round(last + 1) }));
}

export interface VoxelBloomOptions {
  readonly variant?: VoxelVariant;
  /** `dormant | bloom | formation | stable | dissolve`, see voxel-bloom.css. */
  readonly state?: VoxelState;
  /** Ambient drift once assembled. Off under prefers-reduced-motion. */
  readonly ambient?: boolean;
  /** When omitted the mark is decorative and hidden from assistive tech. */
  readonly label?: string;
  readonly className?: string;
  /** Travel distance of the bloom separation, in user-space units. */
  readonly bloomReach?: number;
}

/**
 * Render the mark as SVG markup. Cells carry their motion as custom properties,
 * so all animation lives in CSS where it can be retimed globally and disabled
 * for reduced motion without touching this markup.
 */
export function voxelBloomSvg(options: VoxelBloomOptions = {}): string {
  const {
    variant = "full",
    state = "stable",
    ambient = true,
    label,
    className,
    bloomReach = 4.2,
  } = options;
  const cells = layoutVoxelCells(variant);
  const classes = ["veylune-mark", className].filter(Boolean).join(" ");
  const geometry = label ? `role="img" aria-label="${escapeAttribute(label)}"` : 'aria-hidden="true" focusable="false"';
  const shapes = cells.map((cell) => {
    const style = [
      `--vb-bloom-x:${round(cell.bloomX * bloomReach)}`,
      `--vb-bloom-y:${round(cell.bloomY * bloomReach)}`,
      `--vb-order:${cell.stagger}`,
    ].join(";");
    return cellMarkup(cell, `class="vb-cell" data-depth="${cell.depth}" data-tier="${cell.tier}" style="${style}"`);
  });

  return `<svg class="${classes}" viewBox="0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}" data-variant="${variant}" data-state="${state}" data-ambient="${ambient ? "true" : "false"}" ${geometry} preserveAspectRatio="xMidYMid meet">${shapes.join("")}</svg>`;
}

export interface VoxelBloomIconOptions {
  readonly variant?: VoxelVariant;
  readonly label?: string;
  /** Cell colour, baked because a standalone file has no stylesheet to inherit. */
  readonly ink?: string;
  /** Opaque square behind the cells. Omit for a transparent icon. */
  readonly tile?: string;
  /** Optional intrinsic size; favicons scale from the viewBox without it. */
  readonly size?: number;
}

/**
 * Self-contained mark for files that load outside the app (favicon.svg,
 * standalone SVG icons). Same lattice as voxelBloomSvg, but tone and paint are
 * baked in as attributes because nothing else is there to style it.
 */
export function voxelBloomIconSvg(options: VoxelBloomIconOptions = {}): string {
  const { variant = "micro", label = "Veylune", ink = "#111310", tile, size } = options;
  const cells = layoutVoxelCells(variant);
  const dimension = size ? ` width="${size}" height="${size}"` : "";
  const background = tile ? cellMarkup({ x: 0, y: 0, size: MARK_VIEWBOX, radius: 0 }, `fill="${tile}"`) : "";
  const shapes = cells.map((cell) => cellMarkup(cell, `fill="${ink}" fill-opacity="${cellTone(cell, variant)}"`));

  return `<svg xmlns="http://www.w3.org/2000/svg"${dimension} viewBox="0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}" class="veylune-mark vb-icon" role="img" aria-label="${escapeAttribute(label)}" preserveAspectRatio="xMidYMid meet">${background}${shapes.join("")}</svg>`;
}

function cellMarkup(cell: Pick<VoxelCellLayout, "x" | "y" | "size" | "radius">, attributes: string): string {
  const radius = cell.radius ? ` rx="${cell.radius}"` : "";
  return `<rect ${attributes} x="${cell.x}" y="${cell.y}" width="${cell.size}" height="${cell.size}"${radius} />`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
