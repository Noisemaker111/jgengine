import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { WorldMapSurface } from "@jgengine/core/map/map.view";
import type { MarkerKindStyle, MarkerView } from "@jgengine/core/map/markers";
import { EntityPreview } from "@jgengine/core/render/EntityPreview.draw";
import { GameSlider } from "@jgengine/core/ui/slider.view";
import { useGameContext } from "@jgengine/react/provider";

import { BODIES, cleanLook, DEFAULT_LOOK, HEIGHT, NAME_LIMIT, START_REGIONS, type SurvivorLook } from "../character";
import { islandBake } from "../islandMap";
import { entityModels } from "../models";

const PANEL: CSSProperties = {
  background: "linear-gradient(180deg, #1d2a2fee, #121a1ef2)",
  border: "1px solid #6fb7c955",
  borderRadius: 6,
  padding: 16,
  color: "#e8f1f2",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  boxShadow: "0 12px 40px #000a",
};
const HEADING: CSSProperties = { fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8fd3e2", fontWeight: 800 };
const CHOICE: CSSProperties = { background: "#1f3a40", color: "#e8f1f2", border: "1px solid #6fb7c966", borderRadius: 4, padding: "6px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left" };
const PICKED: CSSProperties = { ...CHOICE, background: "#2f7d8f", border: "1px solid #8fe3f2" };
const DIFFICULTY_COLOR = { Easy: "#7fd67f", Medium: "#e7c84a", Hard: "#ef6b5b" } as const;

const REGION_KINDS: Record<string, MarkerKindStyle> = {
  region: { id: "region", color: "#e8f1f2", glyph: "●", priority: 50 },
  picked: { id: "picked", color: "#5cc8dc", glyph: "★", priority: 90 },
};

/**
 * ARK's survivor creation, then its spawn screen, on one page over the island: name, body and height on
 * the left with the survivor shown as made, the spawn regions on the island map and in a list on the right.
 * Every change shows on the survivor at once; Wake up applies it and starts the run.
 */
export function CharacterCreator({ begin, back }: { begin: () => void; back: () => void }): ReactNode {
  const ctx = useGameContext();
  const [look, setLook] = useState<SurvivorLook>(DEFAULT_LOOK);
  const [name, setName] = useState("");
  const choose = (patch: Partial<SurvivorLook>) => setLook((current) => cleanLook({ ...current, ...patch }));
  useEffect(() => {
    ctx.scene.entity.update(ctx.player.userId, { look: look.body, size: look.height });
  }, [ctx, look.body, look.height]);
  const leave = () => {
    ctx.scene.entity.update(ctx.player.userId, { look: null, size: 1 });
    back();
  };
  const bake = useMemo(() => islandBake(ctx), [ctx]);
  const marks: MarkerView[] = useMemo(
    () => START_REGIONS.map((region) => ({ id: region.id, kind: region.id === look.region ? "picked" : "region", label: region.label, position: [region.position[0], 0, region.position[2]] as const })),
    [look.region],
  );
  const pickNearest = (x: number, z: number) => {
    const nearest = [...START_REGIONS].sort((a, b) => Math.hypot(a.position[0] - x, a.position[2] - z) - Math.hypot(b.position[0] - x, b.position[2] - z))[0];
    if (nearest !== undefined) choose({ region: nearest.id });
  };
  const player = entityModels["player"];
  const wake = () => {
    void ctx.game.commands.run("createSurvivor", { ...look, name });
    begin();
  };
  return (
    <div data-creator="" style={{ position: "absolute", inset: 0, display: "flex", gap: 18, alignItems: "center", justifyContent: "center", padding: 24, background: "radial-gradient(circle at 50% 40%, #0000 30%, #000a)" }}>
      <div style={{ ...PANEL, width: 330 }}>
        <span style={HEADING}>Create your survivor</span>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Name
          <input
            data-creator-name=""
            value={name}
            placeholder={DEFAULT_LOOK.name}
            maxLength={NAME_LIMIT}
            onChange={(event) => setName(event.target.value)}
            style={{ background: "#0d1417", color: "#e8f1f2", border: "1px solid #6fb7c966", borderRadius: 4, padding: "6px 8px", fontSize: 14 }}
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {BODIES.map((body) => (
            <button key={body.id} data-creator-body={body.id} style={look.body === body.id ? PICKED : CHOICE} onClick={() => choose({ body: body.id })}>
              {body.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
          <span style={{ width: 52 }}>Height</span>
          <GameSlider label="Height" value={look.height} min={HEIGHT.min} max={HEIGHT.max} step={0.01} valueText={`${Math.round(look.height * 100)}%`} onChange={(height) => choose({ height })} />
          <span style={{ width: 40, textAlign: "right" }}>{Math.round(look.height * 100)}%</span>
        </div>
        <div data-creator-preview="" style={{ height: 300, borderRadius: 4, overflow: "hidden", border: "1px solid #6fb7c933" }}>
          {player === undefined ? null : (
            <EntityPreview model={player} instanceId={ctx.player.userId} faceCamera mood="studio" backdrop="#14222a" cameraPosition={[0, 1.1, 4.6]} cameraTarget={[0, 0.92, 0]} fov={30} />
          )}
        </div>
      </div>
      <div style={{ ...PANEL, width: 470 }}>
        <span style={HEADING}>Choose where you wake</span>
        <WorldMapSurface markers={marks} bounds={bake.mapBounds} background={bake.background} width={438} kindStyles={REGION_KINDS} onWorldClick={([x, z]) => pickNearest(x, z)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
          {START_REGIONS.map((region) => (
            <button key={region.id} data-creator-region={region.id} style={{ ...(look.region === region.id ? PICKED : CHOICE), display: "flex", justifyContent: "space-between" }} onClick={() => choose({ region: region.id })}>
              <span>{region.label}</span>
              <span style={{ color: DIFFICULTY_COLOR[region.difficulty] }}>{region.difficulty}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <button data-creator-back="" style={CHOICE} onClick={leave}>
            Back
          </button>
          <button data-creator-wake="" style={{ ...PICKED, padding: "8px 22px", fontSize: 15 }} onClick={wake}>
            Wake up
          </button>
        </div>
      </div>
    </div>
  );
}
