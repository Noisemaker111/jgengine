import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useSyncExternalStore } from "react";

export const PROFILE_RING_SIZE = 120;

export const PROFILE_SECTION = {
  movementPlayer: "movement.player",
  movementPresence: "movement.presenceSync",
  worldStreetLight: "world.streetLight",
  worldGarageAtmosphere: "world.garageAtmosphere",
  worldGarageSconce: "world.garageSconce",
  buildPlacement: "build.placementPreview",
  agentAvatar: "agent.avatar",
  playerCharacter: "player.character",
  rackAnimation: "rack.animation",
  rackGpuPulse: "rack.gpuPulse",
  mapEditor: "mapEditor.tools",
  webglRender: "webgl.render",
  reactGameSession: "react.gameSession",
  reactGameOverlay: "react.gameOverlay",
  frameUnaccounted: "frame.unaccounted",
} as const;

export type ProfileSectionId = typeof PROFILE_SECTION[keyof typeof PROFILE_SECTION];

export interface PerformanceProfileOffender {
  id: ProfileSectionId | string;
  label: string;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  sharePct: number;
  callsPerFrame: number;
}

interface SectionAccumulator {
  ms: number;
  calls: number;
}

interface SectionRing {
  ms: number[];
  calls: number[];
  index: number;
  count: number;
}

const PROFILE_LABELS: Record<string, string> = {
  [PROFILE_SECTION.movementPlayer]: "Player movement",
  [PROFILE_SECTION.movementPresence]: "Presence sync (Convex)",
  [PROFILE_SECTION.worldStreetLight]: "Street lights",
  [PROFILE_SECTION.worldGarageAtmosphere]: "Garage atmosphere lights",
  [PROFILE_SECTION.worldGarageSconce]: "Garage sconces",
  [PROFILE_SECTION.buildPlacement]: "Build placement preview",
  [PROFILE_SECTION.agentAvatar]: "Remote avatars",
  [PROFILE_SECTION.playerCharacter]: "Player character",
  [PROFILE_SECTION.rackAnimation]: "Rack LED animation",
  [PROFILE_SECTION.rackGpuPulse]: "GPU rack pulse",
  [PROFILE_SECTION.mapEditor]: "Map editor tools",
  [PROFILE_SECTION.webglRender]: "WebGL render",
  [PROFILE_SECTION.reactGameSession]: "React GameSession",
  [PROFILE_SECTION.reactGameOverlay]: "React GameOverlay",
  [PROFILE_SECTION.frameUnaccounted]: "Unaccounted (not instrumented)",
};

const frameAccum = new Map<string, SectionAccumulator>();
const sectionRings = new Map<string, SectionRing>();
let offenders: PerformanceProfileOffender[] = [];
const profilingEnabled = true;
let frameDeltaMs = 0;
let frameOpen = false;
// Time recorded by immediate-commit sections (React renders) that landed in the
// gap between frames. This work still happens on the main thread and inflates the
// frame delta, so it must be subtracted from "unaccounted" rather than left there.
let immediateAccountedMs = 0;

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function getOrCreateRing(sectionId: string): SectionRing {
  const existing = sectionRings.get(sectionId);
  if (existing) return existing;
  const ring: SectionRing = { ms: [], calls: [], index: 0, count: 0 };
  sectionRings.set(sectionId, ring);
  return ring;
}

function percentile(sortedValues: readonly number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor(ratio * (sortedValues.length - 1))),
  );
  return sortedValues[index];
}

function pushRingSample(ring: SectionRing, ms: number, calls: number): void {
  if (ring.ms.length < PROFILE_RING_SIZE) {
    ring.ms.push(ms);
    ring.calls.push(calls);
    ring.count = ring.ms.length;
    return;
  }
  ring.ms[ring.index] = ms;
  ring.calls[ring.index] = calls;
  ring.index = (ring.index + 1) % PROFILE_RING_SIZE;
  ring.count = PROFILE_RING_SIZE;
}

function labelForSection(sectionId: string): string {
  return PROFILE_LABELS[sectionId] ?? sectionId;
}

function buildOffenders(frameMs: number): PerformanceProfileOffender[] {
  const rows: PerformanceProfileOffender[] = [];

  for (const [sectionId, ring] of sectionRings) {
    if (ring.count === 0) continue;
    const samples = ring.count === ring.ms.length
      ? ring.ms
      : [...ring.ms.slice(ring.index), ...ring.ms.slice(0, ring.index)];
    const callSamples = ring.count === ring.calls.length
      ? ring.calls
      : [...ring.calls.slice(ring.index), ...ring.calls.slice(0, ring.index)];

    const sorted = [...samples].sort((left, right) => left - right);
    let sum = 0;
    let maxMs = 0;
    let callSum = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const ms = samples[index];
      sum += ms;
      maxMs = Math.max(maxMs, ms);
      callSum += callSamples[index] ?? 0;
    }

    const avgMs = sum / samples.length;
    const p95Ms = percentile(sorted, 0.95);
    const callsPerFrame = callSum / samples.length;
    const sharePct = frameMs > 0 ? (avgMs / frameMs) * 100 : 0;

    rows.push({
      id: sectionId,
      label: labelForSection(sectionId),
      avgMs,
      p95Ms,
      maxMs,
      sharePct,
      callsPerFrame,
    });
  }

  rows.sort((left, right) => right.avgMs - left.avgMs);
  return rows;
}

export function beginProfilerFrame(deltaMs: number): void {
  if (!profilingEnabled) return;
  frameDeltaMs = deltaMs;
  frameOpen = true;
  frameAccum.clear();
}

function commitImmediateSection(sectionId: string, ms: number, calls: number): void {
  // Record the sample and its cost, but don't rebuild the offenders view here.
  // React commits fire 1-3x per frame; the view is only surfaced once per frame
  // by endProfilerFrame, so rebuilding + broadcasting per commit is wasted work.
  pushRingSample(getOrCreateRing(sectionId), ms, calls);
  immediateAccountedMs += ms;
}

export function recordProfileSection(sectionId: string, ms: number, calls = 1): void {
  if (!profilingEnabled || !Number.isFinite(ms) || ms < 0) return;

  if (!frameOpen) {
    if (sectionId.startsWith("react.")) {
      commitImmediateSection(sectionId, ms, calls);
    }
    return;
  }

  const current = frameAccum.get(sectionId) ?? { ms: 0, calls: 0 };
  current.ms += ms;
  current.calls += calls;
  frameAccum.set(sectionId, current);
}

export function endProfilerFrame(frameMs = frameDeltaMs): void {
  if (!profilingEnabled || !frameOpen) return;
  frameOpen = false;

  let accountedMs = 0;
  for (const [sectionId, sample] of frameAccum) {
    if (sectionId === PROFILE_SECTION.frameUnaccounted) continue;
    accountedMs += sample.ms;
    pushRingSample(getOrCreateRing(sectionId), sample.ms, sample.calls);
  }

  // Fold in React render work that committed in the gap before this frame; it is
  // already part of frameMs but lives outside the frame window.
  accountedMs += immediateAccountedMs;
  immediateAccountedMs = 0;

  const unaccountedMs = Math.max(0, frameMs - accountedMs);
  if (unaccountedMs > 0.05) {
    pushRingSample(getOrCreateRing(PROFILE_SECTION.frameUnaccounted), unaccountedMs, 1);
  }

  offenders = buildOffenders(frameMs);
  emitChange();
}

export function getPerformanceProfileOffenders(): readonly PerformanceProfileOffender[] {
  return offenders;
}

export function formatPerformanceProfileReport(
  offenderRows: readonly PerformanceProfileOffender[],
): string {
  if (offenderRows.length === 0) {
    return "[offenders]\nnone (collecting samples…)";
  }

  const lines = ["[offenders]"];
  for (const row of offenderRows) {
    const calls = row.callsPerFrame > 1.05 ? ` x${row.callsPerFrame.toFixed(1)}/frame` : "";
    lines.push(
      `${row.label}: avg ${row.avgMs.toFixed(2)}ms p95 ${row.p95Ms.toFixed(2)}ms max ${row.maxMs.toFixed(2)}ms (${row.sharePct.toFixed(1)}% frame)${calls}`,
    );
  }
  return lines.join("\n");
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePerformanceProfileOffenders(): readonly PerformanceProfileOffender[] {
  return useSyncExternalStore(subscribe, getPerformanceProfileOffenders, () => []);
}

type FrameCallback = Parameters<typeof useFrame>[0];
type FramePriority = Parameters<typeof useFrame>[1];

export function useProfiledFrame(
  sectionId: string,
  callback: FrameCallback,
  priority?: FramePriority,
): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useFrame((state, delta) => {
    const startedAt = performance.now();
    callbackRef.current(state, delta);
    recordProfileSection(sectionId, performance.now() - startedAt);
  }, priority);
}
