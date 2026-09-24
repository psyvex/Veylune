// Rasterises the Voxel Bloom geometry into real PNG app icons and favicons,
// and renders a contact sheet for reviewing the silhouette at every size.
//
// It imports the same geometry module the app renders from, so a favicon can
// never drift from the on-screen mark. Run:
//
//   node scripts/render-brand.mjs            # write public/ icons + favicon
//   node scripts/render-brand.mjs --sheet    # also write /tmp contact sheet
//
// Rasterising lives here rather than in the app: the mark is a rounded-rect
// lattice, so an exact signed-distance rasteriser is both smaller and sharper
// than scaling a downsampled bitmap.

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const { MARK_VIEWBOX, cellTone, layoutVoxelCells, voxelBloomIconSvg } = await import("../src/branding/voxel-bloom.ts");

const TILE = [17, 19, 16]; // near-black ground, matches theme-color
const PAPER = [245, 244, 239]; // near-white ground, matches marketing paper

function coverage(px, py, cell) {
  const dx = Math.abs(px - cell.centreX) - (cell.size / 2 - cell.radius);
  const dy = Math.abs(py - cell.centreY) - (cell.size / 2 - cell.radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return Math.min(1, Math.max(0, 0.5 - (outside + inside - cell.radius)));
}

// Monochrome inversion: the same geometry reads on both grounds, so the sheet
// can show the mark without any colour carrying it.
const GROUNDS = {
  tile: { tile: TILE, ink: [245, 244, 239] },
  paper: { tile: PAPER, ink: [17, 19, 16] },
};

/** Paint the mark into a square RGBA buffer of `pixels`, over an opaque tile. */
function renderMark(pixels, variant, ground) {
  const scale = pixels / MARK_VIEWBOX;
  const cells = layoutVoxelCells(variant).map((cell) => ({
    ...cell,
    centreX: (cell.x + cell.size / 2) * scale,
    centreY: (cell.y + cell.size / 2) * scale,
    size: cell.size * scale,
    radius: cell.radius * scale,
    alpha: cellTone(cell, variant),
  }));

  const buffer = new Uint8ClampedArray(pixels * pixels * 4);
  const [br, bg, bb] = GROUNDS[ground].tile;
  const [ir, ig, ib] = GROUNDS[ground].ink;
  for (let y = 0; y < pixels; y += 1) {
    for (let x = 0; x < pixels; x += 1) {
      let r = br;
      let g = bg;
      let b = bb;
      const px = x + 0.5;
      const py = y + 0.5;
      for (const cell of cells) {
        const cover = coverage(px, py, cell);
        if (cover <= 0) continue;
        const a = cover * cell.alpha;
        r += (ir - r) * a;
        g += (ig - g) * a;
        b += (ib - b) * a;
      }
      const offset = (y * pixels + x) * 4;
      buffer[offset] = Math.round(r);
      buffer[offset + 1] = Math.round(g);
      buffer[offset + 2] = Math.round(b);
      buffer[offset + 3] = 255;
    }
  }
  return buffer;
}

function encodePng(pixels, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(pixels, 0);
  header.writeUInt32BE(pixels, 4);
  header[8] = 8;
  header[9] = 6;
  const idat = deflateSync(toRawBytes(rgba, pixels), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunks("IHDR", header),
    ...chunks("IDAT", idat),
    ...chunks("IEND", Buffer.alloc(0)),
  ]);
}

// Frame one PNG chunk: length, then type+data (the crc covers the type too).
function chunks(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return [length, body, crc32(body)];
}

function toRawBytes(rgba, pixels) {
  const raw = Buffer.alloc((pixels * 4 + 1) * pixels);
  for (let y = 0; y < pixels; y += 1) {
    const rowStart = y * (pixels * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * pixels * 4, pixels * 4).copy(raw, rowStart + 1);
  }
  return raw;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(body) {
  let crc = 0xffffffff;
  for (const byte of body) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const out = Buffer.alloc(4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return out;
}

function writePng(path, pixels, variant, ground) {
  writeFileSync(path, encodePng(pixels, renderMark(pixels, variant, ground)));
  console.log(`wrote ${path.replace(`${webRoot}/`, "")} (${pixels}x${pixels})`);
}

/**
 * Lay entries out left to right per `row`, so sizes can be compared side by
 * side. `zoom` blits a small render back up nearest-neighbour, which is the
 * only honest way to judge what a 16px favicon actually drew.
 */
function composeSheet(entries) {
  const gap = 16;
  const drawn = (entry) => entry.pixels * (entry.zoom ?? 1);
  const rowKeys = [...new Set(entries.map((entry) => entry.row))];
  const rows = rowKeys.map((key) => entries.filter((entry) => entry.row === key));
  const width = Math.max(...rows.map((row) => row.reduce((total, entry) => total + drawn(entry), 0) + gap * (row.length - 1)));
  const height = rows.reduce((total, row) => total + Math.max(...row.map(drawn)) + gap, 0) + gap;
  // Mid grey matting, so the edge of every tile is readable at every size.
  const sheet = Buffer.alloc(width * height * 3);
  for (let i = 0; i < sheet.length; i += 3) sheet[i] = sheet[i + 1] = sheet[i + 2] = 96;

  rows.forEach((row, rowIndex) => {
    const offsetY = rows.slice(0, rowIndex).reduce((total, previous) => total + Math.max(...previous.map(drawn)) + gap, 0) + gap;
    let offsetX = 0;
    row.forEach((entry) => {
      const zoom = entry.zoom ?? 1;
      const mark = renderMark(entry.pixels, entry.variant, entry.ground);
      for (let y = 0; y < entry.pixels * zoom; y += 1) {
        for (let x = 0; x < entry.pixels * zoom; x += 1) {
          const source = ((y / zoom | 0) * entry.pixels + (x / zoom | 0)) * 4;
          const target = ((offsetY + y) * width + offsetX + x) * 3;
          sheet[target] = mark[source];
          sheet[target + 1] = mark[source + 1];
          sheet[target + 2] = mark[source + 2];
        }
      }
      offsetX += drawn(entry) + gap;
    });
  });
  return { sheet, width, height };
}

function writeSheet(path, entries) {
  const { sheet, width, height } = composeSheet(entries);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    sheet.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2; // RGB
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunks("IHDR", header),
    ...chunks("IDAT", deflateSync(raw, { level: 9 })),
    ...chunks("IEND", Buffer.alloc(0)),
  ]));
  console.log(`wrote ${path} (${width}x${height})`);
}

const sizes = [16, 32, 48, 64, 128, 256];

const publicDir = join(webRoot, "public");
mkdirSync(publicDir, { recursive: true });

// Favicons use the reduced lattice; the seeds and wings drop out below ~40px.
const icons = [
  ["favicon-16.png", 16, "micro"],
  ["favicon-32.png", 32, "micro"],
  ["apple-touch-icon.png", 180, "compact"],
  ["icon-192.png", 192, "full"],
  ["icon-512.png", 512, "full"],
];
for (const [name, pixels, variant] of icons) writePng(join(publicDir, name), pixels, variant, "tile");

// Baked paint, not currentColor: a standalone file has no theme to inherit, and
// a default-black mark would vanish on dark browser chrome.
writeFileSync(join(publicDir, "favicon.svg"), `${voxelBloomIconSvg({ variant: "micro", ink: "#f5f4ef", tile: "#111310" })}\n`);
console.log("wrote public/favicon.svg");

writeFileSync(join(publicDir, "site.webmanifest"), `${JSON.stringify({
  name: "Veylune",
  short_name: "Veylune",
  description: "A private spatial studio for capturing spaces, refining local maps, and organizing image sets.",
  start_url: "/",
  display: "standalone",
  background_color: "#111310",
  theme_color: "#111310",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ],
}, null, 2)}\n`);
console.log("wrote public/site.webmanifest");

// A transparent copy of the full-detail mark for docs and anywhere the ground
// is provided by the page rather than the file.
writeFileSync(join(publicDir, "mark.svg"), `${voxelBloomIconSvg({ variant: "full", ink: "#111310" })}\n`);
console.log("wrote public/mark.svg");

if (process.argv.includes("--sheet")) {
  const row = (index, ground, variant) => sizes.map((pixels) => ({ row: index, pixels, variant, ground }));
  writeSheet("/tmp/veylune-contact-sheet.png", [
    ...row(0, "tile", "micro"),
    ...row(1, "tile", "full"),
    ...row(2, "paper", "full"),
    // Blown up: what the 16 and 32 pixel favicons actually rasterised, holes
    // and all, rather than what the geometry was supposed to draw.
    ...sizes.filter((pixels) => pixels <= 48).flatMap((pixels) => [
      { row: 3, pixels, variant: "micro", ground: "tile", zoom: Math.round(96 / pixels) },
      { row: 3, pixels, variant: "full", ground: "tile", zoom: Math.round(96 / pixels) },
    ]),
  ]);
}
