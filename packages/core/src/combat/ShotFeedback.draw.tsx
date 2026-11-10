import { useRef } from "react";
import * as THREE from "three";

import { devtools } from "@jgengine/core/devtools/devtools";
import type { DamageAppliedEvent } from "@jgengine/core/game/events";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { useAccessibilitySettings } from "@jgengine/core/settings/accessibilitySettings.view";
import { useGameContext } from "@jgengine/react/provider";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { startFromMuzzle } from "@jgengine/core/hud/WorldHud.draw";

/** Whether `source` is the local player or what they currently drive. Exported for tests. @internal */
export function isLocalSource(ctx: GameContext, source: string | undefined): boolean {
  if (source === undefined) return false;
  return source === ctx.player.userId || source === ctx.player.possession.active(ctx.player.userId);
}

function drawTexture(draw: (g: CanvasRenderingContext2D, size: number) => void): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (g !== null) draw(g, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Four short strokes around an open centre: the classic shooter hit tick. */
function markerTexture(): THREE.Texture {
  return drawTexture((g, size) => {
    const c = size / 2;
    g.lineCap = "round";
    const stroke = (width: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        g.beginPath();
        g.moveTo(c + sx * 9, c + sy * 9);
        g.lineTo(c + sx * 24, c + sy * 24);
        g.stroke();
      }
    };
    stroke(9, "rgba(0,0,0,0.55)");
    stroke(5, "#ffffff");
  });
}

/** A bright star with a hot core, for the instant a gun goes off. */
function flashTexture(): THREE.Texture {
  return drawTexture((g, size) => {
    const c = size / 2;
    const glow = g.createRadialGradient(c, c, 0, c, c, c);
    glow.addColorStop(0, "rgba(255,255,240,1)");
    glow.addColorStop(0.25, "rgba(255,214,120,0.9)");
    glow.addColorStop(1, "rgba(255,140,40,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);
    g.fillStyle = "rgba(255,240,200,0.95)";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
      g.lineTo(c + Math.cos(a + 0.35) * 6, c + Math.sin(a + 0.35) * 6);
      g.lineTo(c + Math.cos(a - 0.35) * 6, c + Math.sin(a - 0.35) * 6);
      g.closePath();
      g.fill();
    }
  });
}

interface Slot {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  born: number;
  life: number;
  size: number;
}

/** Counts behind the `render/shotFeedback` devtools probe. */
const stats = { markers: 0, kills: 0, flashes: 0 };

let probeRegistered = false;
function ensureShotFeedbackProbe(): void {
  if (probeRegistered) return;
  probeRegistered = true;
  devtools.probes.registerSystem("render/shotFeedback", {
    counters: () => ({ ...stats }),
    state: () => `${stats.markers} hit markers · ${stats.kills} kills · ${stats.flashes} muzzle flashes`,
  });
}

const HIT_COLOR = new THREE.Color("#ffffff");
const KILL_COLOR = new THREE.Color("#ff3b3b");
/** How long a local shot's impact point stays the place a following damage event marks. */
const SHOT_POINT_MS = 250;

function makeSlots(count: number, make: () => THREE.SpriteMaterial): Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const material = make();
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.frustumCulled = false;
    slots.push({ sprite, material, born: -1, life: 0, size: 0 });
  }
  return slots;
}

function nextSlot(slots: Slot[], cursor: { current: number }): Slot {
  const slot = slots[cursor.current % slots.length]!;
  cursor.current++;
  return slot;
}

export interface HitMarkersDrawProps {
  ctx: GameContext;
  /** Milliseconds a marker stays up. Default 180. */
  lifeMs?: number;
}

/**
 * Draw-side form of {@link HitMarkers}: hit markers flash over the spot the local player's attack
 * hit (white for a hit, larger and red for a kill), drawn on top of everything at a fixed screen
 * size. Works with cursor aim and crosshair aim alike because it marks the hit, not the screen
 * centre. Subscribes to the current `ctx`'s events; a context swap resubscribes like the old
 * effect deps.
 * @internal
 */
export function hitMarkersDraw(getProps: () => HitMarkersDrawProps): EngineDraw {
  const texture = markerTexture();
  const slots = makeSlots(8, () =>
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false }),
  );
  const cursor = { current: 0 };
  let parent: THREE.Object3D | null = null;
  let lastShot: { at: THREE.Vector3; time: number } | null = null;
  let subscribedCtx: GameContext | null = null;
  const offHandlers: (() => void)[] = [];

  const subscribe = (ctx: GameContext) => {
    offHandlers.push(ctx.game.events.on("projectile.settled", (event) => {
      if (!event.hit || !isLocalSource(ctx, event.from)) return;
      lastShot = { at: new THREE.Vector3(event.at[0], event.at[1], event.at[2]), time: performance.now() };
    }));
    offHandlers.push(ctx.game.events.on("combat.damage", (event: DamageAppliedEvent) => {
      if (event.status !== undefined || event.amount <= 0 || !isLocalSource(ctx, event.source)) return;
      const slot = nextSlot(slots, cursor);
      const now = performance.now();
      const lifeMs = getProps().lifeMs ?? 180;
      const shot = lastShot;
      if (event.position !== undefined) slot.sprite.position.set(event.position[0], event.position[1], event.position[2]);
      else if (shot !== null && now - shot.time < SHOT_POINT_MS) slot.sprite.position.copy(shot.at);
      else {
        const target = ctx.scene.entity.get(event.target);
        if (target === null) return;
        slot.sprite.position.set(target.position[0], target.position[1] + 1, target.position[2]);
      }
      slot.born = now;
      slot.life = event.lethal ? lifeMs * 1.6 : lifeMs;
      slot.size = event.lethal ? 0.075 : 0.05;
      slot.material.color.copy(event.lethal ? KILL_COLOR : HIT_COLOR);
      slot.material.opacity = 1;
      slot.sprite.scale.set(slot.size * 1.35, slot.size * 1.35, 1);
      slot.sprite.visible = true;
      stats.markers += 1;
      if (event.lethal) stats.kills += 1;
    }));
  };

  const syncSubscription = () => {
    const ctx = getProps().ctx;
    if (ctx === subscribedCtx) return;
    for (const off of offHandlers.splice(0)) off();
    subscribedCtx = ctx;
    subscribe(ctx);
  };

  return {
    mount(state: EngineFrameState) {
      parent = state.scene;
      ensureShotFeedbackProbe();
      for (const slot of slots) {
        slot.sprite.renderOrder = 10_000;
        parent.add(slot.sprite);
      }
      syncSubscription();
    },
    update() {
      syncSubscription();
    },
    frame() {
      const now = performance.now();
      for (const slot of slots) {
        if (!slot.sprite.visible) continue;
        const t = (now - slot.born) / slot.life;
        if (t >= 1) {
          slot.sprite.visible = false;
          continue;
        }
        // Pop in slightly large, settle, then fade.
        const pop = t < 0.15 ? 1.35 - t * 2.3 : 1;
        const s = slot.size * pop;
        slot.sprite.scale.set(s, s, 1);
        slot.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      }
    },
    dispose() {
      for (const off of offHandlers.splice(0)) off();
      subscribedCtx = null;
      const host = parent;
      parent = null;
      for (const slot of slots) {
        if (host !== null) host.remove(slot.sprite);
        slot.material.dispose();
      }
      texture.dispose();
    },
  };
}

/**
 * Hit markers: when the local player's attack damages something, a tick flashes over the spot that was
 * hit (white for a hit, larger and red for a kill), drawn on top of everything at a fixed screen size.
 * @internal
 */
export function HitMarkers({ lifeMs = 180 }: { lifeMs?: number }) {
  const ctx = useGameContext();
  const latest = useRef({ ctx, lifeMs });
  latest.current = { ctx, lifeMs };
  return <EngineDrawMount create={() => hitMarkersDraw(() => latest.current)} deps={[ctx]} />;
}

export interface MuzzleFlashesDrawProps {
  ctx: GameContext;
  /** Accessibility setting: smaller, dimmer flashes under reduced motion. */
  reducedMotion: boolean;
  /** Milliseconds a flash stays up. Default 55. */
  lifeMs?: number;
}

/**
 * Draw-side form of {@link MuzzleFlashes}: a short bright star where each direct-fire shot leaves
 * the gun (the shooter's hand or barrel, or the first-person gun). Reduced motion keeps the flash
 * but makes it smaller and dimmer. `lifeMs`/`reducedMotion` are read per event and the camera is the
 * frame state's live object, so only a `ctx` swap resubscribes — matching the old effect deps.
 * @internal
 */
export function muzzleFlashesDraw(getProps: () => MuzzleFlashesDrawProps): EngineDraw {
  const texture = flashTexture();
  const slots = makeSlots(12, () =>
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  const cursor = { current: 0 };
  let parent: THREE.Object3D | null = null;
  let camera: THREE.Camera | null = null;
  let subscribedCtx: GameContext | null = null;
  let offSettled: (() => void) | null = null;

  const subscribe = (ctx: GameContext) => {
    offSettled = ctx.game.events.on("projectile.settled", (event) => {
      if (event.ballistic || camera === null) return;
      const props = getProps();
      const slot = nextSlot(slots, cursor);
      const start = slot.sprite.position.set(event.origin[0], event.origin[1], event.origin[2]);
      startFromMuzzle(props.ctx, event.from, camera, start);
      slot.born = performance.now();
      slot.life = props.lifeMs ?? 55;
      const near = camera.getWorldPosition(new THREE.Vector3()).distanceTo(start) < 1.2;
      slot.size = (near ? 0.07 : 0.45) * (props.reducedMotion ? 0.6 : 1);
      slot.sprite.scale.set(slot.size * 0.7, slot.size * 0.7, 1);
      slot.material.rotation = Math.random() * Math.PI * 2;
      slot.material.opacity = props.reducedMotion ? 0.6 : 1;
      slot.sprite.visible = true;
      stats.flashes += 1;
    });
  };

  const syncSubscription = () => {
    const ctx = getProps().ctx;
    if (ctx === subscribedCtx) return;
    offSettled?.();
    offSettled = null;
    subscribedCtx = ctx;
    subscribe(ctx);
  };

  return {
    mount(state: EngineFrameState) {
      parent = state.scene;
      camera = state.camera;
      for (const slot of slots) parent.add(slot.sprite);
      syncSubscription();
    },
    update() {
      syncSubscription();
    },
    frame() {
      const now = performance.now();
      for (const slot of slots) {
        if (!slot.sprite.visible) continue;
        const t = (now - slot.born) / slot.life;
        if (t >= 1) {
          slot.sprite.visible = false;
          continue;
        }
        const s = slot.size * (0.7 + t * 0.6);
        slot.sprite.scale.set(s, s, 1);
      }
    },
    dispose() {
      offSettled?.();
      offSettled = null;
      subscribedCtx = null;
      camera = null;
      const host = parent;
      parent = null;
      for (const slot of slots) {
        if (host !== null) host.remove(slot.sprite);
        slot.material.dispose();
      }
      texture.dispose();
    },
  };
}

/**
 * Muzzle flashes: a short bright star where each direct-fire shot leaves the gun (the shooter's hand
 * or barrel, or the first-person gun). Reduced motion keeps the flash but makes it smaller and dimmer.
 * @internal
 */
export function MuzzleFlashes({ lifeMs = 55 }: { lifeMs?: number }) {
  const ctx = useGameContext();
  const { reducedMotion } = useAccessibilitySettings();
  const latest = useRef({ ctx, reducedMotion, lifeMs });
  latest.current = { ctx, reducedMotion, lifeMs };
  return <EngineDrawMount create={() => muzzleFlashesDraw(() => latest.current)} deps={[ctx]} />;
}
