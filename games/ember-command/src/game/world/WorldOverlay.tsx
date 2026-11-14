/** @jsxImportSource @jgengine/core/ui/jsx */
import { useSyncExternalStore } from "@jgengine/core/ui/jsx";
import { WorldNameplates, type NameplateSample } from "@jgengine/core/hud/WorldHud.draw";
import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { WeatherLayer } from "@jgengine/core/weather/WeatherLayer.draw";

import { hudStore } from "../hudStore";
import { session } from "../session";
import { YardHazards } from "./YardHazards.draw";

const FRIENDLY = "#ffd23f";
const HOSTILE = "#b18cff";

/** Commander-view floating health bars: sunflower gold over the red colony, violet over the black ants
 * and their wasps, wider for nests. Replaces the shell's always-red bars so friend/foe reads at a glance
 * against a green lawn. */
function renderBar(sample: NameplateSample) {
  if (sample.percent === null) return null; // food, dressing and other statless entities
  const unit = session.units.get(sample.id);
  const hostile = unit?.faction === "enemy";
  const building = unit?.kind === "building";
  const width = building ? 66 : unit?.catalogId === "hero" ? 44 : 30;
  return (
    <div style={{ transform: "translate(-50%, -100%)" }}>
      <div
        style={{
          width,
          height: building ? 7 : 5,
          borderRadius: 3,
          background: "rgba(10,20,6,0.65)",
          border: "1px solid rgba(0,0,0,0.75)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${sample.percent * 100}%`, height: "100%", background: hostile ? HOSTILE : FRIENDLY }} />
      </div>
    </div>
  );
}

const readRain = () => hudStore.get().hazards.rain;

/** The rain storm, drawn while the hazard clock says it pours. */
function Storm() {
  const raining = useSyncExternalStore(hudStore.subscribe, readRain, readRain);
  if (!raining) return null;
  return <WeatherLayer mode="rain" intensity={0.9} wind={[2, 0, 1]} />;
}

/** VFX overlay: faction health bars, the pheromone film, the sprinkler, the mower, the beam and rain.
 * The authored yard (hose, patio stones, grass forests) is auto-mounted by `defineGame({ editorLayers })`. */
export function LawnOrderWorldOverlay() {
  return <>
    <SceneCaptureBinding />
    <YardHazards />
    <Storm />
    <WorldNameplates statId="health" maxDistance={999} tickMs={100} renderNameplate={renderBar} />
  </>;
}
