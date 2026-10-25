import type { ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitObjective, KitResultScreen } from "@jgengine/react/kitFlow";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { newGame } from "../flow";
import { idea } from "../idea";
import { realmView } from "../town";
import { Count, Counts, HudFrame, PANEL_WIDTH } from "./HudFrame";

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
    <div style={{ width: PANEL_WIDTH, pointerEvents: "none" }}>
      <KitPanel variant="hud" eyebrow={idea.name} title={realm.tierLabel}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Counts>
            <Count id="people" value={realm.people} label={idea.people.label} />
            <Count id="working" value={realm.jobs} label="working" />
            <Count id="idle" value={realm.idle} label="free" />
          </Counts>
          {realm.nextTier === null ? null : (
            <KitMeter size="sm" label={`To ${realm.nextTier.label.toLowerCase()}`} value={Math.min(realm.people, realm.nextTier.people)} max={realm.nextTier.people} tone="accent" readout />
          )}
        </div>
      </KitPanel>
      {beat === null ? null : (
        <div style={{ marginTop: 8 }}>
          <KitObjective eyebrow={idea.guide.name} title={beat.title} steps={[{ id: beat.id, label: beat.goal }]} progressKey={beat.id} />
        </div>
      )}
    </div>
  );
}

function Stores(): ReactNode {
  const realm = useRealm();
  return (
    <KitPanel variant="strip">
      <Counts>
        {realm.resources.map((resource) => (
          <span key={resource.id} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
            <Count id={resource.id} value={resource.amount} label={resource.label} />
            <span style={{ fontSize: 10, opacity: 0.7, color: resource.perMinute < 0 ? "#ff8a7a" : undefined }}>
              {resource.perMinute >= 0 ? "+" : ""}
              {resource.perMinute}/min
            </span>
          </span>
        ))}
      </Counts>
    </KitPanel>
  );
}

function Hint(): ReactNode {
  const realm = useRealm();
  const held = idea.buildings.find((building) => building.id === realm.armed) ?? null;
  const text = held !== null ? `Placing ${held.label} - click the ground, right click to stop` : !realm.fed ? `Out of ${label(idea.resources[0]!.id).toLowerCase()}: work has stopped` : null;
  return (
    <div style={{ pointerEvents: "none" }}>
      {text === null ? null : (
        <KitPanel variant="strip" tone={held !== null ? "accent" : "bad"}>
          <span style={{ fontWeight: 700, letterSpacing: "0.06em", fontSize: 13 }}>{text}</span>
        </KitPanel>
      )}
      <KitBanner cue={realm.tier > 1 ? realm.tier : null} title={realm.tierLabel} subtitle="New buildings unlocked" tone="good" />
    </div>
  );
}

function BuildBar(): ReactNode {
  const ctx = useGameContext();
  const realm = useRealm();
  const have = Object.fromEntries(realm.resources.map((resource) => [resource.id, resource.amount]));
  return (
    <KitPanel variant="strip">
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center", maxWidth: 1100 }}>
        {idea.buildings.map((building, index) => {
          const state = realm.buildings[index]!;
          const short = Object.entries(building.cost).some(([id, amount]) => (have[id] ?? 0) < amount);
          const tier = idea.tiers[building.tier - 1]?.label ?? "";
          return (
            <KitButton
              key={building.id}
              data-build={building.id}
              size="sm"
              variant={realm.armed === building.id ? "primary" : short || !state.unlocked ? "ghost" : "secondary"}
              pressed={realm.armed === building.id}
              glyph={index < 9 ? String(index + 1) : undefined}
              title={building.blurb}
              onClick={() => ctx.game.commands.run(`build${index + 1}`, {})}
            >
              {building.label}
              <span style={{ opacity: 0.65, marginLeft: 4, fontSize: "0.85em" }}>{state.unlocked ? price(building.cost) : tier}</span>
            </KitButton>
          );
        })}
        {realm.building.map((order) => (
          <KitMeter key={order.id} label={order.label} value={order.progress} max={1} size="sm" style={{ width: 96 }} />
        ))}
      </div>
    </KitPanel>
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
    <div style={{ width: PANEL_WIDTH }}>
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
  return <HudFrame slots={{ topLeft: <Realm />, top: <Hint />, topRight: <Stores />, bottom: <BuildBar />, bottomRight: <Selected /> }} overlay={<Ending />} />;
}
