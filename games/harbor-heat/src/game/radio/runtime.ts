import { createRadio, type Radio, type RadioBulletin } from "@jgengine/core/audio/radio";
import { createRadioPlayback, type RadioPlayback } from "@jgengine/core/audio/radioPlayback";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { cityOf } from "../cityRuntime";
import { startedStore } from "../commands";
import { handrollOf, raceStore } from "../handroll";
import { vehicleById } from "../entities/vehicles/catalog";
import { bulletinForLog, bulletinForRace, bulletinForWanted } from "./bulletins";
import { HARBOR_RADIO, RADIO_VOICES } from "./stations";

/** The radio bus every station mixes through; the settings app shows it as "Radio volume". */
export const RADIO_BUS = "radio";

/** What the in-car readout shows; null while the radio is off. */
export interface RadioReadout {
  frequency: string;
  station: string;
  kind: "music" | "talk" | "news";
  title: string;
  artist: string | null;
  line: string | null;
  bulletin: boolean;
}

/** The HUD's view of the radio, written whenever what it shows changes. */
export const radioStore = defineStore<RadioReadout | null>("harbor.radio", null);

interface RadioRuntime {
  radio: Radio;
  playback: RadioPlayback;
  logAt: number;
  logSeen: Set<string>;
  logReady: boolean;
  stars: number;
  raceSeen: boolean;
  duck: number;
  last: RadioBulletin | null;
}

const runtimes = perContext((ctx: GameContext): RadioRuntime => {
  const radio = createRadio(HARBOR_RADIO);
  radio.power(false);
  radio.tick(0);
  return {
    radio,
    playback: createRadioPlayback(radio, ctx.game.audio, { voices: RADIO_VOICES }),
    logAt: -1,
    logSeen: new Set(),
    logReady: false,
    stars: 0,
    raceSeen: false,
    duck: 0,
    last: null,
  };
});

/** The radio for this context. */
export function radioOf(ctx: GameContext): Radio {
  return runtimes(ctx).radio;
}

function live(ctx: GameContext): boolean {
  return startedStore.read(ctx) === true && gamePhase(ctx) === "playing";
}

function placeName(ctx: GameContext, id: string | null): string | null {
  if (id === null) return null;
  return cityOf(ctx).def.places?.[id]?.label ?? null;
}

function playerPlace(ctx: GameContext): string | null {
  const id = handrollOf(ctx).drivingVehicleId() ?? ctx.player.userId;
  const at = ctx.scene.entity.get(id)?.position;
  return at === undefined ? null : placeName(ctx, cityOf(ctx).placeAt(at[0], at[2]));
}

function report(runtime: RadioRuntime, bulletin: RadioBulletin | null): void {
  if (bulletin === null) return;
  if (runtime.radio.report(bulletin)) runtime.last = bulletin;
}

/** New city log lines since the last tick, each at most once; the history from before boot stays unread. */
function feedLog(ctx: GameContext, runtime: RadioRuntime): void {
  const log = cityOf(ctx).log();
  const key = (entry: { at: number; kind: string; text: string }) => `${entry.kind}|${entry.text}`;
  if (!runtime.logReady) {
    runtime.logReady = true;
    const tail = log[log.length - 1];
    runtime.logAt = tail?.at ?? -1;
    for (const entry of log) if (entry.at === runtime.logAt) runtime.logSeen.add(key(entry));
    return;
  }
  for (const entry of log) {
    if (entry.at < runtime.logAt) continue;
    if (entry.at === runtime.logAt && runtime.logSeen.has(key(entry))) continue;
    if (entry.at > runtime.logAt) {
      runtime.logAt = entry.at;
      runtime.logSeen.clear();
    }
    runtime.logSeen.add(key(entry));
    report(runtime, bulletinForLog(entry, placeName(ctx, entry.place)));
  }
}

function feedWanted(ctx: GameContext, runtime: RadioRuntime): void {
  const stars = handrollOf(ctx).wanted().stars;
  if (stars === runtime.stars) return;
  report(runtime, bulletinForWanted(runtime.stars, stars, playerPlace(ctx)));
  runtime.stars = stars;
}

function feedRace(ctx: GameContext, runtime: RadioRuntime): void {
  const race = raceStore.peek(ctx);
  const done = race !== undefined && race.finished;
  if (done && !runtime.raceSeen && race.won) report(runtime, bulletinForRace(race.label, race.timeSec));
  runtime.raceSeen = done;
}

/** The radio sits a little under a car at speed, the way a real one fights road and engine noise. */
function duckUnderRoad(ctx: GameContext, runtime: RadioRuntime, driving: boolean): void {
  const kmh = driving ? handrollOf(ctx).carSpeedKmh() : 0;
  const target = Math.round(Math.min(0.35, (kmh / 200) * 0.35) * 20) / 20;
  if (target === runtime.duck) return;
  runtime.duck = target;
  ctx.game.audio.duck("radio.road", RADIO_BUS, target);
}

function publish(ctx: GameContext, radio: Radio): void {
  const now = radio.nowPlaying();
  const next: RadioReadout | null = now === null ? null : {
    frequency: now.station.frequency,
    station: now.station.name,
    kind: now.station.kind,
    title: now.segment.title,
    artist: now.segment.artist,
    line: now.line,
    bulletin: now.segment.kind === "bulletin",
  };
  const current = radioStore.read(ctx);
  if (JSON.stringify(current) !== JSON.stringify(next)) radioStore.write(ctx, next);
}

/**
 * Radio only plays from a driver's seat: getting in powers it on to the last station, getting out
 * powers it off, and the broadcast keeps running underneath either way. Pausing silences it.
 */
export function tickRadio(ctx: GameContext, dt: number): void {
  const runtime = runtimes(ctx);
  if (!live(ctx)) {
    runtime.playback.pause();
    return;
  }
  runtime.playback.resume();
  const driving = handrollOf(ctx).drivingVehicleId() !== null;
  runtime.radio.power(driving);
  feedLog(ctx, runtime);
  feedWanted(ctx, runtime);
  feedRace(ctx, runtime);
  duckUnderRoad(ctx, runtime, driving);
  runtime.playback.tick(dt);
  publish(ctx, runtime.radio);
}

export function registerRadio(ctx: GameContext): void {
  const runtime = runtimes(ctx);
  ctx.game.commands.define<{ direction?: 1 | -1 }>("radio", {
    validate(state) {
      return handrollOf(state).drivingVehicleId() === null ? { reason: "on-foot", message: "The radio is in the car." } : null;
    },
    apply(state, input) {
      radioOf(state).step(input?.direction ?? 1);
      publish(state, radioOf(state));
    },
  });
  // Phase changes (pause, settings, a result screen) land between ticks; silence the radio right away.
  ctx.subscribe(() => {
    if (!live(ctx)) runtime.playback.pause();
  });
  (globalThis as { __harborRadio?: unknown }).__harborRadio = {
    read() {
      const radio = runtime.radio;
      const audio = (globalThis as { __jgengineAudio?: { speech?: () => unknown; busLevel?: (bus: string) => number; measure?: () => unknown } }).__jgengineAudio;
      return {
        powered: radio.powered(),
        vehicle: handrollOf(ctx).drivingVehicleId(),
        dial: radio.dial(),
        paused: runtime.playback.paused(),
        nowPlaying: radio.nowPlaying(),
        stations: Object.fromEntries(radio.stations().map((station) => [station.id, { ...radio.station(station.id)?.segment, queued: radio.queued(station.id) }])),
        lastBulletin: runtime.last === null ? null : { topic: runtime.last.topic, priority: runtime.last.priority ?? 1, lines: runtime.last.lines },
        spoken: runtime.playback.spoken(),
        duck: runtime.duck,
        speech: audio?.speech?.() ?? null,
        radioBus: audio?.busLevel?.(RADIO_BUS) ?? null,
        level: audio?.measure?.() ?? null,
      };
    },
    next: () => ctx.game.commands.run("radio", {}).status,
    /** Dev: take the nearest parked car, as pressing E beside it would, so a capture can reach the driver's seat. */
    enterNearestCar() {
      const me = ctx.scene.entity.get(ctx.player.userId);
      if (me === null) return "no-player";
      const car = ctx.scene.entity
        .list()
        .filter((entity) => vehicleById(entity.name) !== undefined && !entity.id.startsWith("cruiser_"))
        .sort((a, b) => Math.hypot(a.position[0] - me.position[0], a.position[2] - me.position[2]) - Math.hypot(b.position[0] - me.position[0], b.position[2] - me.position[2]))[0];
      return car === undefined ? "no-car" : ctx.game.commands.run("vehicle.enter", { vehicle: car.id }).status;
    },
  };
}
