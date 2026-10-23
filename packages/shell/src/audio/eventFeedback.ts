import type { FeedbackCue } from "@jgengine/core/audio/feedbackCues";
import { feedbackCueSoundId } from "@jgengine/core/audio/feedbackCues";
import type { GameEventMap, GameEvents } from "@jgengine/core/game/events";
import type { HapticPulse } from "@jgengine/core/input/haptics";
import type { WaveRunner } from "@jgengine/core/ai/waveRunner";

/** One cue's reaction: what plays, what the hand feels, what the screen does, and what a caption says. */
export interface FeedbackReaction {
  /** Catalog id played for the cue. Defaults to `feel.<cue>`; a game sound with that id replaces it. */
  sound: string;
  /** Gamepad pulse, `0..1` per motor. Omitted cues do not rumble. */
  haptics?: HapticPulse;
  /** Camera trauma `0..1`, scaled by the player's motion setting (`0` under reduced motion). */
  shake?: number;
  /** Caption text when the accessibility captions setting is on. */
  caption?: string;
  /** Minimum ms between two plays of this cue, so a burst of hits reads as one impact. Default 40. */
  cooldownMs?: number;
}

/**
 * The default reactions. They are data: a game overrides one through `audio.feedbackCues` (sound) or
 * `createEventFeedback({ reactions })` (haptics, shake, caption), and replaces the mapping through
 * `bindings` without touching the shell.
 */
export const DEFAULT_FEEDBACK_REACTIONS: Readonly<Record<FeedbackCue, FeedbackReaction>> = {
  hit: {
    sound: feedbackCueSoundId("hit"),
    haptics: { strong: 0.18, weak: 0.3, ms: 70 },
    shake: 0.14,
    caption: "Hit",
    cooldownMs: 55,
  },
  hurt: {
    sound: feedbackCueSoundId("hurt"),
    haptics: { strong: 0.45, weak: 0.35, ms: 140 },
    shake: 0.4,
    caption: "Hurt",
    cooldownMs: 140,
  },
  kill: {
    sound: feedbackCueSoundId("kill"),
    haptics: { strong: 0.3, weak: 0.45, ms: 110 },
    shake: 0.22,
    caption: "Enemy down",
    cooldownMs: 90,
  },
  pickup: {
    sound: feedbackCueSoundId("pickup"),
    haptics: { strong: 0.06, weak: 0.14, ms: 45 },
    caption: "Picked up",
    cooldownMs: 80,
  },
  objective: {
    sound: feedbackCueSoundId("objective"),
    haptics: { strong: 0.12, weak: 0.2, ms: 120 },
    caption: "Objective complete",
    cooldownMs: 500,
  },
  wave: {
    sound: feedbackCueSoundId("wave"),
    haptics: { strong: 0.2, weak: 0.1, ms: 180 },
    shake: 0.1,
    caption: "Wave incoming",
    cooldownMs: 1500,
  },
  deny: {
    sound: feedbackCueSoundId("deny"),
    haptics: { strong: 0.1, weak: 0.25, ms: 60 },
    caption: "Not possible",
    cooldownMs: 350,
  },
};

/** Which side of an event a binding reacts to: the local player's, someone else's, or either. */
export type FeedbackScope = "local" | "remote" | "any";

/** Event names the default mapping listens to; a game may add its own through `bindings`. */
export type FeedbackEventName =
  | "combat.damage"
  | "entity.died"
  | "worldItem.picked_up"
  | "quest.completed"
  | "stat.levelUp"
  | "command.refused";

/** One row of the event mapping: `event` announces, `cue` reacts. */
export type FeedbackBinding<Name extends FeedbackEventName = FeedbackEventName> = {
  event: Name;
  cue: FeedbackCue;
  /** Default `"any"`. `"local"` only fires for the local player's own target/user/refusal. */
  scope?: FeedbackScope;
  /** Overrides the cue's caption for this event, e.g. "You died". */
  caption?: string;
  /** Reads extra caption detail out of the payload, e.g. the damage amount. */
  detail?: (payload: GameEventMap[Name]) => string | undefined;
};

export type AnyFeedbackBinding = { [Name in FeedbackEventName]: FeedbackBinding<Name> }[FeedbackEventName];

/**
 * The default mapping: each engine-announced gameplay event to the cue it raises. Damage to the
 * local player reads as hurt, damage anywhere else as a hit; a wave start has no event of its own,
 * so a game announces it through `notify("wave")` or `attachWaveFeedback`.
 */
export const DEFAULT_FEEDBACK_BINDINGS: readonly AnyFeedbackBinding[] = [
  { event: "combat.damage", cue: "hurt", scope: "local", detail: (event) => `${Math.round(event.amount)}` },
  { event: "combat.damage", cue: "hit", scope: "remote", detail: (event) => `${Math.round(event.amount)}` },
  { event: "entity.died", cue: "hurt", scope: "local", caption: "You died" },
  { event: "entity.died", cue: "kill", scope: "remote", detail: (event) => event.displayName ?? event.catalogId },
  { event: "worldItem.picked_up", cue: "pickup", scope: "local", detail: (event) => (event.count > 1 ? `${event.itemId} x${event.count}` : event.itemId) },
  { event: "quest.completed", cue: "objective", scope: "local", detail: (event) => event.questId },
  { event: "stat.levelUp", cue: "objective", scope: "local", detail: (event) => `${event.stat} ${event.level}` },
  { event: "command.refused", cue: "deny", scope: "local", detail: (event) => event.message ?? event.reason },
];

/** A resolved trigger: pooled per binding, so a busy event stream allocates nothing to decide. */
export interface ResolvedFeedback {
  event: FeedbackEventName;
  cue: FeedbackCue;
  sound: string;
  caption: string | undefined;
  haptics: HapticPulse | undefined;
  shake: number;
  cooldownMs: number;
}

/** Everything the feedback seam reaches outside itself. Injected so it runs headless. */
export interface FeedbackDeps {
  /** Play one catalog sound through the game's audio seam. */
  play(sound: string): void;
  /** Add camera trauma `0..1`; called with `shake x motionScale`. */
  shake?(amount: number): void;
  haptics?(pulse: HapticPulse): void;  /** Show a caption line for `cue`; only called when captions are on. */
  caption?(text: string, cue: FeedbackCue): void;
  /** The local player, for `scope: "local"`. */
  localUserId(): string | null;
  /** The entity the local player currently controls, for damage/death scope. */
  localEntityId(): string | null;
  /** Engine motion scale: `0` under reduced motion, `1` normally. Default `1`. */
  motionScale?(): number;
  now?(): number;
}

/** Options a game or host may override. */
export interface EventFeedbackOptions {
  reactions?: Partial<Record<FeedbackCue, FeedbackReaction>>;
  bindings?: readonly AnyFeedbackBinding[];
  /** Whether captions reach `deps.caption` at all. Default true. */
  captions?: boolean;
}

/** The event-to-reaction seam. One instance per running world. */
export interface EventFeedback {
  /** React to one announced event. Returns the cue fired, or null when nothing mapped or it was muted by cooldown. */
  handle<Name extends FeedbackEventName>(event: Name, payload: GameEventMap[Name]): FeedbackCue | null;
  /** Fire a cue the game announces itself (a wave starting, a custom moment); `caption` overrides the cue's text. */
  notify(cue: FeedbackCue, caption?: string): boolean;
  /** Map without firing - the pooled reaction for an event, for devtools and tests. */
  resolve<Name extends FeedbackEventName>(event: Name, payload: GameEventMap[Name]): ResolvedFeedback | null;
  /** How many triggers a cue's cooldown folded away since the last reset. */
  suppressed(cue: FeedbackCue): number;
  /** Replace reactions or bindings at runtime. */
  retune(options: Partial<EventFeedbackOptions>): void;
  /** Clear cooldowns and suppressed counters. */
  reset(): void;
}

const DEFAULT_COOLDOWN_MS = 40;

/**
 * Build the event-to-sound/haptic/shake/caption seam. The mapping is data
 * ({@link DEFAULT_FEEDBACK_BINDINGS}), reactions are data ({@link DEFAULT_FEEDBACK_REACTIONS}), and the
 * resolved trigger for each binding is allocated once - handling an event allocates only the caption
 * string it actually shows, never per frame.
 *
 * @capability event-feedback map announced gameplay events (damage, kill, pickup, objective, wave, refusal) to a sound, gamepad pulse, camera shake and caption through one data mapping
 */
export function createEventFeedback(deps: FeedbackDeps, options: EventFeedbackOptions = {}): EventFeedback {
  const reactions: Record<FeedbackCue, FeedbackReaction> = { ...DEFAULT_FEEDBACK_REACTIONS };
  let bindings: readonly AnyFeedbackBinding[] = options.bindings ?? DEFAULT_FEEDBACK_BINDINGS;
  let captionsOn = options.captions ?? true;
  for (const [cue, reaction] of Object.entries(options.reactions ?? {})) {
    if (reaction !== undefined) reactions[cue as FeedbackCue] = reaction;
  }
  const now = deps.now ?? Date.now;
  const lastPlayed: Record<FeedbackCue, number> = { hit: -Infinity, hurt: -Infinity, kill: -Infinity, pickup: -Infinity, objective: -Infinity, wave: -Infinity, deny: -Infinity };
  const suppressed: Record<FeedbackCue, number> = { hit: 0, hurt: 0, kill: 0, pickup: 0, objective: 0, wave: 0, deny: 0 };

  function triggerFor(binding: AnyFeedbackBinding): ResolvedFeedback {
    const reaction = reactions[binding.cue];
    return {
      event: binding.event,
      cue: binding.cue,
      sound: reaction.sound,
      caption: undefined,
      haptics: reaction.haptics,
      shake: reaction.shake ?? 0,
      cooldownMs: reaction.cooldownMs ?? DEFAULT_COOLDOWN_MS,
    };
  }

  // One pooled resolution per binding row plus one per cue (for `notify`), so a busy event stream
  // allocates nothing to decide what to play.
  let resolved: ResolvedFeedback[] = bindings.map(triggerFor);
  const cueTriggers = Object.fromEntries(
    (["hit", "hurt", "kill", "pickup", "objective", "wave", "deny"] as FeedbackCue[]).map((cue) => [cue, triggerFor({ event: "combat.damage", cue })]),
  ) as Record<FeedbackCue, ResolvedFeedback>;

  function rebuild(): void {
    resolved = bindings.map(triggerFor);
    for (const cue of Object.keys(cueTriggers) as FeedbackCue[]) {
      const reaction = reactions[cue];
      const trigger = cueTriggers[cue];
      trigger.sound = reaction.sound;
      trigger.haptics = reaction.haptics;
      trigger.shake = reaction.shake ?? 0;
      trigger.cooldownMs = reaction.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    }
  }

  function isLocal(event: FeedbackEventName, payload: GameEventMap[FeedbackEventName]): boolean {
    switch (event) {
      case "combat.damage":
        return (payload as GameEventMap["combat.damage"]).target === deps.localEntityId();
      case "entity.died": {
        const died = payload as GameEventMap["entity.died"];
        const userId = deps.localUserId();
        return (userId !== null && died.userId === userId) || died.instanceId === deps.localEntityId();
      }
      case "worldItem.picked_up":
        return (payload as GameEventMap["worldItem.picked_up"]).userId === deps.localUserId();
      case "quest.completed":
      case "stat.levelUp": {
        const userId = deps.localUserId();
        return userId !== null && (payload as GameEventMap["quest.completed"]).userId === userId;
      }
      case "command.refused": {
        const actor = (payload as GameEventMap["command.refused"]).actor;
        return actor === null || actor === deps.localUserId();
      }
      default:
        return true;
    }
  }

  function fire(trigger: ResolvedFeedback, captionText: string | undefined): void {
    deps.play(trigger.sound);
    if (trigger.haptics !== undefined) deps.haptics?.(trigger.haptics);
    if (trigger.shake > 0) {
      const scale = deps.motionScale?.() ?? 1;
      if (scale > 0) deps.shake?.(trigger.shake * scale);
    }
    if (captionsOn && captionText !== undefined) deps.caption?.(captionText, trigger.cue);
  }

  function react(cue: FeedbackCue, captionText: string | undefined): boolean {
    const reaction = reactions[cue];
    const trigger = cueTriggers[cue];
    const time = now();
    const cooldown = trigger.cooldownMs;
    if (time - lastPlayed[cue] < cooldown) {
      suppressed[cue] += 1;
      return false;
    }
    lastPlayed[cue] = time;
    const text = captionText ?? trigger.caption ?? reaction.caption;
    fire(trigger, text);
    return true;
  }

  return {
    handle(event, payload) {
      for (let index = 0; index < bindings.length; index += 1) {
        const binding = bindings[index]!;
        if (binding.event !== event) continue;
        const scope = binding.scope ?? "any";
        if (scope !== "any" && isLocal(event, payload) !== (scope === "local")) continue;
        const detail = (binding.detail as ((value: GameEventMap[FeedbackEventName]) => string | undefined) | undefined)?.(payload);
        const base = binding.caption ?? reactions[binding.cue].caption;
        const captionText = base === undefined ? detail : detail === undefined ? base : `${base} ${detail}`;
        return react(binding.cue, captionText) ? binding.cue : null;
      }
      return null;
    },
    notify(cue, caption) {
      return react(cue, caption);
    },
    resolve(event, payload) {
      for (let index = 0; index < bindings.length; index += 1) {
        const binding = bindings[index]!;
        if (binding.event !== event) continue;
        const scope = binding.scope ?? "any";
        if (scope !== "any" && isLocal(event, payload) !== (scope === "local")) continue;
        const trigger = resolved[index]!;
        const detail = (binding.detail as ((value: GameEventMap[FeedbackEventName]) => string | undefined) | undefined)?.(payload);
        const base = binding.caption ?? reactions[binding.cue].caption;
        trigger.caption = base === undefined ? detail : detail === undefined ? base : `${base} ${detail}`;
        return trigger;
      }
      return null;
    },
    suppressed(cue) {
      return suppressed[cue];
    },
    retune(next) {
      if (next.captions !== undefined) captionsOn = next.captions;
      if (next.bindings !== undefined) {
        bindings = next.bindings;
        rebuild();
      }
      if (next.reactions !== undefined) {
        for (const [cue, reaction] of Object.entries(next.reactions)) {
          if (reaction !== undefined) reactions[cue as FeedbackCue] = reaction;
        }
        rebuild();
      }
    },
    reset() {
      for (const cue of Object.keys(lastPlayed) as FeedbackCue[]) {
        lastPlayed[cue] = -Infinity;
        suppressed[cue] = 0;
      }
    },
  };
}

/**
 * Subscribe the feedback seam to a game's event bus. Returns the detach function; the mapping and
 * reactions stay override-able through the seam's `retune`.
 *
 * @capability attach-event-feedback one call wires every announced combat/loot/objective/refusal event to its reaction
 */
export function attachEventFeedback(
  events: Pick<GameEvents, "on">,
  feedback: EventFeedback,
  eventsToBind: readonly FeedbackEventName[] = Object.keys(
    DEFAULT_FEEDBACK_BINDINGS.reduce<Record<string, true>>((names, binding) => {
      names[binding.event] = true;
      return names;
    }, {}),
  ) as FeedbackEventName[],
): () => void {
  const offs = eventsToBind.map((name) =>
    events.on(name, (payload) => {
      feedback.handle(name, payload as GameEventMap[typeof name]);
    }),
  );
  return () => {
    for (const off of offs) off();
  };
}

/**
 * Announce each new wave a {@link WaveRunner} starts as the `wave` cue, once per boundary. A wave
 * has no event of its own, so this is the engine-side hookup for tower defense and wave survival
 * games; nothing is polled, the runner's own notification drives it.
 *
 * @capability attach-wave-feedback fire the wave cue once whenever a wave runner crosses into a new wave
 */
export function attachWaveFeedback(runner: Pick<WaveRunner, "state" | "subscribe">, feedback: EventFeedback): () => void {
  let lastWave = runner.state().wave;
  return runner.subscribe(() => {
    const wave = runner.state().wave;
    if (wave === lastWave) return;
    lastWave = wave;
    feedback.notify("wave", `Wave ${wave + 1}`);
  });
}
