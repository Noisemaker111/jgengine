import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const source = path.join(root, "public/images/icons.png");
const outDir = path.join(root, "public/icons/builder");

const ICON_IDS = [
  ["select", "wall", "place", "paint"],
  ["floor", "wall-surface", "ceiling", "delete"],
  ["library", "generate-ai", "send", "save"],
  ["copy", "group", "ungroup", "grid-snap"],
];

const INK = { r: 22, g: 32, b: 30 };
const BG_THRESHOLD = 42;

mkdirSync(outDir, { recursive: true });

const sourceImage = sharp(source);
const { width, height } = await sourceImage.metadata();
if (!width || !height) throw new Error("Could not read icons.png dimensions");

const colWidths = Array.from({ length: 4 }, (_, index) => Math.floor(width / 4) + (index < width % 4 ? 1 : 0));
const rowHeights = Array.from({ length: 4 }, (_, index) => Math.floor(height / 4) + (index < height % 4 ? 1 : 0));

const colOffsets = colWidths.reduce((offsets, cellWidth, index) => {
  offsets.push(index === 0 ? 0 : offsets[index - 1] + colWidths[index - 1]);
  return offsets;
}, []);

const rowOffsets = rowHeights.reduce((offsets, cellHeight, index) => {
  offsets.push(index === 0 ? 0 : offsets[index - 1] + rowHeights[index - 1]);
  return offsets;
}, []);

function keyBackground({ r, g, b, a }) {
  if (a < 8) return true;
  const distance = Math.hypot(r - INK.r, g - INK.g, b - INK.b);
  if (distance <= BG_THRESHOLD) return true;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 28 && Math.max(r, g, b) - Math.min(r, g, b) < 18;
}

for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 4; col += 1) {
    const id = ICON_IDS[row][col];
    const left = colOffsets[col];
    const top = rowOffsets[row];
    const cellWidth = colWidths[col];
    const cellHeight = rowHeights[row];

    const { data, info } = await sharp(source)
      .extract({ left, top, width: cellWidth, height: cellHeight })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let index = 0; index < data.length; index += 4) {
      const pixel = {
        r: data[index],
        g: data[index + 1],
        b: data[index + 2],
        a: data[index + 3],
      };
      if (keyBackground(pixel)) {
        data[index + 3] = 0;
      }
    }

    const trimmed = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .trim({ threshold: 1 })
      .png()
      .toBuffer();

    const square = await sharp(trimmed)
      .resize(256, 256, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(path.join(outDir, `${id}.png`));

    console.log(`${id}.png -> ${square.width}x${square.height}`);
  }
}

console.log(`Wrote ${ICON_IDS.flat().length} icons to ${outDir}`);