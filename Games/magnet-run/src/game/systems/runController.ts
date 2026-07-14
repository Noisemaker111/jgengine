import type { LevelSequence } from "@jgengine/core/game/levelSequence";
import type { SpawnPoints } from "@jgengine/core/game/spawnPoints";
import { defineStore } from "@jgengine/core/store/defineStore";

import { sectors as defaultSectors } from "../course/sectors";
import { speedTuningPerSector as defaultSpeedTuning } from "../course/speedTuning";
import { trainLines as defaultTrainLines } from "../course/trainLines";
import { sectorWorldStart } from "./constants";
import { gateAt, stripPolarityAt, type Lane, type SectorLayout } from "./course";
import { medalForTime } from "./medals";
import { opposite, resolveContact } from "./polarity";
import { resolveRepelLanding } from "./repel";
import {
  consumeSectorAttempt,
  createCourseCheckpoints,
  createSectorSequence,
  lastCheckpointFor,
  RETRIES_PER_SECTOR,
  sectorStartCheckpoint,
} from "./sectorController";
import { applyFeather, rampSpeed, type SpeedTuning } from "./speed";
import { createInitialRunState, type RunState, type SurfaceState } from "./runState";
import { isTrainOnTrack, trainRideZ, trainWindowAt, type TrainLineDef, type TrainLineId } from "./trains";

export interface RunControllerConfig {
  sectors: readonly SectorLayout[];
  speedTuning: readonly SpeedTuning[];
  trainLines: Record<TrainLineId, TrainLineDef>;
}

export function defaultRunControllerConfig(): RunControllerConfig {
  return { sectors: defaultSectors, speedTuning: defaultSpeedTuning, trainLines: defaultTrainLines };
}

const FLIP_FLASH_DURATION = 0.35;
const TOAST_DURATION = 3.2;

export interface HeldInput {
  boosting: boolean;
  braking: boolean;
}

function findGateCrossed(
  sector: SectorLayout,
  surfaceKind: "floor" | "ceiling",
  lane: Lane,
  fromZ: number,
  toZ: number,
) {
  for (const gate of sector.gates) {
    if (gate.surface !== surfaceKind || gate.lane !== lane) continue;
    if (gate.z >= fromZ && gate.z < toZ) return gate;
  }
  return null;
}

export class RunController {
  private state: RunState = createInitialRunState();
  private readonly levels: LevelSequence<SectorLayout>;
  private readonly checkpoints: SpawnPoints;
  private readonly sectors: readonly SectorLayout[];
  private readonly speedTuning: readonly SpeedTuning[];
  private readonly trainLines: Record<TrainLineId, TrainLineDef>;
  private readonly trainLineList: readonly TrainLineDef[];

  constructor(config: RunControllerConfig = defaultRunControllerConfig()) {
    this.sectors = config.sectors;
    this.speedTuning = config.speedTuning;
    this.trainLines = config.trainLines;
    this.trainLineList = Object.values(config.trainLines);
    this.levels = createSectorSequence(this.sectors);
    this.checkpoints = createCourseCheckpoints(this.sectors);
  }

  snapshot(): RunState {
    return this.state;
  }

  retriesRemaining(): number {
    return Math.max(0, RETRIES_PER_SECTOR + 1 - this.state.crashesInSector);
  }

  private pushToast(text: string): void {
    const id = this.state.toastSeq + 1;
    this.state = {
      ...this.state,
      toastSeq: id,
      toasts: [
        ...this.state.toasts.filter((toast) => toast.expiresAt > this.state.totalElapsed),
        { id, text, expiresAt: this.state.totalElapsed + TOAST_DURATION },
      ].slice(-4),
    };
  }

  start(): void {
    this.levels.reset();
    this.levels.start();
    this.state = { ...createInitialRunState(), phase: "running" };
  }

  moveLane(delta: -1 | 1): void {
    if (this.state.phase !== "running") return;
    const next = Math.min(2, Math.max(0, this.state.lane + delta)) as Lane;
    this.state = { ...this.state, lane: next };
  }

  flip(): void {
    if (this.state.phase !== "running") return;
    const polarity = opposite(this.state.polarity);
    this.state = { ...this.state, polarity, flipFlashUntil: this.state.totalElapsed + FLIP_FLASH_DURATION };
    this.pushToast(`POLARITY: ${polarity === "red" ? "+" : "−"}`);
    if (this.state.surface.kind === "train") {
      const line = this.trainLines[this.state.surface.line];
      if (resolveContact(polarity, line.roofPolarity) === "repel") this.exitTrainToFreefall();
    }
  }

  restartSector(): void {
    if (this.state.phase !== "running") return;
    const outcome = consumeSectorAttempt(this.levels);
    this.state = { ...this.state, crashesInSector: this.state.crashesInSector + 1, totalCrashes: this.state.totalCrashes + 1, lastCause: "manual restart" };
    if (outcome === "failed") {
      this.state = { ...this.state, phase: "lost", loseSectorIndex: this.state.sectorIndex, loseCause: "manual restart" };
      return;
    }
    const sector = this.sectors[this.state.sectorIndex]!;
    this.respawnAt(sectorStartCheckpoint(sector).id);
    this.pushToast("SECTOR RESTARTED");
  }

  continueAfterClear(): void {
    if (this.state.phase !== "sectorClear") return;
    const advanced = this.levels.advance();
    if (!advanced) return;
    if (this.levels.status() === "complete") {
      this.state = { ...this.state, phase: "won", medal: medalForTime(this.state.totalElapsed) };
      return;
    }
    const current = this.levels.current();
    if (current === null) return;
    this.state = {
      ...this.state,
      sectorIndex: current.index,
      crashesInSector: 0,
      polarity: "red",
      phase: "running",
    };
    this.respawnAt(sectorStartCheckpoint(this.sectors[current.index]!).id);
  }

  private respawnAt(checkpointId: string): void {
    const point = this.checkpoints.get(checkpointId);
    const z = point?.z ?? 0;
    this.state = {
      ...this.state,
      z,
      lane: 1,
      surface: { kind: "floor" },
      elapsedSinceRespawn: 0,
    };
  }

  private crash(cause: string): void {
    const outcome = consumeSectorAttempt(this.levels);
    this.state = { ...this.state, crashesInSector: this.state.crashesInSector + 1, totalCrashes: this.state.totalCrashes + 1, lastCause: cause };
    if (outcome === "failed") {
      this.state = { ...this.state, phase: "lost", loseSectorIndex: this.state.sectorIndex, loseCause: cause };
      return;
    }
    const sector = this.sectors[this.state.sectorIndex]!;
    const checkpoint = lastCheckpointFor(sector, this.state.z);
    this.respawnAt(checkpoint.id);
    this.pushToast(`CRASH — ${cause.toUpperCase()}`);
  }

  private clearSector(): void {
    this.levels.clear();
    const sector = this.sectors[this.state.sectorIndex]!;
    this.state = {
      ...this.state,
      phase: "sectorClear",
      sectorTimes: [...this.state.sectorTimes, this.state.totalElapsed],
      surface: { kind: "floor" },
    };
    this.pushToast(`${sector.label} CLEAR`);
  }

  private exitTrainToFreefall(): void {
    const sector = this.sectors[this.state.sectorIndex]!;
    const stripPol = stripPolarityAt(sector.strips, "floor", this.state.lane, this.state.z);
    if (stripPol === null) {
      this.crash("no floor under the train");
      return;
    }
    const contact = resolveContact(this.state.polarity, stripPol);
    if (contact === "hold") {
      this.state = { ...this.state, surface: { kind: "floor" } };
      return;
    }
    const landing = resolveRepelLanding(sector.strips, "floor", this.state.lane, this.state.z, this.state.polarity);
    if (landing.landed === "opposite-surface") {
      this.state = { ...this.state, surface: { kind: landing.surface } };
    } else {
      this.crash("shaken off the train with no landing");
    }
  }

  private tryBoardTrain(simTimeNow: number): boolean {
    const worldZ = sectorWorldStart(this.state.sectorIndex) + this.state.z;
    for (const line of this.trainLineList) {
      if (line.lane !== this.state.lane) continue;
      const window = trainWindowAt(line, simTimeNow);
      if (!isTrainOnTrack(line, window)) continue;
      if (worldZ < window.tailZ - 0.6 || worldZ > window.headZ + 0.6) continue;
      if (resolveContact(this.state.polarity, line.roofPolarity) !== "hold") continue;
      const surface: SurfaceState = { kind: "train", line: line.id, boardedOffset: worldZ - window.headZ };
      this.state = { ...this.state, surface };
      this.pushToast(`BOARDED ${line.displayName}`);
      return true;
    }
    return false;
  }

  private tickTrainRide(dt: number, simTimeNow: number): void {
    void dt;
    const surface = this.state.surface;
    if (surface.kind !== "train") return;
    const line = this.trainLines[surface.line];
    if (resolveContact(this.state.polarity, line.roofPolarity) === "repel") {
      this.exitTrainToFreefall();
      return;
    }
    const window = trainWindowAt(line, simTimeNow);
    const worldZ = trainRideZ(line, simTimeNow, surface.boardedOffset);
    if (!isTrainOnTrack(line, window) || worldZ < window.tailZ - 0.05 || worldZ > window.headZ + 0.05) {
      this.exitTrainToFreefall();
      return;
    }
    const sector = this.sectors[this.state.sectorIndex]!;
    const z = worldZ - sectorWorldStart(this.state.sectorIndex);
    this.state = { ...this.state, z, speed: line.speed };
    if (this.state.z >= sector.length) this.clearSector();
  }

  tick(dt: number, held: HeldInput, simTimeNow: number): void {
    if (this.state.phase !== "running") return;
    this.state = { ...this.state, totalElapsed: this.state.totalElapsed + dt, elapsedSinceRespawn: this.state.elapsedSinceRespawn + dt };

    const surfaceKind = this.state.surface.kind;
    if (surfaceKind === "train") {
      this.tickTrainRide(dt, simTimeNow);
      return;
    }

    const sector = this.sectors[this.state.sectorIndex]!;
    const tuning = this.speedTuning[this.state.sectorIndex]!;
    const rawSpeed = rampSpeed(this.state.elapsedSinceRespawn, tuning);
    const speed = applyFeather(rawSpeed, tuning, held.boosting, held.braking);
    const prevZ = this.state.z;
    const nextZ = prevZ + speed * dt;
    this.state = { ...this.state, speed, z: nextZ };

    const crossedGate = findGateCrossed(sector, surfaceKind, this.state.lane, prevZ, nextZ);
    if (crossedGate !== null && crossedGate.requires !== this.state.polarity) {
      this.crash(`gate requires ${crossedGate.requires}`);
      return;
    }

    if (this.state.z >= sector.length) {
      this.clearSector();
      return;
    }

    const stripPol = stripPolarityAt(sector.strips, surfaceKind, this.state.lane, this.state.z);
    if (stripPol === null) {
      if (!this.tryBoardTrain(simTimeNow)) this.crash("fell through a strip gap");
      return;
    }
    const contact = resolveContact(this.state.polarity, stripPol);
    if (contact === "repel") {
      const landing = resolveRepelLanding(sector.strips, surfaceKind, this.state.lane, this.state.z, this.state.polarity);
      if (landing.landed === "opposite-surface") {
        this.state = { ...this.state, surface: { kind: landing.surface } };
        this.pushToast(`REPELLED — SNAPPED TO ${landing.surface.toUpperCase()}`);
      } else {
        this.crash("repelled with nowhere to land");
      }
    }
  }
}

export const controllerStore = defineStore<RunController | undefined>("controller", undefined);

