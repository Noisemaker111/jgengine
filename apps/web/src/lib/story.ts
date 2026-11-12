/**
 * The homepage's story: the decisions that made jgengine what it is, each with its date, the reason
 * given at the time, its numbers and where to check them. Every figure here is quoted from the PR,
 * issue, commit or committed file named in `source`; the native benchmark rows are `native/README.md`'s
 * results table as measured on 2026-11-07. Change a number only by changing its source first.
 */

export type DecisionKind =
  /** Shipped and still true. */
  | "ship"
  /** Something taken out of the engine. */
  | "remove"
  /** Built and measured, and kept out of (or behind a switch in) what ships. */
  | "experiment";

export interface Decision {
  /** Anchor on the page. */
  id: string;
  /** For an experiment, what became of it ("not shipped", "preview"). */
  outcome?: string;
  /** ISO date the change merged. */
  date: string;
  kind: DecisionKind;
  title: string;
  /** What was done, in one or two sentences. */
  did: string;
  /** The reason given when it was done, or what the measurement showed; absent when none was recorded. */
  why?: string;
  /** Measured numbers, each a short "value — what it is" pair. */
  numbers?: readonly { value: string; label: string }[];
  /** Where to check it: PR, issue, commit or file. */
  source: { label: string; href: string };
}

const REPO = "https://github.com/Noisemaker111/jgengine";
const pr = (n: number) => ({ label: `PR #${n}`, href: `${REPO}/pull/${n}` });
const issue = (n: number) => ({ label: `issue #${n}`, href: `${REPO}/issues/${n}` });

export const DECISIONS: readonly Decision[] = [
  {
    id: "day-one",
    date: "2026-07-05",
    kind: "ship",
    title: "Day one: packages, not a template.",
    did: "The first commit was six packages (core, react, convex, node, ws, sql), and 0.1.0 went to npm the same day.",
    numbers: [{ value: "6", label: "packages on day one, 13 now" }],
    source: { label: "commit da075b83c", href: `${REPO}/commit/da075b83c` },
  },
  {
    id: "one-sentence",
    date: "2026-07-11",
    kind: "ship",
    title: "One sentence is the whole interface.",
    did: "People say “Make a game that … with jgengine” to a coding agent. The CLI is for the agent. Two days later the skills moved into every npm tarball.",
    why: "Outside agents told to use jgengine were cloning the monorepo and copying game content. Skills in node_modules teach the API where the agent already looks.",
    numbers: [{ value: "14", label: "agent skills staged into the npm packages" }],
    source: pr(435),
  },
  {
    id: "apache",
    date: "2026-07-16",
    kind: "ship",
    title: "AGPL out. Apache-2.0 in.",
    did: "Relicensed from AGPL-3.0-only to Apache-2.0 with a NOTICE file.",
    why: "So a paid, closed-source game can ship on the engine. The NOTICE keeps the credit.",
    source: pr(855),
  },
  {
    id: "no-docs",
    date: "2026-09-25",
    kind: "remove",
    title: "Delete the docs folder.",
    did: "docs/, plans and logs were deleted, and CI now fails if they come back. What remains is code, READMEs, generated API pages and skills.",
    why: "Plans and decision records go stale, and every agent session re-reads them.",
    source: pr(1851),
  },
  {
    id: "games-in-repo",
    date: "2026-10-25",
    kind: "ship",
    title: "The games move back in with the engine.",
    did: "The games left for their own repo in August. In October they came back into games/ and now run engine source from the same commit.",
    why: "An engine change that breaks a game gets fixed in the same PR. The version pin and the cross-repo bump workflows went with the move.",
    numbers: [{ value: "10", label: "games built and tested with every engine change" }],
    source: { label: "commit 649fb4013", href: `${REPO}/commit/649fb4013` },
  },
  {
    id: "parts",
    date: "2026-10-29",
    kind: "ship",
    title: "Eleven parts instead of a thousand features.",
    did: "Every feature is built from a few general parts (Meter, Ladder, Phases, Schedule, Slots, Placement, Table, Requirement, Modifiers, Inheritance, Motion track), and each part has one home.",
    why: "The engine had its own copy of the same parts inside one-game features, so a game that wanted half a feature took all of it or wrote it again.",
    numbers: [
      { value: "16", label: "separate meters" },
      { value: "15", label: "tier lists" },
      { value: "25", label: "stage lists" },
    ],
    source: issue(2817),
  },
  {
    id: "frame-budget",
    date: "2026-10-31",
    kind: "ship",
    title: "A frame budget with a pass mark.",
    did: "perf gate plays every game and fails any whose p95 frame is over 16.7 ms on an RTX 3070 at 1600×900. 360 fps (2.78 ms) became the target, and perf fps-gap reports how far each game is from it.",
    numbers: [
      { value: "16.7 ms", label: "p95 frame gate" },
      { value: "2.78 ms", label: "the 360 fps target" },
    ],
    source: { label: "commit 0868847c4", href: `${REPO}/commit/0868847c4` },
  },
  {
    id: "native-rust",
    outcome: "measured, not shipped",
    date: "2026-11-07",
    kind: "experiment",
    title: "Build a Rust engine to find out if we need one.",
    did: "We recorded every draw three.js made in two games, replayed them in a native Rust renderer (wgpu, naga, Rune, V8), then built the same replay for wasm and WebGPU in Chrome.",
    why: "Harbor Heat got 4× faster and Deepward didn't move. The wasm build in Chrome matched native, so the slow part was the WebGL path, not the browser. Native Rust did not ship.",
    numbers: [
      { value: "73 → 283", label: "Harbor Heat fps, current engine vs wasm + WebGPU" },
      { value: "0", label: "fps gained on Deepward, which waits on the GPU" },
    ],
    source: issue(3041),
  },
  {
    id: "webgpu",
    outcome: "shipped as a preview",
    date: "2026-11-08",
    kind: "experiment",
    title: "WebGPU, behind a switch.",
    did: "three's WebGL renderer runs unchanged on a WebGL-shaped context that submits through WebGPU, and a wasm build of naga translates its GLSL to WGSL. Players turn it on under Graphics > Renderer.",
    why: "It draws the same image but isn't yet faster on any game, so WebGL stays the default and WebGPU ships as a preview.",
    numbers: [{ value: "0.8–1.2×", label: "WebGPU's frame time vs WebGL's, down from 1.2–3.2×" }],
    source: pr(3067),
  },
  {
    id: "no-react",
    date: "2026-11-10",
    kind: "remove",
    title: "React out. The engine's own JSX in.",
    did: "React Three Fiber and drei were removed, and three.js now runs on a frame loop the engine owns. Later that day React itself was replaced by the engine's own JSX runtime.",
    why: "React and R3F did work no system timed inside every frame in 8 of 9 games. The switch itself hasn't been timed yet; that run is still to do.",
    numbers: [
      { value: "33.6%", label: "of Deepward's main thread was React + R3F" },
      { value: "2.87 ms", label: "worst untimed work per frame (Fernwild)" },
    ],
    source: issue(3019),
  },
  {
    id: "rune",
    date: "2026-11-11",
    kind: "ship",
    title: "Every game's UI is drawn by Rune.",
    did: "Game UI is written in the engine's JSX and drawn by Rune, a Rust UI library compiled to wasm, on the game canvas. All ten games moved in one day, and the CSS-to-Rune mirror was deleted.",
    why: "The cost is download size, and the changelog records it: the UI wasm went from 7.7 to 10.3 MB with the latest Rune update.",
    numbers: [{ value: "4.9 MB", label: "Rune wasm, gzipped (10.3 MB raw)" }],
    source: pr(3134),
  },
];

/** One row of the native experiment: frames per second over the run, once or twice back to back. */
export interface BenchRow {
  label: string;
  what: string;
  /** fps of each run; two runs show as a range. */
  fps: readonly number[];
  /** Frame p50 in ms of each run. */
  p50: readonly number[];
  kind: "current" | "native" | "web";
}

export interface BenchGame {
  game: string;
  id: string;
  verdict: string;
  rows: readonly BenchRow[];
}

/** native/README.md "Results": RTX 3070, 1920×1080, uncapped, 8 s of each game's perf walk. */
export const NATIVE_BENCH: readonly BenchGame[] = [
  {
    game: "Harbor Heat",
    id: "harbor-heat",
    verdict: "4× faster. The draw-heavy city is held back by how its frame reaches the GPU.",
    rows: [
      { label: "Current engine", what: "TypeScript + three.js, desktop build", fps: [73, 75], p50: [13.5, 13.2], kind: "current" },
      { label: "Rust native", what: "the same draws through wgpu", fps: [182, 272], p50: [3.54, 3.44], kind: "native" },
      { label: "wasm + WebGPU", what: "the same replay inside Chrome", fps: [283], p50: [3.3], kind: "web" },
    ],
  },
  {
    game: "Deepward",
    id: "deepward",
    verdict: "No gain. Both engines wait on the GPU, so a faster CPU side changes nothing.",
    rows: [
      { label: "Current engine", what: "TypeScript + three.js, desktop build", fps: [402, 292], p50: [2.1, 3.1], kind: "current" },
      { label: "Rust native", what: "+ real TS rules in V8 + Rune HUD", fps: [280, 288], p50: [3.42, 3.37], kind: "native" },
      { label: "Rust native", what: "+ rules ported to Rust + Rune HUD", fps: [300, 294], p50: [3.29, 3.35], kind: "native" },
      { label: "wasm + WebGPU", what: "the same replay inside Chrome", fps: [322], p50: [3.0], kind: "web" },
    ],
  },
];

/** The largest fps in the benchmark, the full length of a bar. */
export const BENCH_MAX_FPS = Math.max(...NATIVE_BENCH.flatMap((game) => game.rows.flatMap((row) => row.fps)));

/** Repository counts at release 0.57.0 (2026-11-12), from git, GitHub and npm. */
export const BUILT_IN_THE_OPEN: readonly { value: string; label: string }[] = [
  { value: "130", label: "days since the first commit" },
  { value: "4,912", label: "commits" },
  { value: "2,108", label: "merged pull requests" },
  { value: "66", label: "versions on npm" },
  { value: "2,015", label: "test files" },
  { value: "608k", label: "lines of TypeScript in packages/" },
];

export const COUNTS_AS_OF = "release 0.57.0, 12 November 2026";

/** What runs at each layer and in which language, top (your code) to bottom (where it ships). */
export const STACK: readonly { layer: string; runs: string; lang: "ts" | "js" | "wasm" | "mixed"; note: string }[] = [
  { layer: "Your game", runs: "rules, content, editor.scene.json", lang: "ts", note: "the part only you can write" },
  { layer: "Parts + features", runs: "@jgengine/core model files", lang: "ts", note: "no dependencies at all; a server imports them without UI or three.js" },
  { layer: "UI", runs: "engine JSX → Rune", lang: "wasm", note: "Rust UI compiled to wasm, drawn on the game canvas" },
  { layer: "3D", runs: "three.js on the engine's frame loop", lang: "js", note: "plain JavaScript; WebGL by default, WebGPU as a preview with GLSL → WGSL in wasm" },
  { layer: "Multiplayer", runs: "ws · socket.io · WebRTC · LAN · Convex · Node · Postgres", lang: "ts", note: "one protocol, swappable transports and hosts" },
  { layer: "Ships to", runs: "the browser · a Windows .exe · npm", lang: "mixed", note: "jgengine desktop wraps a game with Tauri" },
];
