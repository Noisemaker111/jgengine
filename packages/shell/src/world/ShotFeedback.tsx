import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { devtools } from "@jgengine/core/devtools/devtools";
import type { DamageAppliedEvent } from "@jgengine/core/game/events";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { useAccessibilitySettings } from "@jgengine/react/accessibilitySettings";
import { useGameContext } from "@jgengine/react/provider";

import { startFromMuzzle } from "./WorldHud";

/** Whether `source` is the local player or what they currently drive. */
function isLocalSource(ctx: GameContext, source: string | undefined): boolean {
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

function usePool(count: number, make: () => THREE.SpriteMaterial): Slot[] {
  return useMemo(() => {
    const slots: Slot[] = [];
    for (let i = 0; i < count; i++) {
      const material = make();
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.frustumCulled = false;
      slots.push({ sprite, material, born: -1, life: 0, size: 0 });
    }
    return slots;
    // The pool lives as long as the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
}

function nextSlot(slots: Slot[], cursor: { current: number }): Slot {
  const slot = slots[cursor.current % slots.length]!;
  cursor.current++;
  return slot;
}

/** Counts behind the `render/shotFeedback` devtools probe. */
const stats = { markers: 0, kills: 0, flashes: 0 };

function useShotFeedbackProbe(): void {
  useEffect(
    () =>
      devtools.probes.registerSystem("render/shotFeedback", {
        counters: () => ({ ...stats }),
        state: () => `${stats.markers} hit markers · ${stats.kills} kills · ${stats.flashes} muzzle flashes`,
      }),
    [],
  );
}

const HIT_COLOR = new THREE.Color("#ffffff");
const KILL_COLOR = new THREE.Color("#ff3b3b");
/** How long a local shot's impact point stays the place a following damage event marks. */
const SHOT_POINT_MS = 250;

/**
 * Hit markers: when the local player's attack damages something, a tick flashes over the spot that was
 * hit (white for a hit, larger and red for a kill), drawn on top of everything at a fixed screen size.
 * Works with cursor aim and crosshair aim alike because it marks the hit, not the screen centre.
 * @internal
 */
export function HitMarkers({ lifeMs = 180 }: { lifeMs?: number }) {
  const ctx = useGameContext();
  const texture = useMemo(markerTexture, []);
  const slots = usePool(8, () =>
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false }),
  );
  const cursor = useRef(0);
  const group = useRef<THREE.Group>(null);
  const lastShot = useRef<{ at: THREE.Vector3; time: number } | null>(null);
  useShotFeedbackProbe();

  useEffect(() => {
    const parent = group.current;
    if (parent === null) return;
    for (const slot of slots) {
      slot.sprite.renderOrder = 10_000;
      parent.add(slot.sprite);
    }
    return () => {
      for (const slot of slots) {
        parent.remove(slot.sprite);
        slot.material.dispose();
      }
      texture.dispose();
    };
  }, [slots, texture]);

  useEffect(() => {
    const offShot = ctx.game.events.on("projectile.settled", (event) => {
      if (!event.hit || !isLocalSource(ctx, event.from)) return;
      lastShot.current = { at: new THREE.Vector3(event.at[0], event.at[1], event.at[2]), time: performance.now() };
    });
    const offDamage = ctx.game.events.on("combat.damage", (event: DamageAppliedEvent) => {
      if (event.status !== undefined || event.amount <= 0 || !isLocalSource(ctx, event.source)) return;
      const slot = nextSlot(slots, cursor);
      const now = performance.now();
      const shot = lastShot.current;
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
    });
    return () => {
      offShot();
      offDamage();
    };
  }, [ctx, slots, lifeMs]);

  useFrame(() => {
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
  });

  return <group ref={group} />;
}

/**
 * Muzzle flashes: a short bright star where each direct-fire shot leaves the gun (the shooter's hand
 * or barrel, or the first-person gun). Reduced motion keeps the flash but makes it smaller and dimmer.
 * @internal
 */
export function MuzzleFlashes({ lifeMs = 55 }: { lifeMs?: number }) {
  const ctx = useGameContext();
  const camera = useThree((state) => state.camera);
  const { reducedMotion } = useAccessibilitySettings();
  const texture = useMemo(flashTexture, []);
  const slots = usePool(12, () =>
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  const cursor = useRef(0);
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    const parent = group.current;
    if (parent === null) return;
    for (const slot of slots) parent.add(slot.sprite);
    return () => {
      for (const slot of slots) {
        parent.remove(slot.sprite);
        slot.material.dispose();
      }
      texture.dispose();
    };
  }, [slots, texture]);

  useEffect(() => {
    return ctx.game.events.on("projectile.settled", (event) => {
      if (event.ballistic) return;
      const slot = nextSlot(slots, cursor);
      const start = slot.sprite.position.set(event.origin[0], event.origin[1], event.origin[2]);
      startFromMuzzle(ctx, event.from, camera, start);
      slot.born = performance.now();
      slot.life = lifeMs;
      const near = camera.getWorldPosition(new THREE.Vector3()).distanceTo(start) < 1.2;
      slot.size = (near ? 0.07 : 0.45) * (reducedMotion ? 0.6 : 1);
      slot.sprite.scale.set(slot.size * 0.7, slot.size * 0.7, 1);
      slot.material.rotation = Math.random() * Math.PI * 2;
      slot.material.opacity = reducedMotion ? 0.6 : 1;
      slot.sprite.visible = true;
      stats.flashes += 1;
    });
  }, [ctx, camera, slots, lifeMs, reducedMotion]);

  useFrame(() => {
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
  });

  return <group ref={group} />;
}
