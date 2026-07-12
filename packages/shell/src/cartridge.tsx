import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";

import { createCartridge, type CartridgeRuntime } from "@jgengine/core/cartridge/runtime";
import { WASD_KEYBINDS, leveled, type CartridgeSpec, type CartridgeWeapon } from "@jgengine/core/cartridge/spec";
import { validateCartridge } from "@jgengine/core/cartridge/validate";
import type { AbilitySlotState } from "@jgengine/core/combat/abilityKit";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { HudAnchor } from "@jgengine/core/ui/hudLayout";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { useAbilitySlots, useEntityStat } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { defineGame, type GameConfig } from "./defineGame";
import type { PlayableGame } from "./registry";

export type CartridgePanelItem =
  | { kind: "vital"; stat: string; label: string; tone?: string; width?: number }
  | { kind: "xp"; width?: number }
  | { kind: "timer"; label: string }
  | { kind: "score"; source: "kills"; label: string; digits?: number }
  | { kind: "abilityBar"; icons: Record<string, string> }
  | { kind: "component"; Component: ComponentType };

export interface CartridgeHudPanelSpec {
  id: string;
  anchor: HudAnchor;
  inset?: { x: number; y: number };
  items: readonly CartridgePanelItem[];
}

export type CartridgeResultLine = { label: string; accent?: boolean } & (
  | { source: "kills" | "level" }
  | { value: string | number }
);

export interface CartridgeScreens {
  start?: { title: string; subtitle?: string; buttonLabel?: string };
  win?: { title: string; lines: readonly CartridgeResultLine[] };
  lose?: { title: string; subtitle?: string };
}

export interface CartridgeAbilitySlot {
  id: string;
  icon: string;
  state: AbilitySlotState;
  cooldownFraction: number;
  justCast: boolean;
}

export interface CartridgePanels {
  Vital: ComponentType<{ value: { current: number; max: number; min?: number }; label: string; tone?: string; width?: number }>;
  Xp: ComponentType<{ fraction: number; level?: number; width?: number }>;
  Timer: ComponentType<{ seconds: number; label: string }>;
  Score: ComponentType<{ value: number; label: string; digits?: number }>;
  AbilityBar: ComponentType<{ slots: readonly CartridgeAbilitySlot[] }>;
  DraftModal: ComponentType<{ offers: readonly { id: string; label: string }[]; choose(id: string): void }>;
  StartScreen: ComponentType<{ title: string; subtitle?: string; buttonLabel?: string; begin(): void }>;
  Countdown: ComponentType<{ seconds: number }>;
  WinScreen: ComponentType<{ title: string; lines: readonly { label: string; value: string | number; accent?: boolean }[] }>;
  LoseScreen: ComponentType<{ title: string; subtitle?: string }>;
}

export type CartridgeConfig = CartridgeSpec & {
  name: string;
  panels: CartridgePanels;
  hud: { storageKey?: string; panels: readonly CartridgeHudPanelSpec[] };
  screens: CartridgeScreens;
  theme?: Record<string, string>;
  world?: GameConfig["world"];
  physics?: GameConfig["physics"];
  assets?: GameConfig["assets"];
  save?: GameConfig["save"];
  camera?: GameConfig["camera"];
  entitySprites?: GameConfig["entitySprites"];
  worldItem?: GameConfig["worldItem"];
  settings?: GameConfig["settings"];
};

function useTick(intervalMs: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

function useRunPhase(ctx: GameContext, runtime: CartridgeRuntime): void {
  const run = runtime.run(ctx);
  useSyncExternalStore(
    run.subscribe,
    () => `${run.phase}:${run.pendingOffers?.map((offer) => offer.id).join(",") ?? ""}`,
  );
}

function winSeconds(config: CartridgeConfig): number | null {
  return config.rules.win?.kind === "survive" ? config.rules.win.seconds : null;
}

function VitalItem({ config, item }: { config: CartridgeConfig; item: Extract<CartridgePanelItem, { kind: "vital" }> }) {
  const ctx = useGameContext();
  const value = useEntityStat(ctx.player.userId, item.stat);
  if (value === null) return null;
  return <config.panels.Vital value={value} label={item.label} tone={item.tone} width={item.width} />;
}

function XpItem({ config, item }: { config: CartridgeConfig; item: Extract<CartridgePanelItem, { kind: "xp" }> }) {
  const ctx = useGameContext();
  const xp = useEntityStat(ctx.player.userId, "xp");
  const level = useEntityStat(ctx.player.userId, "level");
  if (xp === null) return null;
  const fraction = (xp.current - xp.min) / Math.max(1, xp.max - xp.min);
  return <config.panels.Xp fraction={fraction} level={level?.current} width={item.width} />;
}

function TimerItem({
  config,
  runtime,
  item,
}: {
  config: CartridgeConfig;
  runtime: CartridgeRuntime;
  item: Extract<CartridgePanelItem, { kind: "timer" }>;
}) {
  const ctx = useGameContext();
  const target = winSeconds(config);
  const elapsed = runtime.run(ctx).playingSeconds;
  const seconds = target === null ? elapsed : Math.max(0, target - elapsed);
  return <config.panels.Timer seconds={seconds} label={item.label} />;
}

function ScoreItem({
  config,
  runtime,
  item,
}: {
  config: CartridgeConfig;
  runtime: CartridgeRuntime;
  item: Extract<CartridgePanelItem, { kind: "score" }>;
}) {
  const ctx = useGameContext();
  return <config.panels.Score value={runtime.run(ctx).kills} label={item.label} digits={item.digits} />;
}

function AbilityBarItem({
  config,
  runtime,
  item,
}: {
  config: CartridgeConfig;
  runtime: CartridgeRuntime;
  item: Extract<CartridgePanelItem, { kind: "abilityBar" }>;
}) {
  const ctx = useGameContext();
  const slots = useAbilitySlots(runtime.weaponKit(ctx));
  return (
    <config.panels.AbilityBar
      slots={slots.map((slot) => ({
        id: slot.id,
        icon: item.icons[slot.id] ?? slot.id,
        state: slot.state,
        cooldownFraction: slot.cooldownFraction,
        justCast: slot.justCast,
      }))}
    />
  );
}

function PanelItems({
  config,
  runtime,
  items,
}: {
  config: CartridgeConfig;
  runtime: CartridgeRuntime;
  items: readonly CartridgePanelItem[];
}) {
  return (
    <>
      {items.map((item, index) => {
        switch (item.kind) {
          case "vital":
            return <VitalItem key={index} config={config} item={item} />;
          case "xp":
            return <XpItem key={index} config={config} item={item} />;
          case "timer":
            return <TimerItem key={index} config={config} runtime={runtime} item={item} />;
          case "score":
            return <ScoreItem key={index} config={config} runtime={runtime} item={item} />;
          case "abilityBar":
            return <AbilityBarItem key={index} config={config} runtime={runtime} item={item} />;
          case "component":
            return <item.Component key={index} />;
        }
      })}
    </>
  );
}

function WinScreenHost({ config, runtime }: { config: CartridgeConfig; runtime: CartridgeRuntime }) {
  const ctx = useGameContext();
  const level = useEntityStat(ctx.player.userId, "level");
  const win = config.screens.win;
  if (win === undefined) return null;
  const run = runtime.run(ctx);
  const lines = win.lines.map((line) => ({
    label: line.label,
    accent: line.accent,
    value:
      "value" in line ? line.value : line.source === "kills" ? run.kills : (level?.current ?? 1),
  }));
  return <config.panels.WinScreen title={win.title} lines={lines} />;
}

function DraftModalHost({ config, runtime }: { config: CartridgeConfig; runtime: CartridgeRuntime }) {
  const ctx = useGameContext();
  const offers = runtime.run(ctx).pendingOffers;
  if (offers === null) return null;
  return <config.panels.DraftModal offers={offers} choose={(id) => runtime.chooseUpgrade(ctx, id)} />;
}

function CartridgeUI({ config, runtime }: { config: CartridgeConfig; runtime: CartridgeRuntime }) {
  const ctx = useGameContext();
  const layout = useHudLayout({ storageKey: config.hud.storageKey ?? config.name });
  useRunPhase(ctx, runtime);
  useTick(200);
  const run = runtime.run(ctx);

  return (
    <div style={{ ...config.theme, display: "contents" }}>
      {run.phase === "start" && (
        <config.panels.StartScreen
          title={config.screens.start?.title ?? config.name}
          subtitle={config.screens.start?.subtitle}
          buttonLabel={config.screens.start?.buttonLabel}
          begin={() => runtime.begin(ctx)}
        />
      )}
      {run.phase === "countdown" && <config.panels.Countdown seconds={Math.ceil(run.countdownRemaining)} />}
      {run.phase === "lost" && config.screens.lose !== undefined && (
        <config.panels.LoseScreen title={config.screens.lose.title} subtitle={config.screens.lose.subtitle} />
      )}
      {run.phase === "won" && <WinScreenHost config={config} runtime={runtime} />}
      {run.phase === "playing" && (
        <HudCanvas layout={layout}>
          <DraftModalHost config={config} runtime={runtime} />
          {config.hud.panels.map((panel) => (
            <HudPanel
              key={panel.id}
              id={panel.id}
              anchor={panel.anchor}
              inset={panel.inset}
              style={
                panel.items.length > 1
                  ? { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }
                  : undefined
              }
            >
              <PanelItems config={config} runtime={runtime} items={panel.items} />
            </HudPanel>
          ))}
        </HudCanvas>
      )}
    </div>
  );
}

const MAX_BOLTS = 10;
const MAX_PULSES = 6;

function hideMesh(mesh: Mesh | null): void {
  if (mesh !== null) mesh.visible = false;
}

function BoltPool({
  runtime,
  weaponId,
  weapon,
}: {
  runtime: CartridgeRuntime;
  weaponId: string;
  weapon: Extract<CartridgeWeapon, { kind: "projectile" }>;
}) {
  const ctx = useGameContext();
  const refs = useRef<(Mesh | null)[]>(new Array(MAX_BOLTS).fill(null));

  useFrame(() => {
    const run = runtime.run(ctx);
    const now = ctx.time.now();
    const bolts = run.bolts.filter((bolt) => bolt.weaponId === weaponId);
    for (let i = 0; i < MAX_BOLTS; i += 1) {
      const mesh = refs.current[i];
      const bolt = bolts[i];
      if (mesh === null) continue;
      if (bolt === undefined) {
        hideMesh(mesh);
        continue;
      }
      const t = Math.min(1, Math.max(0, (now - bolt.firedAt) / bolt.travelSeconds));
      mesh.visible = true;
      mesh.position.set(
        bolt.origin[0] + (bolt.target[0] - bolt.origin[0]) * t,
        bolt.origin[1] + 0.9,
        bolt.origin[2] + (bolt.target[2] - bolt.origin[2]) * t,
      );
    }
  });

  return (
    <>
      {Array.from({ length: MAX_BOLTS }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            refs.current[i] = mesh;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.16, 8, 8]} />
          <meshStandardMaterial
            color={weapon.fxColor ?? "#8be9f0"}
            emissive={weapon.fxEmissive ?? weapon.fxColor ?? "#8be9f0"}
            emissiveIntensity={1.6}
          />
        </mesh>
      ))}
    </>
  );
}

function PulsePool({
  runtime,
  weaponId,
  weapon,
}: {
  runtime: CartridgeRuntime;
  weaponId: string;
  weapon: Extract<CartridgeWeapon, { kind: "pulse" }>;
}) {
  const ctx = useGameContext();
  const refs = useRef<(Mesh | null)[]>(new Array(MAX_PULSES).fill(null));

  useFrame(() => {
    const run = runtime.run(ctx);
    const now = ctx.time.now();
    const pulses = run.pulses.filter((pulse) => pulse.weaponId === weaponId);
    for (let i = 0; i < MAX_PULSES; i += 1) {
      const mesh = refs.current[i];
      const pulse = pulses[i];
      if (mesh === null) continue;
      if (pulse === undefined) {
        hideMesh(mesh);
        continue;
      }
      const t = Math.min(1, Math.max(0, (now - pulse.firedAt) / pulse.durationSeconds));
      const radius = Math.max(0.01, pulse.maxRadius * t);
      mesh.visible = true;
      mesh.position.set(pulse.at[0], pulse.at[1] + 0.05, pulse.at[2]);
      mesh.scale.set(radius, radius, radius);
      const material = mesh.material as { opacity: number } | { opacity: number }[];
      if (!Array.isArray(material)) material.opacity = 0.55 * (1 - t);
    }
  });

  return (
    <>
      {Array.from({ length: MAX_PULSES }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            refs.current[i] = mesh;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        >
          <ringGeometry args={[0.85, 1, 48]} />
          <meshBasicMaterial color={weapon.fxColor ?? "#a566d9"} transparent opacity={0.5} />
        </mesh>
      ))}
    </>
  );
}

function OrbitPool({
  runtime,
  weaponId,
  weapon,
}: {
  runtime: CartridgeRuntime;
  weaponId: string;
  weapon: Extract<CartridgeWeapon, { kind: "orbit" }>;
}) {
  const ctx = useGameContext();
  const maxBlades = Math.ceil(leveled(weapon.blades, weapon.maxLevel));
  const groupRef = useRef<Group>(null);
  const refs = useRef<(Mesh | null)[]>(new Array(maxBlades).fill(null));

  useFrame(() => {
    const run = runtime.run(ctx);
    const player = ctx.scene.entity.get(ctx.player.userId);
    if (player === null || run.phase !== "playing") {
      if (groupRef.current !== null) groupRef.current.visible = false;
      return;
    }
    const level = run.weaponLevel(weaponId);
    const blades = leveled(weapon.blades, level);
    const radius = leveled(weapon.radius, level);
    const angle = ctx.time.now() * weapon.angularSpeed;
    if (groupRef.current !== null) groupRef.current.visible = true;
    for (let i = 0; i < maxBlades; i += 1) {
      const mesh = refs.current[i];
      if (mesh === null) continue;
      if (i >= blades) {
        hideMesh(mesh);
        continue;
      }
      const theta = angle + (i * Math.PI * 2) / blades;
      mesh.visible = true;
      mesh.position.set(
        player.position[0] + Math.cos(theta) * radius,
        player.position[1] + 0.55,
        player.position[2] + Math.sin(theta) * radius,
      );
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: maxBlades }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            refs.current[i] = mesh;
          }}
          visible={false}
        >
          <boxGeometry args={[0.32, 0.08, 0.14]} />
          <meshStandardMaterial
            color={weapon.fxColor ?? "#dfe9ea"}
            emissive={weapon.fxEmissive ?? weapon.fxColor ?? "#dfe9ea"}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}

function CartridgeFxOverlay({ config, runtime }: { config: CartridgeConfig; runtime: CartridgeRuntime }) {
  return (
    <group>
      {Object.entries(config.weapons).map(([weaponId, weapon]) => {
        if (weapon.kind === "projectile") {
          return <BoltPool key={weaponId} runtime={runtime} weaponId={weaponId} weapon={weapon} />;
        }
        if (weapon.kind === "pulse") {
          return <PulsePool key={weaponId} runtime={runtime} weaponId={weaponId} weapon={weapon} />;
        }
        if (weapon.kind === "orbit") {
          return <OrbitPool key={weaponId} runtime={runtime} weaponId={weaponId} weapon={weapon} />;
        }
        return null;
      })}
    </group>
  );
}

export function cartridge(config: CartridgeConfig): PlayableGame {
  const problems = validateCartridge(config);
  if (problems.length > 0) {
    throw new Error(`cartridge "${config.name}": invalid spec:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  const runtime = createCartridge(config);
  return defineGame({
    name: config.name,
    assets: config.assets,
    features: { leaderboard: config.rules.killLeaderboardStat !== undefined },
    world: config.world,
    physics: config.physics,
    input: config.input ?? WASD_KEYBINDS,
    save: config.save ?? "none",
    content: runtime.content,
    loop: runtime.loop,
    GameUI: () => <CartridgeUI config={config} runtime={runtime} />,
    WorldOverlay: () => <CartridgeFxOverlay config={config} runtime={runtime} />,
    camera: config.camera,
    entitySprites: config.entitySprites,
    worldItem: config.worldItem,
    settings: config.settings,
  });
}
