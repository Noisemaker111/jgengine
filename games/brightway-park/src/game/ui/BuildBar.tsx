/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useState } from "@jgengine/core/ui/jsx";
import { useGame, useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";

import { BUILDABLES, CATEGORY_LABEL, CATEGORY_ORDER, RIDE_GROUPS, RIDE_GROUP_LABEL, SKEPTIC_LINE, rideRatingsLine, type BuildCategory, type BuildableDef, type RideGroup } from "../objects/catalog";
import { ecto } from "../ecto";
import { session } from "../session";
import { placementHintStore } from "../build/placementHint";
import { isLandTool, LAND_COST, LAND_TOOLS } from "../build/terrain";
import { LINE_KINDS } from "../build/commands";
import { canUndoBuild } from "../build/undo";
import { park, PRICE_TOLERANCE } from "../park";
import { FIT_KINDS, guestRidePreference, rideFit } from "../sim/rideExperience";
import { coasterCircuit } from "../rides";
import { BAD, BAR, Button, Card, INK, PENCIL, Row, Text } from "./look";

/** What the footer says about the picked blueprint: its numbers, or why it can't go here. */
function blueprintDetail(def: BuildableDef, circuit: ReturnType<typeof coasterCircuit>): string {
  const how = LINE_KINDS.has(def.id) ? " · click, or drag to lay a line" : "";
  if (def.ride !== undefined && def.id !== "ride_coaster") {
    const fits = FIT_KINDS.map((k) => `${guestRidePreference(k).label} ${Math.round(rideFit(k, def.id, circuit) * 100)}%`).join(" · ");
    return `${rideRatingsLine(def.ride)} · ${def.ride.capacity} riders · yields ${def.ride.price} a rider · ${fits}`;
  }
  if (def.category === "track" || def.id === "ride_coaster") return circuit.closed ? `${Math.round(circuit.length)} m lap · ${circuit.lapSeconds.toFixed(1)} s ride · fright ${circuit.excitement.toFixed(1)}` : "Lay track until the loop comes back to the station";
  if (def.stall !== undefined) return `Takes ${def.stall.price} nerve · the living spend up to ${Math.floor(def.stall.value * PRICE_TOLERANCE)} · ${ecto(def.upkeep)} a night`;
  if (def.scare !== undefined) return `Jolts the living within ${def.scare.radius} m for ${def.scare.fright} nerve, every ${def.scare.cooldown} s${def.scare.fright < SKEPTIC_LINE ? " · skeptics ignore it" : ""} · chain scares for more ectoplasm`;
  if (def.theme !== undefined) return `Adds ${def.theme.bonus} dread to every ride within ${def.theme.radius} m`;
  return `${def.blurb}${how}`;
}

interface Ticket { id: string; label: string; price: string; poor: boolean; locked: boolean; blurb: string; color: string | undefined }

/** The catalog as a strip of ticket stubs: pick a category (and ride family), pick a ticket, place it on the park. */
export function BuildBar({ onClose, onResearch }: { onClose: () => void; onResearch: () => void }) {
  const [category, setCategory] = useState<BuildCategory>("ride");
  const [group, setGroup] = useState<RideGroup>("eerie");
  const { commands } = useGame();
  const ctx = useGameContext();
  const { width } = useRuneViewport(), phone = width < 600;
  // Which tickets the till can pay for and which the lab still holds: the bar redraws when one flips, not as cash ticks.
  const stock = useGameStore((c) => {
    const w = park.of(c), cash = w.num("park.cash");
    return { landPoor: cash < LAND_COST, poor: Object.values(BUILDABLES).filter((d) => cash < d.cost).map((d) => d.id), locked: Object.values(BUILDABLES).filter((d) => w.canPlace(d.id)?.reason === "locked").map((d) => d.id) };
  });
  const selected = useGameStore(() => session.selectedTool);
  const undoable = useGameStore(() => canUndoBuild());
  const refusal = useStore(placementHintStore);
  useEffect(() => {
    if (isLandTool(selected)) { setCategory("land"); return; }
    const def = selected === null ? undefined : BUILDABLES[selected];
    if (def === undefined) return;
    setCategory(def.category);
    if (def.ride !== undefined) setGroup(def.ride.group);
  }, [selected]);
  const blueprint = selected === null ? undefined : BUILDABLES[selected];
  const land = isLandTool(selected) ? LAND_TOOLS[selected] : undefined;
  const circuit = coasterCircuit(ctx);
  const detail = land !== undefined ? refusal ?? `${land.label} · ${ecto(LAND_COST)} a cell · click a cell or drag over an area · U undoes`
    : blueprint === undefined ? "Pick a ticket, then a glowing spot on the park. Click anything built to inspect it."
    : refusal ?? blueprintDetail(blueprint, circuit);
  const tickets: Ticket[] = category === "land"
    ? Object.entries(LAND_TOOLS).map(([id, tool]) => ({ id, label: tool.label, price: ecto(LAND_COST), poor: stock.landPoor, locked: false, blurb: tool.blurb, color: undefined }))
    : Object.values(BUILDABLES).filter((d) => d.category === category && (category !== "ride" || d.ride?.group === group)).map((def) => {
      // Locked is the world's word: the kind's `when` reads its lab topic. A locked ticket opens the lab.
      const locked = stock.locked.includes(def.id);
      return { id: def.id, label: def.label, price: locked ? `Séance ${ecto(def.research?.cost ?? 0)}` : ecto(def.cost), poor: stock.poor.includes(def.id), locked,
        blurb: locked ? `${def.blurb} (channel it at the séance table first)` : def.blurb, color: def.color };
    });
  const picked = blueprint?.label ?? land?.label;
  const columns = phone ? 2 : Math.max(1, Math.min(tickets.length, 6));
  return <RuneView gap={8} items="center" width={phone ? width - 16 : Math.min(1040, width - 340)}>
    {picked !== undefined ? <Button tone="ghost" fill={BAR} border={{ width: 2, color: INK }} onPress={() => commands.run("clearTool", {})}>{`X · Done placing ${picked}`}</Button> : null}
    <Card width={{ fraction: 1 }} padding={phone ? 8 : 12} gap={6} label="Build palette">
      <RuneView layout="grid" columns={phone ? 5 : CATEGORY_ORDER.length + 3} gap={3} label="Blueprint categories">
        {CATEGORY_ORDER.map((c) => <Button key={c} tone="ghost" hint={`category:${c}`} pressed={category === c} label={CATEGORY_LABEL[c]} padding={[5, 4, 5, 4]} onPress={() => setCategory(c)}><Text size={phone ? 12 : 13} weight={800} align="center">{CATEGORY_LABEL[c]}</Text></Button>)}
        <Button tone="ghost" label="Undo" tooltip="Undo the last build, demolish or land change (U)" disabled={!undoable} padding={[5, 4, 5, 4]} onPress={() => commands.run("build.undo", {})}><Text size={phone ? 12 : 13} weight={800}>Undo</Text></Button>
        <Button tone="ghost" label="Séance table" tooltip="Channel new rides, scares, stalls and gloom (R)" padding={[5, 4, 5, 4]} onPress={onResearch}><Text size={phone ? 12 : 13} weight={800}>Séance</Text></Button>
        <Button tone="ghost" label="Close build palette" padding={[5, 4, 5, 4]} onPress={onClose}><Text size={13} weight={800}>×</Text></Button>
      </RuneView>
      {category === "ride" ? <RuneView layout="grid" columns={RIDE_GROUPS.length} gap={3} label="Ride families">
        {RIDE_GROUPS.map((g) => <Button key={g} tone="ghost" pressed={group === g} padding={[4, 4, 4, 4]} minHeight={30} onPress={() => setGroup(g)}><Text size={12} weight={800}>{RIDE_GROUP_LABEL[g]}</Text></Button>)}
      </RuneView> : null}
      <RuneView scroll maxHeight={phone ? 120 : 132} label="Blueprints">
        <RuneView layout="grid" columns={columns} gap={6}>
          {tickets.map((t) => <Button key={t.id} hint={`item:${t.id}`} pressed={selected === t.id} tooltip={t.blurb} padding={[6, 6, 6, 6]} minHeight={phone ? 50 : 56}
            onPress={() => (t.locked ? onResearch() : commands.run("build.select", { id: t.id }))}>
            <Row gap={5}>{t.color === undefined ? null : <RuneView width={9} height={9} radius={5} fill={t.color} border={{ width: 1, color: INK }} />}<Text size={phone ? 12 : 13} weight={800} align="center" shrink>{t.label}</Text></Row>
            <Text size={12} weight={700} color={t.poor ? BAD : PENCIL}>{t.price}</Text>
          </Button>)}
        </RuneView>
      </RuneView>
      <Text size={12} color={refusal !== null && picked !== undefined ? BAD : PENCIL}>{detail}</Text>
    </Card>
  </RuneView>;
}
