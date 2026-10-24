/**
 * The `--quick` iteration preset for `bun run shoot` and `bun run drive`: one settled frame at
 * 960x540 (a 2s settle window in drive), no video, no perf pass. A lane iterating on a HUD layout
 * pays ~1/3 the pixels of a 1600x900 capture instead of a full-resolution GPU capture per try.
 *
 * It is parsed by the two scripts themselves, like `--headed`, because it is an engine-only
 * convenience and not part of the shared `CAPTURE_FLAGS` table. It is also deliberately loud about
 * what it cannot prove: a quick frame is never evidence for a 1600x900 pixel claim or a frame-time
 * claim, so asking for one alongside `--quick` fails instead of producing weaker evidence.
 */

export type CaptureTool = "shoot" | "drive";

export const QUICK_WIDTH = 960;
export const QUICK_HEIGHT = 540;

/** Bound on drive's wait for a settled game view in quick mode; full drives wait up to 60s. */
export const QUICK_DRIVE_WINDOW_MS = 2_000;

/** The limits a quick frame carries, stated on the line the tool prints. */
export const QUICK_NOTICE = "no 1600x900 pixel claim, no frame-time claim";

/** Strip `--quick` from argv (the shared parser does not know it) and report whether it was there. */
export function splitQuickFlag(tool: CaptureTool, argv: readonly string[]): { quick: boolean; argv: string[] } {
  const quick = argv.includes("--quick");
  return { quick, argv: argv.filter((arg) => arg !== "--quick") };
}

/** Filename suffix, so a quick PNG never passes for the full shot it stands in for. */
export function quickSuffix(quick: boolean): string {
  return quick ? "-quick" : "";
}

/** Viewport override the preset applies; undefined keys leave the device profile alone. */
export function quickProfile(quick: boolean): { width?: number; height?: number } {
  return quick ? { width: QUICK_WIDTH, height: QUICK_HEIGHT } : {};
}

export interface QuickRequest {
  tool: CaptureTool;
  quick: boolean;
  /** Flags the command line asked for, whether or not the preset would override them. */
  width?: number;
  height?: number;
  size?: string;
  device?: string;
  playtest?: boolean;
  record?: string;
  recordRealtime?: boolean;
  recordFps?: number;
  recordWidth?: number;
}

/**
 * The claim a quick run cannot support, named with the flag that asked for it. Returns the message
 * to throw, or null when the request is a plain iteration capture.
 */
export function quickMisuse(request: QuickRequest): string | null {
  if (!request.quick) return null;
  const prefix = `${request.tool}: --quick is the ${QUICK_WIDTH}x${QUICK_HEIGHT} iteration preset, so`;
  const tail = "Drop it for the full capture, or drop --quick.";
  const asked: string[] = [];
  if (request.width !== undefined && request.width !== QUICK_WIDTH) asked.push(`--width ${request.width}`);
  if (request.height !== undefined && request.height !== QUICK_HEIGHT) asked.push(`--height ${request.height}`);
  if (asked.length > 0) {
    return `${prefix} ${asked.join(" and ")} cannot ride along — a pixel claim at that size needs the full capture. ${tail}`;
  }
  if (request.size !== undefined) {
    return `${prefix} --size ${request.size} cannot ride along — the preset owns the viewport, and a full-size pixel claim needs the full capture. ${tail}`;
  }
  if (request.device !== undefined && request.device !== "desktop") {
    return `${prefix} --device ${request.device} cannot ride along — quick is the desktop preset. ${tail}`;
  }
  if (request.playtest === true) {
    return `${request.tool}: --quick cannot produce a perf number, and --playtest measures frame cadence. Drop --playtest (bun run perf is the perf path), or drop --quick for a real frame-time claim.`;
  }
  const recording = [
    request.record === undefined ? undefined : "--record",
    request.recordRealtime === true ? "--record-realtime" : undefined,
    request.recordFps === undefined ? undefined : "--record-fps",
    request.recordWidth === undefined ? undefined : "--record-width",
  ].filter((flag): flag is string => flag !== undefined);
  if (recording.length > 0) {
    return `${request.tool}: --quick takes no video, so ${recording.join(" and ")} cannot ride along. Drop it (quick captures one settled frame), or drop --quick and record the full drive.`;
  }
  return null;
}

/** Throw {@link quickMisuse} when a quick run was asked for something it cannot prove. */
export function assertQuickIsIterationOnly(request: QuickRequest): void {
  const misuse = quickMisuse(request);
  if (misuse !== null) throw new Error(misuse);
}

/**
 * The line a quick capture prints: the wall time it cost and the claims it does not support, on
 * the same line, so a lane reading the log cannot mistake the frame for evidence. Phases stay in
 * the line so the cheaper capture is a number, not a claim.
 */
export function quickTimingLine(
  tool: CaptureTool,
  args: { seconds: number; width: number; height: number; device?: string; phases?: readonly string[]; tier?: string | null },
): string {
  const device = args.device === undefined || args.device === "desktop" ? "" : ` ${args.device}`;
  const phases = args.phases === undefined || args.phases.length === 0 ? "" : ` ${args.phases.join(" ")}`;
  const tier = ` tier ${args.tier ?? "n/a"}`;
  return `${tool}: quick${device} ${args.width}x${args.height}${tier}${phases} total=${args.seconds.toFixed(2)}s — iteration only: ${QUICK_NOTICE}; re-run without --quick for the shot that goes in the PR`;
}
