import type { ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { HUD_CORNER_WIDTH } from "@jgengine/react/hud/hudLayout";
import { KitResultScreen } from "@jgengine/react/kitFlow";
import { KitActionBar, KitCount, KitCounts, KitHint, KitVitals } from "@jgengine/react/hud/kitHud";
import { KitButton, KitPanel } from "@jgengine/react/uiKitRoot";
import { HudSlots } from "@jgengine/shell/gameKit";

import { newGame } from "../flow";
import { idea } from "../idea";
import { realmView } from "../town";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
const useRealm = () => useGameStore(realmView, same);
const label = (id: string) => idea.resources.find((resource) => resource.id === id)?.label ?? id;
const price = (cost: Readonly<Record<string, number>>) =>
  Object.entries(cost)
    .map(([id, amount]) => `${amount} ${label(id)}`)
    .join(" + ");

function Realm(): ReactNode {
  const realm = useRealm();
  const beat = idea.beats.find((entry) => entry.id === realm.mission?.missionId) ?? null;
  return (
    <KitVitals
      eyebrow={idea.name}
      title={realm.tierLabel}
      vitals={realm.nextTier === null ? [] : [{ label: `To ${realm.nextTier.label.toLowerCase()}`, value: Math.min(realm.people, realm.nextTier.people), max: realm.nextTier.people, tone: "accent" }]}
      objective={beat === null ? null : { id: beat.id, label: idea.guide.name, title: beat.title, goal: beat.goal }}
    >
      <KitCounts>
        <KitCount id="people" value={realm.people} label={idea.people.label} />
        <KitCount id="working" value={realm.jobs} label="working" />
        <KitCount id="idle" value={realm.idle} label="free" />
      </KitCounts>
    </KitVitals>
  );
}

function Stores(): ReactNode {
  const realm = useRealm();
  return (
    <KitPanel variant="strip">
      <KitCounts>
        {realm.resources.map((resource) => (
          <KitCount
            key={resource.id}
            id={resource.id}
            value={resource.amount}
            label={resource.label}
            detail={`${resource.perMinute >= 0 ? "+" : ""}${resource.perMinute}/min`}
            detailBad={resource.perMinute < 0}
          />
        ))}
      </KitCounts>
    </KitPanel>
  );
}

function Hint(): ReactNode {
  const realm = useRealm();
  const held = idea.buildings.find((building) => building.id === realm.armed) ?? null;
  const text = held !== null ? `Placing ${held.label} - click the ground, right click to stop` : !realm.fed ? `Out of ${label(idea.resources[0]!.id).toLowerCase()}: work has stopped` : null;
  return (
    <KitHint
      text={text}
      tone={held !== null ? "accent" : "bad"}
      banner={{ cue: realm.tier > 1 ? realm.tier : null, title: realm.tierLabel, subtitle: "New buildings unlocked", tone: "good" }}
    />
  );
}

function BuildBar(): ReactNode {
  const ctx = useGameContext();
  const realm = useRealm();
  const have = Object.fromEntries(realm.resources.map((resource) => [resource.id, resource.amount]));
  return (
    <KitActionBar
      kind="build"
      wrapAt={1100}
      actions={idea.buildings.map((building, index) => {
        const state = realm.buildings[index]!;
        const short = Object.entries(building.cost).some(([id, amount]) => (have[id] ?? 0) < amount);
        return {
          id: building.id,
          label: building.label,
          detail: state.unlocked ? price(building.cost) : (idea.tiers[building.tier - 1]?.label ?? ""),
          glyph: index < 9 ? String(index + 1) : undefined,
          variant: realm.armed === building.id ? "primary" : short || !state.unlocked ? "ghost" : "secondary",
          pressed: realm.armed === building.id,
          title: building.blurb,
          onActivate: () => ctx.game.commands.run(`build${index + 1}`, {}),
        };
      })}
      progress={realm.building.map((order) => ({ id: order.id, label: order.label, value: order.progress }))}
    />
  );
}

function Selected(): ReactNode {
  const ctx = useGameContext();
  const realm = useRealm();
  const picked = realm.selected;
  if (picked === null) return null;
  const word = picked.word;
  const does =
    word === null
      ? `Houses ${idea.seat.houses} ${idea.people.label.toLowerCase()}`
      : word.role === "home"
        ? `Houses ${(word.houses ?? 0) * picked.level} ${idea.people.label.toLowerCase()}`
        : word.role === "producer"
          ? `${word.staff ?? 0} work here - ${Math.round((word.rate ?? 0) * picked.level * 60)} ${label(word.makes ?? "").toLowerCase()} a minute`
          : word.blurb;
  return (
    <div style={{ width: HUD_CORNER_WIDTH }}>
      <KitPanel variant="hud" eyebrow={picked.ready ? `Level ${picked.level}` : "Being built"} title={picked.label}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
          <span style={{ opacity: 0.85 }}>{does}</span>
          {word === null ? null : (
            <div style={{ display: "flex", gap: 6 }}>
              {picked.upgrade === null ? null : (
                <KitButton size="sm" glyph="U" data-upgrade="" onClick={() => ctx.game.commands.run("upgrade", {})}>
                  Upgrade <span style={{ opacity: 0.65, marginLeft: 4 }}>{picked.upgrade} {label(idea.coin)}</span>
                </KitButton>
              )}
              {word.role === "crown" ? null : (
                <KitButton size="sm" variant="ghost" glyph="X" onClick={() => ctx.game.commands.run("demolish", {})}>
                  Demolish
                </KitButton>
              )}
            </div>
          )}
        </div>
      </KitPanel>
    </div>
  );
}

function Ending(): ReactNode {
  const ctx = useGameContext();
  const realm = useRealm();
  return (
    <KitResultScreen
      open={realm.won && !realm.dismissed}
      tone="good"
      eyebrow={realm.tierLabel}
      title={`${idea.name} stands`}
      summary={`${realm.people} ${idea.people.label.toLowerCase()} live in what you built.`}
      stats={[
        { label: idea.people.label, value: realm.people },
        { label: "Buildings", value: realm.built },
      ]}
      actions={[
        { id: "keep", label: "Keep building", primary: true },
        { id: "new", label: "New realm" },
      ]}
      onAction={(id) => {
        if (id === "keep") ctx.game.commands.run("dismiss", {});
        else void newGame(ctx);
      }}
    />
  );
}

/** Everything on screen while playing: a few small panels at the edges, the end card over them. */
export function Hud(): ReactNode {
  return <HudSlots storageKey={idea.id} slots={{ topLeft: <Realm />, top: <Hint />, topRight: <Stores />, bottom: <BuildBar />, bottomRight: <Selected /> }} overlay={<Ending />} />;
}
