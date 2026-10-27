import { useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { LightBeam } from "@jgengine/core/map/LightBeam.draw";
import { useGame, useGameStore } from "@jgengine/react/hooks";

import { broodView, greenObelisk, lairWall, obeliskView, spitInFlight } from "../broodmother";
import { PORTAL_RANGE } from "../data/bosses";
import { ItemIcon } from "./ItemIcon";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
const GREEN = "#34ff6a";
const ACID = "#9dff3a";

/** The lair's wall as mossy rock, and webs hung across its top. */
function LairWall({ ctx }: WorldOverlayProps): ReactNode {
  const slabs = useMemo(() => lairWall(ctx), [ctx]);
  return (
    <>
      {slabs.map((slab, index) => (
        <group key={index} position={[slab.center[0], slab.center[1], slab.center[2]]} rotation={[0, slab.rotationY ?? 0, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[slab.halfExtents[0] * 2, slab.halfExtents[1] * 2, slab.halfExtents[2] * 2]} />
            <meshStandardMaterial color={index % 3 === 0 ? "#4d5040" : index % 3 === 1 ? "#55574a" : "#464838"} roughness={0.95} />
          </mesh>
          <mesh position={[0, slab.halfExtents[1] - 0.6, 0]}>
            <boxGeometry args={[slab.halfExtents[0] * 2 + 0.2, 1.2, slab.halfExtents[2] * 2 + 0.4]} />
            <meshStandardMaterial color="#3f6b2c" roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** The acid in flight: a glowing green glob arcing from her to where you stood. */
function Spit({ ctx }: WorldOverlayProps): ReactNode {
  const glob = useRef<Mesh>(null);
  useFrame(() => {
    const at = spitInFlight(ctx);
    if (glob.current === null) return;
    glob.current.visible = at !== null;
    if (at !== null) glob.current.position.set(at[0], at[1], at[2]);
  });
  return (
    <mesh ref={glob} visible={false}>
      <sphereGeometry args={[0.7, 12, 8]} />
      <meshStandardMaterial color={ACID} emissive={ACID} emissiveIntensity={2} toneMapped={false} />
    </mesh>
  );
}

/** While the portal counts down, the obelisk's foot glows: a green beam and a ring as wide as it reaches. */
function Portal({ ctx }: WorldOverlayProps): ReactNode {
  const phase = useGameStore((state) => broodView(state).phase);
  const at = useMemo(() => greenObelisk(ctx), [ctx]);
  if (phase !== "portal") return null;
  return (
    <group position={[at[0], at[1], at[2]]}>
      <LightBeam height={120} radius={3} color={GREEN} opacity={0.5} />
      <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[PORTAL_RANGE - 0.8, PORTAL_RANGE, 64]} />
        <meshBasicMaterial color={GREEN} transparent opacity={0.7} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** What the Broodmother adds to the world: her walled lair, the portal at the obelisk, and her acid in the air. */
export function BroodLair({ ctx }: WorldOverlayProps): ReactNode {
  return (
    <>
      <LairWall ctx={ctx} />
      <Portal ctx={ctx} />
      <Spit ctx={ctx} />
    </>
  );
}

const BAR: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "#f4efe2", textShadow: "0 1px 3px #000", pointerEvents: "none", minWidth: 420, background: "#0c0f0dcc", borderRadius: 6, padding: "8px 14px" };

/** ARK's boss bar across the top: her name and health, the phase tell, and the portal and return clocks. */
export function BossBar(): ReactNode {
  const view = useGameStore(broodView, same);
  if (view.phase === "idle") return null;
  const seconds = view.secondsLeft === null ? null : Math.ceil(view.secondsLeft);
  if (view.phase === "portal") {
    return (
      <div data-brood="portal" style={BAR}>
        <div style={{ fontWeight: 800, color: GREEN }}>{view.tier} Broodmother summoned</div>
        <div style={{ fontSize: 13 }}>
          The portal opens in {seconds} s · stand within {PORTAL_RANGE} m of the Green Obelisk with your tames
        </div>
      </div>
    );
  }
  if (!view.inside) return null;
  const health = view.boss?.health ?? 0;
  return (
    <div data-brood={view.phase} style={BAR}>
      <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>{view.tier} Broodmother Lysrix</div>
      <div style={{ width: 420, height: 12, background: "#000a", border: "1px solid #0008", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${health * 100}%`, height: "100%", background: "linear-gradient(#d84a3a, #8a1f18)" }} />
      </div>
      <div style={{ fontSize: 12, opacity: 0.9 }}>
        {view.phase === "victory" ? `Victory! Back to the obelisk in ${seconds} s` : `${Math.ceil(health * 100)}% · ${view.brood} Araneo`}
      </div>
      {view.tell === null || view.phase !== "fight" ? null : <div style={{ fontWeight: 800, fontSize: 18, color: "#ffb04a" }}>{view.tell}</div>}
    </div>
  );
}

const BUTTON: CSSProperties = { background: "#1f5a3a", color: "#eafff0", border: "1px solid #3fae6a", borderRadius: 4, padding: "6px 14px", cursor: "pointer", fontWeight: 700 };

/** The Green Obelisk's terminal: each difficulty's level and tribute against what you carry, and its rewards. */
export function ObeliskPanel(): ReactNode {
  const view = useGameStore(obeliskView, same);
  const game = useGame();
  return (
    <div data-obelisk="" style={{ background: "#0f1d17ee", border: `1px solid ${GREEN}66`, borderRadius: 6, padding: 16, color: "#e6f5ea", display: "flex", flexDirection: "column", gap: 12, width: 760 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: GREEN }}>Green Obelisk · Broodmother Lysrix</div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>Offer the tribute to open a portal to her lair. Everyone within {PORTAL_RANGE} m goes through when it opens, tames too.</div>
      <div style={{ display: "flex", gap: 10 }}>
        {view.tiers.map((tier) => (
          <div key={tier.id} data-tier={tier.id} style={{ flex: 1, background: "#0008", borderRadius: 4, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>{tier.label}</div>
            <div style={{ fontSize: 12, color: tier.levelOk ? "#9ef08a" : "#ff8a7a" }}>Survivor level {tier.minLevel}</div>
            {tier.tribute.map((entry) => (
              <div key={entry.item} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <div style={{ width: 28, height: 28, flex: "none" }}>
                  <ItemIcon itemId={entry.item} />
                </div>
                <span style={{ flex: 1 }}>{entry.label}</span>
                <span style={{ color: entry.have >= entry.need ? "#9ef08a" : "#ff8a7a", fontVariantNumeric: "tabular-nums" }}>
                  {Math.min(entry.have, entry.need)}/{entry.need}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 11, opacity: 0.8 }}>Rewards: {tier.rewards.map((entry) => `${entry.count} ${entry.label}`).join(", ")}</div>
            <button data-summon={tier.id} disabled={!tier.ok || view.busy} style={{ ...BUTTON, opacity: tier.ok && !view.busy ? 1 : 0.4 }} onClick={() => void game.commands.run("summonBoss", { tier: tier.id })}>
              Summon
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
