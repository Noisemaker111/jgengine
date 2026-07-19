import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createSequenceDirector, type SequenceCue } from "@jgengine/core/scene/sequenceDirector";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { CutsceneLetterbox, useSequenceDirector } from "@jgengine/react/cutscene";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

/**
 * The authored timeline. Cue `kind` is a free string the director never reads — this
 * demo happens to use `"camera"` and `"dialogue"`, but a game could name them anything.
 */
type CutscenePayload = { shot: string } | { speaker: string; text: string };

const CUES: readonly SequenceCue<CutscenePayload>[] = [
  { atMs: 0, kind: "camera", payload: { shot: "establishing" }, id: "open" },
  { atMs: 400, kind: "dialogue", payload: { speaker: "Scout", text: "The eastern gate has fallen." }, id: "l1" },
  { atMs: 2600, kind: "dialogue", payload: { speaker: "Captain", text: "Ready the archers — hold this line." }, id: "l2" },
  { atMs: 5200, kind: "dialogue", payload: { speaker: "Scout", text: "They're crossing the bridge!" }, id: "l3" },
  { atMs: 7600, kind: "camera", payload: { shot: "close" }, id: "push-in" },
  { atMs: 8000, kind: "dialogue", payload: { speaker: "Captain", text: "For the wall. Loose!" }, id: "l4" },
];

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "cutscene" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "cutscene" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "cutscene",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const replayButton: CSSProperties = {
  pointerEvents: "auto",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(17,22,30,0.85)",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  padding: "10px 16px",
  cursor: "pointer",
};

function CutsceneUI(): ReactNode {
  // One director per mount, on the real animation clock (performance.now).
  const [director] = useState(() =>
    createSequenceDirector<CutscenePayload>({ cues: CUES, now: () => performance.now() }),
  );
  const [caption, setCaption] = useState<ReactNode>(null);

  // The game (not the director) interprets each cue's free-string kind.
  useEffect(() => {
    return director.onCue(({ cue }) => {
      if (cue.kind === "dialogue" && cue.payload !== undefined && "text" in cue.payload) {
        const { speaker, text } = cue.payload;
        setCaption(
          <span>
            <strong style={{ color: "#7dd3fc" }}>{speaker}:</strong> {text}
          </span>,
        );
      }
    });
  }, [director]);

  const scene = useSequenceDirector(director);

  // Autoplay the cutscene when the demo mounts.
  useEffect(() => {
    director.play();
  }, [director]);

  const cinematic = scene.playing || (!scene.done && scene.firedCount > 0);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <CutsceneLetterbox
        active={cinematic || scene.done}
        caption={caption}
        progress={scene.progress}
        onSkip={() => scene.skip()}
        theme={{ accent: "#7dd3fc" }}
      />
      {scene.done ? (
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)" }}>
          <button
            type="button"
            style={replayButton}
            onClick={() => {
              setCaption(null);
              scene.stop();
              scene.play();
            }}
          >
            ↻ Replay cutscene
          </button>
        </div>
      ) : null}
    </div>
  );
}

export const cutsceneDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: CutsceneUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
