/** Portable image atlas data shared by renderers and headless game logic. */
export interface SpriteAtlas {
  image: string;
  size: [number, number];
  frames: Record<string, { x: number; y: number; w: number; h: number; pivot?: [number, number] }>;
  animations: Record<string, { frames: string[]; fps: number; loop?: boolean }>;
}

type FrameData = { x: number; y: number; w: number; h: number; pivot?: [number, number] };

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

function frame(value: unknown, label: string): FrameData {
  const data = object(value, label);
  const x = number(data.x, `${label}.x`); const y = number(data.y, `${label}.y`);
  const w = number(data.w ?? data.width, `${label}.w`); const h = number(data.h ?? data.height, `${label}.h`);
  if (w <= 0 || h <= 0 || x < 0 || y < 0) throw new Error(`${label} has invalid bounds.`);
  const pivotValue = data.pivot;
  const pivot = pivotValue === undefined ? undefined : [number((pivotValue as unknown[])[0], `${label}.pivot[0]`), number((pivotValue as unknown[])[1], `${label}.pivot[1]`)] as [number, number];
  return pivot ? { x, y, w, h, pivot } : { x, y, w, h };
}

function imageAndSize(root: Record<string, unknown>): { image: string; size: [number, number] } {
  const meta = object(root.meta, "meta");
  const image = typeof meta.image === "string" ? meta.image : typeof root.image === "string" ? root.image : undefined;
  if (!image) throw new Error("Sprite atlas image is required.");
  const rawSize = object(meta.size ?? root.size, "size");
  const size: [number, number] = [number(rawSize.w ?? rawSize.width, "size[0]"), number(rawSize.h ?? rawSize.height, "size[1]")];
  if (size[0] <= 0 || size[1] <= 0) throw new Error("Sprite atlas size must be positive.");
  return { image, size };
}

function animationFrames(names: string[], fps = 10, loop = true): { frames: string[]; fps: number; loop?: boolean } {
  if (!names.length || !Number.isFinite(fps) || fps <= 0) throw new Error("Animation requires frames and a positive fps.");
  return { frames: names, fps, ...(loop ? {} : { loop: false }) };
}

/** Convert Aseprite JSON exports (hash or array frame layouts) to the portable atlas format. */
export function fromAseprite(json: unknown): SpriteAtlas {
  const root = object(json, "Aseprite export"); const framesRoot = root.frames;
  const frames: Record<string, FrameData> = {};
  const durations: Record<string, number> = {};
  const names: string[] = [];
  if (Array.isArray(framesRoot)) {
    for (const [index, entry] of framesRoot.entries()) { const e = object(entry, `frames[${index}]`); const name = typeof e.filename === "string" ? e.filename : String(index); frames[name] = frame(e.frame, `frames[${index}].frame`); if (e.duration !== undefined) durations[name] = number(e.duration, `frames[${index}].duration`); names.push(name); }
  } else {
    for (const [name, entry] of Object.entries(object(framesRoot, "frames"))) { const e = object(entry, `frames.${name}`); frames[name] = frame(e.frame ?? e, `frames.${name}`); if (e.duration !== undefined) durations[name] = number(e.duration, `frames.${name}.duration`); names.push(name); }
  }
  if (!names.length) throw new Error("Aseprite export must contain frames.");
  const size = imageAndSize(root); const animations: SpriteAtlas["animations"] = {};
  const tags = Array.isArray((root.meta as Record<string, unknown> | undefined)?.frameTags) ? (root.meta as Record<string, unknown>).frameTags as unknown[] : [];
  for (const [index, tagValue] of tags.entries()) { const tag = object(tagValue, `meta.frameTags[${index}]`); const name = String(tag.name ?? ""); const from = Number(tag.from); const to = Number(tag.to); if (!name || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to >= names.length || from > to) throw new Error(`Invalid animation tag at index ${index}.`); const direction = tag.direction === "reverse" ? -1 : 1; const ordered = names.slice(from, to + 1); if (direction < 0) ordered.reverse(); const totalDuration = ordered.reduce((sum, frameName) => sum + (durations[frameName] ?? 100), 0); animations[name] = animationFrames(ordered, ordered.length * 1000 / totalDuration, tag.direction !== "pingpong"); }
  if (!Object.keys(animations).length) animations.default = animationFrames(names);
  return { image: size.image, size: size.size, frames, animations };
}

/** Convert TexturePacker JSON exports to the portable atlas format. */
export function fromTexturePacker(json: unknown): SpriteAtlas {
  const root = object(json, "TexturePacker export"); const size = imageAndSize(root); const frames: Record<string, FrameData> = {};
  const source = Array.isArray(root.frames) ? root.frames.map((entry, index) => [String((object(entry, `frames[${index}]`).filename ?? index)), entry] as const) : Object.entries(object(root.frames, "frames"));
  for (const [name, value] of source) { const e = object(value, `frames.${name}`); frames[name] = frame(e.frame ?? e, `frames.${name}.frame`); }
  const names = Object.keys(frames); if (!names.length) throw new Error("TexturePacker export must contain frames.");
  const animations: SpriteAtlas["animations"] = { default: animationFrames(names) };
  return { image: size.image, size: size.size, frames, animations };
}
