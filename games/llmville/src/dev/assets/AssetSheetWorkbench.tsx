import {
  buildSpriteSheetGridBoxes,
  buildSpriteSheetManifest,
  type SpriteSheetGridConfig,
  type SpriteSheetSliceBox,
} from "@jgengine/core/assets/spriteSheet";
import { Check, Copy, Download, Grid3X3, ImagePlus, Scissors } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type BackgroundMode = "none" | "corner" | "edge" | "checker";

interface SheetImage {
  fileName: string;
  url: string;
  width: number;
  height: number;
  element: HTMLImageElement;
}

interface ProcessingOptions {
  backgroundMode: BackgroundMode;
  tolerance: number;
  autoTrim: boolean;
  trimPadding: number;
}

const DEFAULT_GRID: SpriteSheetGridConfig = {
  columns: 4,
  rows: 4,
  marginX: 0,
  marginY: 0,
  gapX: 0,
  gapY: 0,
};

const DEFAULT_PROCESSING: ProcessingOptions = {
  backgroundMode: "edge",
  tolerance: 34,
  autoTrim: true,
  trimPadding: 4,
};

const PRESET_NAMES: Record<string, string> = {
  "4x4-mmo": [
    "armored-player",
    "caster",
    "scout",
    "raider",
    "stone-golem",
    "wolf",
    "undead-soldier",
    "village-npc",
    "quest-giver",
    "merchant",
    "bag",
    "spellbook",
    "sword-attack",
    "fireball",
    "health-potion",
    "loot-chest",
  ].join("\n"),
  "4x2-terrain": [
    "grass",
    "dirt-path",
    "rocky-soil",
    "mossy-stone",
    "roots",
    "mud",
    "pebbles",
    "stone-slabs",
  ].join("\n"),
};

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function colorDistance(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function pixelAt(data: Uint8ClampedArray, index: number): [number, number, number] {
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0];
}

function similarToAnyBackground(
  data: Uint8ClampedArray,
  index: number,
  backgrounds: readonly (readonly [number, number, number])[],
  tolerance: number,
): boolean {
  const color = pixelAt(data, index);
  return backgrounds.some((background) => colorDistance(color, background) <= tolerance);
}

function removeBackground(imageData: ImageData, options: ProcessingOptions): ImageData {
  if (options.backgroundMode === "none") return imageData;

  const { width, height, data } = imageData;
  const sample = (x: number, y: number) => pixelAt(data, (y * width + x) * 4);
  const backgrounds = [
    sample(0, 0),
    sample(width - 1, 0),
    sample(0, height - 1),
    sample(width - 1, height - 1),
  ];

  if (options.backgroundMode === "checker") {
    backgrounds.push(sample(Math.floor(width / 2), 0), sample(Math.floor(width / 2), height - 1));
  }

  if (options.backgroundMode === "corner" || options.backgroundMode === "checker") {
    for (let index = 0; index < data.length; index += 4) {
      if (similarToAnyBackground(data, index, backgrounds, options.tolerance)) data[index + 3] = 0;
    }
    return imageData;
  }

  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const point = y * width + x;
    if (visited[point] === 1) return;
    visited[point] = 1;
    queue.push(point);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor]!;
    const x = point % width;
    const y = Math.floor(point / width);
    const index = point * 4;
    if (!similarToAnyBackground(data, index, backgrounds, options.tolerance)) continue;
    data[index + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  return imageData;
}

function findOpaqueBounds(imageData: ImageData, padding: number): { x: number; y: number; width: number; height: number } {
  const { width, height, data } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha <= 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height };

  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const right = Math.min(width - 1, maxX + padding);
  const bottom = Math.min(height - 1, maxY + padding);
  return { x, y, width: right - x + 1, height: bottom - y + 1 };
}

function renderSliceCanvas(
  image: HTMLImageElement,
  box: SpriteSheetSliceBox,
  options: ProcessingOptions,
): HTMLCanvasElement {
  const source = document.createElement("canvas");
  source.width = box.width;
  source.height = box.height;
  const sourceCtx = source.getContext("2d");
  if (sourceCtx === null) throw new Error("Unable to create source canvas context.");
  sourceCtx.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

  const processed = removeBackground(sourceCtx.getImageData(0, 0, box.width, box.height), options);
  sourceCtx.putImageData(processed, 0, 0);

  if (!options.autoTrim) return source;

  const bounds = findOpaqueBounds(processed, options.trimPadding);
  const output = document.createElement("canvas");
  output.width = bounds.width;
  output.height = bounds.height;
  const outputCtx = output.getContext("2d");
  if (outputCtx === null) throw new Error("Unable to create output canvas context.");
  outputCtx.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );
  return output;
}

function downloadCanvas(canvas: HTMLCanvasElement, fileName: string): void {
  canvas.toBlob((blob) => {
    if (blob === null) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function downloadText(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function SlicePreview({
  image,
  box,
  processing,
}: {
  image: HTMLImageElement;
  box: SpriteSheetSliceBox;
  processing: ProcessingOptions;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const preview = renderSliceCanvas(image, box, processing);
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    canvas.width = preview.width;
    canvas.height = preview.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(preview, 0, 0);
  }, [box, image, processing]);

  return (
    <div className="rounded border border-slate-300 bg-white p-2 shadow-sm">
      <div className="flex h-28 items-center justify-center rounded bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] bg-[length:16px_16px]">
        <canvas ref={canvasRef} className="max-h-24 max-w-full object-contain" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-950">{box.name}</div>
          <div className="text-[10px] text-slate-500">
            {box.width}x{box.height} at {box.x},{box.y}
          </div>
        </div>
        <button
          type="button"
          title={`Download ${box.name}`}
          aria-label={`Download ${box.name}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
          onClick={() => downloadCanvas(renderSliceCanvas(image, box, processing), `${box.name}.png`)}
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ControlNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
      {label}
      <input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? undefined : numberValue(event.target.value, 0))}
        className="h-9 rounded border border-slate-300 bg-white px-2 text-sm text-slate-950"
      />
    </label>
  );
}

export function AssetSheetWorkbench() {
  const [sheet, setSheet] = useState<SheetImage | null>(null);
  const [grid, setGrid] = useState<SpriteSheetGridConfig>(DEFAULT_GRID);
  const [namePrefix, setNamePrefix] = useState("asset");
  const [namesText, setNamesText] = useState("");
  const [processing, setProcessing] = useState<ProcessingOptions>(DEFAULT_PROCESSING);
  const [copied, setCopied] = useState(false);

  const names = useMemo(
    () => namesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    [namesText],
  );

  const boxes = useMemo(() => {
    if (sheet === null) return [];
    try {
      return buildSpriteSheetGridBoxes({
        imageWidth: sheet.width,
        imageHeight: sheet.height,
        config: grid,
        namePrefix,
        names,
      });
    } catch {
      return [];
    }
  }, [grid, namePrefix, names, sheet]);

  const manifestJson = useMemo(() => {
    if (sheet === null || boxes.length === 0) return "";
    return JSON.stringify(
      buildSpriteSheetManifest({
        sourceName: sheet.fileName,
        imageWidth: sheet.width,
        imageHeight: sheet.height,
        config: grid,
        slices: boxes,
      }),
      null,
      2,
    );
  }, [boxes, grid, sheet]);

  const handleFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    await image.decode();
    setSheet({ fileName: file.name, url, width: image.naturalWidth, height: image.naturalHeight, element: image });
  };

  const updateGrid = (patch: Partial<SpriteSheetGridConfig>) => setGrid((current) => ({ ...current, ...patch }));
  const updateProcessing = (patch: Partial<ProcessingOptions>) =>
    setProcessing((current) => ({ ...current, ...patch }));

  const downloadAll = () => {
    if (sheet === null) return;
    for (const box of boxes) {
      downloadCanvas(renderSliceCanvas(sheet.element, box, processing), `${box.name}.png`);
    }
  };

  const copyManifest = async () => {
    if (manifestJson.length === 0) return;
    await navigator.clipboard.writeText(manifestJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <main className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-4">
      <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-3 rounded border border-slate-300 bg-white p-4 shadow-sm">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-slate-400 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <ImagePlus className="h-5 w-5" />
            Load sprite sheet
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void handleFile(file);
              }}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <ControlNumber label="Columns" value={grid.columns} onChange={(value) => updateGrid({ columns: value ?? 1 })} />
            <ControlNumber label="Rows" value={grid.rows} onChange={(value) => updateGrid({ rows: value ?? 1 })} />
            <ControlNumber label="Margin X" value={grid.marginX} onChange={(value) => updateGrid({ marginX: value ?? 0 })} />
            <ControlNumber label="Margin Y" value={grid.marginY} onChange={(value) => updateGrid({ marginY: value ?? 0 })} />
            <ControlNumber label="Gap X" value={grid.gapX} onChange={(value) => updateGrid({ gapX: value ?? 0 })} />
            <ControlNumber label="Gap Y" value={grid.gapY} onChange={(value) => updateGrid({ gapY: value ?? 0 })} />
            <ControlNumber label="Cell W" value={grid.cellWidth} onChange={(value) => updateGrid({ cellWidth: value })} />
            <ControlNumber label="Cell H" value={grid.cellHeight} onChange={(value) => updateGrid({ cellHeight: value })} />
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
            Name prefix
            <input
              value={namePrefix}
              onChange={(event) => setNamePrefix(event.target.value)}
              className="h-9 rounded border border-slate-300 bg-white px-2 text-sm text-slate-950"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
            Names, one per cell
            <textarea
              value={namesText}
              onChange={(event) => setNamesText(event.target.value)}
              rows={8}
              className="resize-y rounded border border-slate-300 bg-white px-2 py-2 text-xs text-slate-950"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-100"
              onClick={() => {
                setGrid({ columns: 4, rows: 4, marginX: 0, marginY: 0, gapX: 0, gapY: 0 });
                setNamesText(PRESET_NAMES["4x4-mmo"]);
              }}
            >
              4x4 MMO
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-100"
              onClick={() => {
                setGrid({ columns: 4, rows: 2, marginX: 0, marginY: 0, gapX: 0, gapY: 0 });
                setNamesText(PRESET_NAMES["4x2-terrain"]);
              }}
            >
              4x2 terrain
            </button>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Scissors className="h-4 w-4" />
              Background
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
              Removal mode
              <select
                value={processing.backgroundMode}
                onChange={(event) => updateProcessing({ backgroundMode: event.target.value as BackgroundMode })}
                className="h-9 rounded border border-slate-300 bg-white px-2 text-sm"
              >
                <option value="none">None</option>
                <option value="edge">Flood from edges</option>
                <option value="corner">Remove corner color</option>
                <option value="checker">Checkerboard / fake transparent</option>
              </select>
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ControlNumber
                label="Tolerance"
                value={processing.tolerance}
                onChange={(value) => updateProcessing({ tolerance: value ?? 0 })}
              />
              <ControlNumber
                label="Trim pad"
                value={processing.trimPadding}
                onChange={(value) => updateProcessing({ trimPadding: value ?? 0 })}
              />
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={processing.autoTrim}
                onChange={(event) => updateProcessing({ autoTrim: event.target.checked })}
              />
              Auto trim transparent edges
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={sheet === null || boxes.length === 0}
              className="flex items-center justify-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              onClick={downloadAll}
            >
              <Download className="h-4 w-4" />
              All PNGs
            </button>
            <button
              type="button"
              disabled={manifestJson.length === 0}
              className="flex items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40"
              onClick={() => downloadText(manifestJson, "sprite-sheet.manifest.json")}
            >
              <Grid3X3 className="h-4 w-4" />
              Manifest
            </button>
            <button
              type="button"
              disabled={manifestJson.length === 0}
              className="col-span-2 flex items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40"
              onClick={() => void copyManifest()}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied manifest" : "Copy manifest"}
            </button>
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded border border-slate-300 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Source review</h2>
                <p className="text-xs text-slate-500">
                  {sheet === null ? "No sheet loaded" : `${sheet.fileName} - ${sheet.width}x${sheet.height} - ${boxes.length} slices`}
                </p>
              </div>
            </div>
            <div className="max-h-[620px] overflow-auto rounded bg-slate-950 p-3">
              {sheet === null ? (
                <div className="grid h-72 place-items-center rounded border border-dashed border-slate-700 text-sm text-slate-400">
                  Load an image to review slice boxes.
                </div>
              ) : (
                <div className="relative inline-block max-w-full">
                  <img src={sheet.url} alt="" className="block max-h-[560px] max-w-full object-contain" />
                  {boxes.map((box) => (
                    <div
                      key={box.id}
                      className="absolute border border-amber-300 bg-amber-300/10 text-[10px] font-semibold text-amber-100"
                      style={{
                        left: `${(box.x / sheet.width) * 100}%`,
                        top: `${(box.y / sheet.height) * 100}%`,
                        width: `${(box.width / sheet.width) * 100}%`,
                        height: `${(box.height / sheet.height) * 100}%`,
                      }}
                    >
                      <span className="bg-slate-950/80 px-1">{box.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-300 bg-white p-3 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-950">Processed slices</h2>
            {sheet === null || boxes.length === 0 ? (
              <div className="grid h-48 place-items-center rounded border border-dashed border-slate-300 text-sm text-slate-500">
                Previews appear after a valid grid is configured.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {boxes.map((box) => (
                  <SlicePreview key={box.id} image={sheet.element} box={box} processing={processing} />
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
