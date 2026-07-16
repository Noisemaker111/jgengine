/**
 * Add `@internal` to exported functions/classes/const-arrow in listed files.
 * Idempotent. Usage: bun scripts/mark-internal.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const FILES = [
  "packages/shell/src/camera/rigMath.ts",
  "packages/shell/src/camera/orbitCameraMath.ts",
  "packages/shell/src/camera/inspectionCameraMath.ts",
  "packages/shell/src/camera/cameraBlendMath.ts",
  "packages/shell/src/camera/shakeChannelMath.ts",
  "packages/shell/src/camera/rigResolve.ts",
  "packages/shell/src/camera/fovPreference.ts",
  "packages/shell/src/terrain/terrainMath.ts",
  "packages/shell/src/terrain/grassGeometry.ts",
  "packages/shell/src/terrain/random.ts",
  "packages/shell/src/terrain/grassMaterial.ts",
  "packages/shell/src/terrain/grassBudget.ts",
  "packages/shell/src/terrain/terrainDetailMaterial.ts",
  "packages/shell/src/terrain/soilPatchMaterial.ts",
  "packages/shell/src/weather/weatherMath.ts",
  "packages/shell/src/weather/weatherGeometry.ts",
  "packages/shell/src/weather/weatherUniforms.tsx",
  "packages/shell/src/weather/fireSpreadPose.ts",
  "packages/shell/src/environment/groundPadMath.ts",
  "packages/shell/src/environment/daylightCycle.ts",
  "packages/shell/src/environment/skyLightingPolicy.ts",
  "packages/shell/src/world/entityPose.ts",
  "packages/shell/src/world/floatTextStyle.ts",
  "packages/shell/src/world/telegraphPulse.ts",
  "packages/shell/src/world/worldBarSamples.ts",
  "packages/shell/src/world/projectileTimers.ts",
  "packages/shell/src/scatter/scatterModels.ts",
  "packages/shell/src/render/modelRender.ts",
  "packages/shell/src/render/resolveModel.ts",
  "packages/shell/src/water/OceanConfig.ts",
  "packages/shell/src/materialOverride.ts",
  "packages/shell/src/devtools/collisionDebugMath.ts",
  "packages/shell/src/devtools/collisionDebug.ts",
  "packages/core/src/devtools/tunableSchema.ts",
  "packages/core/src/devtools/rewriteTunables.ts",
  "packages/core/src/devtools/saveEndpoint.ts",
  "packages/core/src/devtools/transformTunables.ts",
  "packages/core/src/runtime/hostPersistence.ts",
  "packages/core/src/runtime/snapshot.ts",
  "packages/core/src/runtime/worldReplication.ts",
  "packages/core/src/runtime/worldChannel.ts",
  "packages/core/src/runtime/worldMirror.ts",
  "packages/core/src/runtime/commandRunner.ts",
  "packages/core/src/runtime/hostedGameRunner.ts",
  "packages/core/src/runtime/hostedWorldSession.ts",
  "packages/core/src/runtime/gameRuntime.ts",
  "packages/core/src/runtime/save.ts",
  "packages/core/src/runtime/motionIntents.ts",
  "packages/core/src/runtime/cameraDirector.ts",
  "packages/core/src/runtime/worldSnapshot.ts",
  "packages/core/src/runtime/visibility.ts",
  "packages/core/src/editor/document.ts",
  "packages/core/src/editor/commands.ts",
  // pure math / tiny utils
  "packages/core/src/anim/easing.ts",
  "packages/core/src/anim/oscillator.ts",
  "packages/core/src/math/scalar.ts",
  "packages/core/src/world/vec2.ts",
  "packages/core/src/world/geometry.ts",
  "packages/core/src/world/polyline.ts",
  "packages/core/src/visibility/bounds.ts",
  "packages/core/src/visibility/frustum.ts",
  "packages/core/src/render/color.ts",
  "packages/core/src/movement/cameraRig.ts",
  "packages/core/src/movement/movementModel.ts",
  "packages/core/src/game/snapshotHistory.ts",
  // Batch 3 — demote unadopted genre packs (keep session/ring public; claudecraft uses it)
  "packages/core/src/sensor/concealment.ts",
  "packages/core/src/sensor/freezeMonitor.ts",
  "packages/core/src/sensor/frustumSensor.ts",
  "packages/core/src/sensor/hiddenStateProbe.ts",
  "packages/core/src/sensor/recordingBuffer.ts",
  "packages/core/src/sensor/replayLoop.ts",
  "packages/core/src/sensor/revealQuery.ts",
  "packages/core/src/sensor/visionCone.ts",
  "packages/core/src/tactics/fallingGrid.ts",
  "packages/core/src/tactics/predictiveQuery.ts",
  "packages/core/src/tactics/snapshot.ts",
  "packages/core/src/tactics/surface.ts",
  "packages/core/src/tactics/tacticalGrid.ts",
  "packages/core/src/board/laneBoard.ts",
  "packages/core/src/board/timelineBoard.ts",
  "packages/core/src/session/contestedChannel.ts",
  "packages/core/src/session/extraction.ts",
  "packages/core/src/session/roles.ts",
  "packages/core/src/session/roundState.ts",
  "packages/core/src/multiplayer/lagCompensation.ts",
  "packages/core/src/multiplayer/simultaneousCommit.ts",
  "packages/core/src/multiplayer/combatSnapshot.ts",
  "packages/core/src/multiplayer/presenceModel.ts",
  "packages/core/src/ai/crowd.ts",
  "packages/core/src/ai/flock.ts",
  "packages/core/src/ai/laneSelect.ts",
  "packages/core/src/ai/mobBrain.ts",
  "packages/core/src/ai/jobBoard.ts",
  "packages/core/src/ai/heatSystem.ts",
  "packages/core/src/ai/spawnPoint.ts",
  "packages/core/src/ai/groupAssist.ts",
  // more pure / under-taught game primitives (still importable; out of skill api.md)
  "packages/core/src/inventory/slotModel.ts",
  "packages/core/src/inventory/shapedGrid.ts",
  "packages/core/src/economy/sharedWallet.ts",
  "packages/core/src/economy/techTree.ts",
  "packages/core/src/crafting/crop.ts",
  "packages/core/src/time/beatClock.ts",
  "packages/core/src/time/idleProgress.ts",
  "packages/core/src/time/calendarClock.ts",
  "packages/core/src/movement/dash.ts",
  "packages/core/src/world/walls.ts",
  "packages/core/src/world/terrain.ts",
  "packages/core/src/world/buildings.ts",
  "packages/core/src/world/vegetation.ts",
  "packages/core/src/puzzle/nonogram.ts",
  "packages/core/src/puzzle/cellGrid.ts",
  "packages/core/src/puzzle/fallingPiece.ts",
  "packages/core/src/combat/animationState.ts",
  "packages/core/src/scene/entityStats.ts",
  "packages/core/src/scene/colliders.ts",
  "packages/core/src/scene/objectQuery.ts",
  "packages/core/src/ui/gameLayout.ts",
  "packages/core/src/ui/hudLayout.ts",
  "packages/shell/src/environment/Daylight.tsx",
  "packages/shell/src/camera/shakeChannel.ts",
  "packages/shell/src/devtools/agentBridge.ts",
  "packages/shell/src/devtools/DevtoolsOverlay.tsx",
  "packages/jgengine/src/pkg.ts",
  "packages/jgengine/src/templates.ts",
  "packages/jgengine/src/desktop.ts",
  "packages/jgengine/src/doctor.ts",
  "packages/jgengine/src/create.ts",
  "packages/jgengine/src/skills.ts",
  "packages/github/src/client.ts",
  "packages/github/src/calendar.ts",
  "packages/github/src/analytics.ts",
  "packages/github/src/wire.ts",
  "packages/github/src/source.ts",
  "packages/assets/src/download.ts",
  "packages/assets/src/cli/pull.ts",
  "packages/assets/src/cli/paths.ts",
  "packages/ws/src/protocol.ts",
];

const EXPORT_LINE =
  /^(\s*)export\s+(?:async\s+)?(?:function|class)\s+\w+|^(\s*)export\s+const\s+\w+\s*=\s*(?:async\s*)?(?:\(|function\b)/;

function precedingHasInternal(lines: readonly string[], exportIndex: number): boolean {
  for (let i = exportIndex - 1; i >= 0 && i >= exportIndex - 30; i--) {
    const t = (lines[i] ?? "").trim();
    if (t.includes("@internal")) return true;
    if (t.startsWith("export ")) return false;
    if (t === "*/") {
      for (let j = i; j >= Math.max(0, i - 40); j--) {
        if ((lines[j] ?? "").includes("@internal")) return true;
        if ((lines[j] ?? "").includes("/**")) return false;
      }
      return false;
    }
  }
  return false;
}

function markFile(rel: string): number {
  const path = join(ROOT, rel);
  if (!existsSync(path)) {
    console.warn(`skip missing: ${rel}`);
    return 0;
  }
  const original = readFileSync(path, "utf8");
  const lines = original.split(/\n/);
  const out: string[] = [];
  let marked = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (EXPORT_LINE.test(line) && !precedingHasInternal(lines, i)) {
      const indent = line.match(/^\s*/)?.[0] ?? "";
      // Attach into existing JSDoc if the previous non-empty line closes one
      let merged = false;
      for (let j = out.length - 1; j >= 0; j--) {
        const t = (out[j] ?? "").trim();
        if (t === "") continue;
        if (t.endsWith("*/") && !t.includes("@internal")) {
          // open the block: insert tag before close
          const close = out[j] ?? "";
          const closeIndent = close.match(/^\s*/)?.[0] ?? indent;
          if (close.trim() === "*/") {
            out[j] = `${closeIndent} * @internal`;
            out.push(`${closeIndent} */`);
          } else {
            // ` * blah */` single-line end — expand
            out[j] = close.replace(/\s*\*\/\s*$/, "");
            out.push(`${closeIndent} * @internal`);
            out.push(`${closeIndent} */`);
          }
          merged = true;
        }
        break;
      }
      if (!merged) {
        out.push(`${indent}/** @internal */`);
      }
      marked++;
    }
    out.push(line);
  }

  if (marked === 0) return 0;
  writeFileSync(path, out.join("\n"));
  return marked;
}

let files = 0;
let total = 0;
for (const file of FILES) {
  const n = markFile(file);
  if (n > 0) {
    files++;
    total += n;
    console.log(`${file}: +${n}`);
  }
}
console.log(`done: ${files} files, ${total} exports tagged`);
