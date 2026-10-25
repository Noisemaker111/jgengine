import { randomSeedFrom, stepRandomSeed, hashString, type RandomSeed } from "../random/rng";

/** What a station mostly broadcasts; a HUD can style or group stations by it. */
export type RadioStationKind = "music" | "talk" | "news";

/** One kind of programme segment. `bulletin` is reserved for segments the radio builds from reported game events. */
export type RadioSegmentKind = "song" | "dj" | "ad" | "talk" | "news" | "jingle" | "bulletin";

/** A spoken line inside a segment. A bare string in a definition is a line in the station's default voice. */
export interface RadioLineDef {
  text: string;
  /** Voice id the playback maps to a speech voice (a DJ, a caller, an ad announcer). Default: the segment's or station's voice. */
  voice?: string;
  /** Seconds into the segment the line starts. Default: right after the previous line. */
  at?: number;
}

/** An authored programme segment: a song (a music theme id), a DJ link, an ad, a talk bit or a news item. */
export interface RadioSegmentDef {
  id: string;
  kind: Exclude<RadioSegmentKind, "bulletin">;
  /** Title shown on the HUD ("Neon Tidewater", "Carmine Gold Pawn - ad"). */
  title: string;
  /** Artist or host credit shown under the title. */
  artist?: string;
  /** Segment length in seconds. Default: long enough for its lines, or 30 s with none. */
  seconds?: number;
  /** Music theme id played while the segment is on air: the song itself, or a bed under talk. */
  theme?: string;
  /** Semitones the theme is shifted for this segment. */
  transpose?: number;
  /** Default voice for this segment's lines. */
  voice?: string;
  lines?: readonly (string | RadioLineDef)[];
}

/** How a station reads bulletins the game reports. */
export interface RadioBulletinPolicy {
  /** Lines one of which is said before every bulletin ("This just in."). */
  intro?: readonly string[];
  /** Lines one of which is said after every bulletin. */
  outro?: readonly string[];
  /** Voice the bulletin is read in. Default: the station's voice. */
  voice?: string;
  /** HUD title of a bulletin segment. Default "News". */
  title?: string;
  /** A bulletin at or above this priority cuts the current segment off. Default: never. */
  breakIn?: number;
  /** Theme played under bulletins (a news sting bed). */
  theme?: string;
  /** Most bulletins waiting on this station; the lowest priority is dropped past it. Default 4. */
  maxQueue?: number;
}

/** One station on the dial. */
export interface RadioStationDef {
  id: string;
  name: string;
  /** Dial label ("94.7 FM"). */
  frequency: string;
  kind: RadioStationKind;
  /** Default voice for every spoken line on this station. */
  voice?: string;
  /** Theme played under segments that name none (a talk-show bed). Default: silence. */
  bed?: string;
  segments: readonly RadioSegmentDef[];
  /**
   * Running order by segment kind, repeated forever; each step plays the next segment of that kind
   * from a shuffled deck. Default: every authored segment once per cycle in shuffled order.
   */
  pattern?: readonly Exclude<RadioSegmentKind, "bulletin">[];
  /** Bulletin handling; `false` means this station never reads game news. Default: reads them at the next segment boundary. */
  bulletins?: RadioBulletinPolicy | false;
}

/** Timing knobs a game may retune during play. */
export interface RadioTiming {
  /** Speaking speed used to estimate how long a line takes. Default 2.6 words per second. */
  wordsPerSecond?: number;
  /** Silence between consecutive lines in seconds. Default 0.5. */
  lineGap?: number;
  /** Seconds a queued bulletin stays news before it is dropped unread. Default 240. */
  bulletinTtl?: number;
}

/** A whole radio: its dial and how it times speech. */
export interface RadioDef extends RadioTiming {
  stations: readonly RadioStationDef[];
  /** Seed for the shuffled running orders. Default "radio". */
  seed?: string | number;
  /** Station tuned in at creation. Default: the first. */
  initial?: string;
}

/** A game event the radio should talk about ("shots fired in Port Carmine"). */
export interface RadioBulletin {
  /** Topic key that cooldowns are tracked by ("shots", "wanted-5", "turf"). */
  topic: string;
  /** Higher plays first and may break in. Default 1. */
  priority?: number;
  /** HUD title for this bulletin. Default: the station's bulletin title. */
  title?: string;
  /** What any accepting station says. */
  lines: readonly string[];
  /** Per-station wording (a DJ jokes, the news desk reads it straight); stations not listed use `lines`. */
  byStation?: Readonly<Record<string, readonly string[]>>;
  /** Stations that hear it. Default: every station that reads bulletins. */
  stations?: readonly string[];
  /** Seconds before another bulletin on the same topic is accepted. Default 60. */
  cooldown?: number;
  /** Seconds this bulletin stays news. Default: the radio's `bulletinTtl`. */
  ttl?: number;
}

/** A line as scheduled inside a resolved segment. */
export interface RadioLine {
  text: string;
  voice: string | null;
  /** Seconds into the segment it starts. */
  at: number;
  /** Estimated seconds it takes to say. */
  seconds: number;
}

/** A segment resolved for air: lengths fixed, lines timed. Plain data, so it snapshots. */
export interface RadioSegment {
  id: string;
  kind: RadioSegmentKind;
  title: string;
  artist: string | null;
  seconds: number;
  theme: string | null;
  transpose: number;
  lines: readonly RadioLine[];
  /** The bulletin topic, for a bulletin segment. */
  topic: string | null;
}

/** Something the playback should do now for the station being listened to. */
export type RadioCue =
  /** A segment went on air (or the listener tuned in mid-segment): start its theme `offset` seconds in. */
  | { kind: "segment"; station: string; segment: RadioSegment; offset: number }
  /** A line started: speak it. */
  | { kind: "line"; station: string; segment: RadioSegment; line: RadioLine }
  /** The radio went silent (powered off). */
  | { kind: "off" };

/** HUD view of a station's programme. */
export interface RadioNowPlaying {
  station: { id: string; name: string; frequency: string; kind: RadioStationKind };
  segment: { id: string; kind: RadioSegmentKind; title: string; artist: string | null };
  elapsed: number;
  seconds: number;
  /** The line being said, held a moment after it ends; null between lines and during songs. */
  line: string | null;
  /** Voice of {@link line}. */
  voice: string | null;
}

interface QueuedBulletin {
  topic: string;
  priority: number;
  title: string | null;
  lines: readonly string[];
  age: number;
  ttl: number;
  order: number;
}

interface Deck {
  order: number[];
  pos: number;
}

interface StationState {
  segment: RadioSegment;
  elapsed: number;
  step: number;
  decks: Record<string, Deck>;
  queue: QueuedBulletin[];
}

/** Serializable radio state: every station's place in its programme, the queues, cooldowns and the dial. */
export interface RadioSnapshot {
  clock: number;
  seed: number;
  powered: boolean;
  tuned: string | null;
  order: number;
  cooldowns: Record<string, number>;
  stations: Record<string, StationState>;
}

/** A radio with a running broadcast. */
export interface Radio {
  /** Advance every station's clock by `dt` seconds and return what the tuned station's playback should do. */
  tick(dt: number): RadioCue[];
  /** Tune to a station (it powers the radio on). Unknown ids are ignored. */
  tune(stationId: string): void;
  /** Next or previous station on the dial, wrapping. Powers the radio on. */
  step(direction: 1 | -1): string;
  /** Power off keeps the station, power on returns to it. */
  power(on: boolean): void;
  powered(): boolean;
  /** Station being listened to, or null while off. */
  tuned(): string | null;
  /** Station the dial is on, even while off. */
  dial(): string;
  /** Re-announce the tuned station's current segment at its offset (after a pause or a reload). */
  cueCurrent(): void;
  /** Queue a bulletin on every accepting station. Returns false while its topic is cooling down. */
  report(bulletin: RadioBulletin): boolean;
  /** Seconds until `topic` accepts another bulletin. */
  cooldown(topic: string): number;
  /** What the tuned station is playing, or null while off. */
  nowPlaying(): RadioNowPlaying | null;
  /** What any station is playing, tuned or not. */
  station(stationId: string): RadioNowPlaying | null;
  /** Bulletins waiting on a station. */
  queued(stationId: string): number;
  stations(): readonly { id: string; name: string; frequency: string; kind: RadioStationKind }[];
  retune(timing: RadioTiming): void;
  snapshot(): RadioSnapshot;
  restore(snapshot: RadioSnapshot): void;
}

const MAX_ADVANCES_PER_TICK = 64;
const LINE_HOLD = 1.2;
const DEFAULT_SONG_SECONDS = 30;

/** Seconds a line takes to say at `wordsPerSecond`, with a short floor so one-word stings still register. */
export function estimateSpeechSeconds(text: string, wordsPerSecond = 2.6): number {
  const words = text.trim().split(/\s+/).filter((word) => word.length > 0).length;
  return Math.max(0.8, words / Math.max(0.5, wordsPerSecond));
}

/**
 * A pure, serializable radio: stations with their own running order of songs, DJ links, ads, talk
 * bits and news, all broadcasting on one clock whether or not anyone listens, so tuning back lands
 * mid-programme. Game events reported with {@link Radio.report} queue bulletins with priority,
 * per-topic cooldown and expiry; a high enough priority breaks into the current segment. `tick`
 * returns cues (segment on air, line started, off) that a playback seam turns into music and speech;
 * nothing here touches audio, so it runs headless and in tests.
 *
 * @capability radio-stations in-vehicle radio: stations that keep broadcasting while untuned, a dial with next/previous/off, a now-playing readout, and news/DJ bulletins fed by game events with priority, cooldown and break-in
 */
export function createRadio(def: RadioDef): Radio {
  if (def.stations.length === 0) throw new Error("createRadio: a radio needs at least one station");
  const byId = new Map<string, RadioStationDef>();
  for (const station of def.stations) {
    if (byId.has(station.id)) throw new Error(`createRadio: duplicate station id "${station.id}"`);
    if (station.segments.length === 0) throw new Error(`createRadio: station "${station.id}" has no segments`);
    byId.set(station.id, station);
  }
  const ids = def.stations.map((station) => station.id);
  const timing = {
    wordsPerSecond: def.wordsPerSecond ?? 2.6,
    lineGap: def.lineGap ?? 0.5,
    bulletinTtl: def.bulletinTtl ?? 240,
  };

  let seed: RandomSeed = randomSeedFrom(typeof def.seed === "number" ? def.seed : hashString(def.seed ?? "radio"));
  let clock = 0;
  let powered = true;
  let dialAt = def.initial !== undefined && byId.has(def.initial) ? def.initial : ids[0]!;
  let order = 0;
  let cooldowns: Record<string, number> = {};
  let states: Record<string, StationState> = {};
  let pending: RadioCue[] = [];

  function random(): number {
    const [value, next] = stepRandomSeed(seed);
    seed = next;
    return value;
  }

  function timeLines(lines: readonly (string | RadioLineDef)[], fallbackVoice: string | null): { lines: RadioLine[]; end: number } {
    const out: RadioLine[] = [];
    let cursor = 0;
    for (const raw of lines) {
      const line = typeof raw === "string" ? { text: raw } : raw;
      const at = line.at ?? cursor;
      const seconds = estimateSpeechSeconds(line.text, timing.wordsPerSecond);
      out.push({ text: line.text, voice: line.voice ?? fallbackVoice, at, seconds });
      cursor = at + seconds + timing.lineGap;
    }
    return { lines: out, end: out.length === 0 ? 0 : cursor };
  }

  function resolve(station: RadioStationDef, segment: RadioSegmentDef): RadioSegment {
    const { lines, end } = timeLines(segment.lines ?? [], segment.voice ?? station.voice ?? null);
    const seconds = Math.max(segment.seconds ?? (lines.length === 0 ? DEFAULT_SONG_SECONDS : 0), end, 1);
    return {
      id: segment.id,
      kind: segment.kind,
      title: segment.title,
      artist: segment.artist ?? null,
      seconds,
      theme: segment.theme ?? station.bed ?? null,
      transpose: segment.transpose ?? 0,
      lines,
      topic: null,
    };
  }

  function shuffled(indices: number[], avoidFirst: number | undefined): number[] {
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [indices[i], indices[j]] = [indices[j]!, indices[i]!];
    }
    if (avoidFirst !== undefined && indices.length > 1 && indices[0] === avoidFirst) {
      [indices[0], indices[1]] = [indices[1]!, indices[0]!];
    }
    return indices;
  }

  function draw(station: RadioStationDef, state: StationState, kind: string): RadioSegmentDef | null {
    const indices: number[] = [];
    station.segments.forEach((segment, index) => {
      if (kind === "*" || segment.kind === kind) indices.push(index);
    });
    if (indices.length === 0) return null;
    let deck = state.decks[kind];
    if (deck === undefined || deck.pos >= deck.order.length || deck.order.length !== indices.length) {
      const last = deck !== undefined && deck.pos > 0 ? deck.order[deck.pos - 1] : undefined;
      deck = { order: shuffled(indices, last), pos: 0 };
      state.decks[kind] = deck;
    }
    const index = deck.order[deck.pos]!;
    deck.pos += 1;
    return station.segments[index] ?? null;
  }

  function takeBulletin(station: RadioStationDef, state: StationState): RadioSegment | null {
    if (state.queue.length === 0 || station.bulletins === false) return null;
    let best = 0;
    for (let i = 1; i < state.queue.length; i++) {
      const candidate = state.queue[i]!;
      const current = state.queue[best]!;
      if (candidate.priority > current.priority || (candidate.priority === current.priority && candidate.order < current.order)) best = i;
    }
    const bulletin = state.queue.splice(best, 1)[0]!;
    const policy = station.bulletins ?? {};
    const pick = (options: readonly string[] | undefined): string[] =>
      options === undefined || options.length === 0 ? [] : [options[Math.floor(random() * options.length)]!];
    const voice = policy.voice ?? station.voice ?? null;
    const { lines, end } = timeLines([...pick(policy.intro), ...bulletin.lines, ...pick(policy.outro)], voice);
    return {
      id: `bulletin:${bulletin.topic}:${bulletin.order}`,
      kind: "bulletin",
      title: bulletin.title ?? policy.title ?? "News",
      artist: station.name,
      seconds: Math.max(end, 1),
      theme: policy.theme ?? station.bed ?? null,
      transpose: 0,
      lines,
      topic: bulletin.topic,
    };
  }

  function nextSegment(station: RadioStationDef, state: StationState): RadioSegment {
    const bulletin = takeBulletin(station, state);
    if (bulletin !== null) return bulletin;
    const pattern = station.pattern;
    if (pattern !== undefined && pattern.length > 0) {
      for (let tries = 0; tries < pattern.length; tries++) {
        const kind = pattern[state.step % pattern.length]!;
        state.step = (state.step + 1) % pattern.length;
        const picked = draw(station, state, kind);
        if (picked !== null) return resolve(station, picked);
      }
    }
    return resolve(station, draw(station, state, "*")!);
  }

  function freshStation(station: RadioStationDef): StationState {
    const state: StationState = { segment: undefined as unknown as RadioSegment, elapsed: 0, step: 0, decks: {}, queue: [] };
    state.segment = nextSegment(station, state);
    // Stations start at different points of their first segment so the dial never sounds synchronised.
    state.elapsed = random() * state.segment.seconds * 0.8;
    return state;
  }

  function reset(): void {
    states = {};
    for (const station of def.stations) states[station.id] = freshStation(station);
  }
  reset();

  function listening(stationId: string): boolean {
    return powered && dialAt === stationId;
  }

  function cueLines(stationId: string, segment: RadioSegment, from: number, to: number, inclusiveStart: boolean): void {
    for (const line of segment.lines) {
      if ((inclusiveStart ? line.at >= from : line.at > from) && line.at <= to) {
        pending.push({ kind: "line", station: stationId, segment, line });
      }
    }
  }

  function advance(station: RadioStationDef, state: StationState, dt: number): void {
    const tuned = listening(station.id);
    let from = state.elapsed;
    state.elapsed += dt;
    let advances = 0;
    let fresh = false;
    while (state.elapsed >= state.segment.seconds && advances < MAX_ADVANCES_PER_TICK) {
      if (tuned) cueLines(station.id, state.segment, from, state.segment.seconds, fresh);
      state.elapsed -= state.segment.seconds;
      state.segment = nextSegment(station, state);
      advances += 1;
      from = 0;
      fresh = true;
      if (tuned) pending.push({ kind: "segment", station: station.id, segment: state.segment, offset: state.elapsed });
    }
    if (state.elapsed >= state.segment.seconds) state.elapsed = 0;
    if (tuned) cueLines(station.id, state.segment, from, state.elapsed, fresh);
  }

  function cueCurrent(): void {
    if (!powered) return;
    const state = states[dialAt]!;
    pending.push({ kind: "segment", station: dialAt, segment: state.segment, offset: state.elapsed });
  }

  function view(stationId: string): RadioNowPlaying | null {
    const station = byId.get(stationId);
    const state = states[stationId];
    if (station === undefined || state === undefined) return null;
    let line: RadioLine | null = null;
    for (const candidate of state.segment.lines) {
      if (candidate.at <= state.elapsed && state.elapsed < candidate.at + candidate.seconds + LINE_HOLD) line = candidate;
    }
    return {
      station: { id: station.id, name: station.name, frequency: station.frequency, kind: station.kind },
      segment: { id: state.segment.id, kind: state.segment.kind, title: state.segment.title, artist: state.segment.artist },
      elapsed: state.elapsed,
      seconds: state.segment.seconds,
      line: line?.text ?? null,
      voice: line?.voice ?? null,
    };
  }

  function setDial(stationId: string): void {
    const changed = dialAt !== stationId || !powered;
    dialAt = stationId;
    powered = true;
    if (changed) cueCurrent();
  }

  return {
    tick(dt) {
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (step > 0) {
        clock += step;
        for (const topic of Object.keys(cooldowns)) {
          const left = cooldowns[topic]! - step;
          if (left <= 0) delete cooldowns[topic];
          else cooldowns[topic] = left;
        }
        for (const station of def.stations) {
          const state = states[station.id]!;
          state.queue = state.queue.filter((bulletin) => (bulletin.age += step) <= bulletin.ttl);
          advance(station, state, step);
        }
      }
      const out = pending;
      pending = [];
      return out;
    },
    tune(stationId) {
      if (!byId.has(stationId)) return;
      setDial(stationId);
    },
    step(direction) {
      const index = ids.indexOf(dialAt);
      const next = ids[(index + direction + ids.length) % ids.length]!;
      setDial(next);
      return next;
    },
    power(on) {
      if (on === powered) return;
      powered = on;
      if (on) cueCurrent();
      else pending.push({ kind: "off" });
    },
    powered: () => powered,
    tuned: () => (powered ? dialAt : null),
    dial: () => dialAt,
    cueCurrent,
    report(bulletin) {
      if ((cooldowns[bulletin.topic] ?? 0) > 0) return false;
      const targets = (bulletin.stations ?? ids).filter((id) => {
        const station = byId.get(id);
        return station !== undefined && station.bulletins !== false;
      });
      if (targets.length === 0) return false;
      const cooldown = bulletin.cooldown ?? 60;
      if (cooldown > 0) cooldowns[bulletin.topic] = cooldown;
      const priority = bulletin.priority ?? 1;
      order += 1;
      for (const id of targets) {
        const station = byId.get(id)!;
        const state = states[id]!;
        const policy = station.bulletins === false ? {} : station.bulletins ?? {};
        state.queue = state.queue.filter((queued) => queued.topic !== bulletin.topic);
        state.queue.push({
          topic: bulletin.topic,
          priority,
          title: bulletin.title ?? null,
          lines: bulletin.byStation?.[id] ?? bulletin.lines,
          age: 0,
          ttl: bulletin.ttl ?? timing.bulletinTtl,
          order,
        });
        const max = Math.max(1, policy.maxQueue ?? 4);
        while (state.queue.length > max) {
          let worst = 0;
          for (let i = 1; i < state.queue.length; i++) {
            const candidate = state.queue[i]!;
            const current = state.queue[worst]!;
            if (candidate.priority < current.priority || (candidate.priority === current.priority && candidate.order < current.order)) worst = i;
          }
          state.queue.splice(worst, 1);
        }
        if (policy.breakIn !== undefined && priority >= policy.breakIn && state.segment.kind !== "bulletin") {
          state.segment = nextSegment(station, state);
          state.elapsed = 0;
          if (listening(id)) {
            pending.push({ kind: "segment", station: id, segment: state.segment, offset: 0 });
            cueLines(id, state.segment, 0, 0, true);
          }
        }
      }
      return true;
    },
    cooldown: (topic) => cooldowns[topic] ?? 0,
    nowPlaying: () => (powered ? view(dialAt) : null),
    station: view,
    queued: (stationId) => states[stationId]?.queue.length ?? 0,
    stations: () => def.stations.map((station) => ({ id: station.id, name: station.name, frequency: station.frequency, kind: station.kind })),
    retune(next) {
      if (next.wordsPerSecond !== undefined) timing.wordsPerSecond = next.wordsPerSecond;
      if (next.lineGap !== undefined) timing.lineGap = next.lineGap;
      if (next.bulletinTtl !== undefined) timing.bulletinTtl = next.bulletinTtl;
    },
    snapshot() {
      return structuredCloneJson({ clock, seed, powered, tuned: dialAt, order, cooldowns, stations: states });
    },
    restore(snapshot) {
      clock = snapshot.clock;
      seed = randomSeedFrom(snapshot.seed);
      powered = snapshot.powered;
      dialAt = snapshot.tuned !== null && byId.has(snapshot.tuned) ? snapshot.tuned : ids[0]!;
      order = snapshot.order;
      cooldowns = { ...snapshot.cooldowns };
      const restored = structuredCloneJson(snapshot.stations);
      states = {};
      for (const station of def.stations) states[station.id] = restored[station.id] ?? freshStation(station);
      pending = [];
    },
  };
}

function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
