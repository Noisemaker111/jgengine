import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import type {
  CharacterFishColorId,
  CharacterHoodieColorId,
  CharacterLook,
  CharacterPantsColorId,
  CharacterShoesColorId,
} from "@/user/playerCharacterFigure";
import {
  CHARACTER_FISH_COLORS,
  CHARACTER_HOODIE_COLORS,
  CHARACTER_PANTS_COLORS,
  CHARACTER_SHOES_COLORS,
  DEFAULT_CHARACTER_LOOK,
} from "@/user/playerCharacterFigure";
import { PlayerCharacterFigure } from "@/user/components/PlayerCharacterFigure";

type CharacterViewAngle = "front" | "back" | "diagonal" | "fixed-front";

interface CharacterViewProps {
  yaw: number;
  look: CharacterLook;
  walkPhase?: number;
  isWalking: boolean;
  label: string;
  /** Explicit camera placement — do not infer from body yaw (model face is +Z at yaw 0). */
  viewAngle?: CharacterViewAngle;
}

function CameraRig({ position, target }: { position: [number, number, number]; target: [number, number, number] }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(target[0], target[1], target[2]);
    camera.updateProjectionMatrix();
  }, [camera, position, target]);
  return null;
}

const CAMERA_BY_ANGLE: Record<CharacterViewAngle, [number, number, number]> = {
  front: [0, 1.32, -3.15],
  "fixed-front": [0, 1.32, -3.15],
  back: [0, 1.35, 3.2],
  diagonal: [2.25, 1.45, -2.15],
};

function CharacterView({ yaw, look, walkPhase, isWalking, label, viewAngle = "front" }: CharacterViewProps) {
  const camPos = CAMERA_BY_ANGLE[viewAngle];
  const camTarget: [number, number, number] = [0, 1.15, 0];

  return (
    <div className="flex flex-col">
      <div className="mb-1 text-center text-xs font-semibold tracking-[2px] text-brand-cream/70">{label}</div>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a100e]">
        <Canvas
          shadows
          camera={{ fov: 32, near: 0.1, far: 30 }}
          gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
          style={{ width: "100%", height: "560px", background: "#0f1715" }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <CameraRig position={camPos} target={camTarget} />

            <color attach="background" args={["#0f1715"]} />

            {/* Studio lighting tuned for form + details (not game mood) */}
            <ambientLight intensity={0.65} color="#f4ecdd" />
            <hemisphereLight args={["#5fc2a8", "#1f2b28", 0.35]} />
            <directionalLight
              castShadow
              position={[1.8, 3.8, 2.2]}
              intensity={1.1}
              color="#f8f1e0"
              shadow-mapSize={[1024, 1024]}
              shadow-camera-near={1}
              shadow-camera-far={20}
              shadow-camera-left={-2}
              shadow-camera-right={2}
              shadow-camera-top={3}
              shadow-camera-bottom={-1}
            />
            <directionalLight position={[-2.2, 1.8, -1.5]} intensity={0.35} color="#a8c5b8" />
            {/* Subtle rim */}
            <directionalLight position={[0, 2, -3.5]} intensity={0.28} color="#e0d3b8" />

            <group rotation={[0, yaw, 0]}>
              <PlayerCharacterFigure
                look={look}
                scale={1.0}
                walkPhase={walkPhase}
                isWalking={isWalking}
              />
            </group>

            {/* Simple floor disc */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
              <circleGeometry args={[1.1, 64]} />
              <meshStandardMaterial
                color="#111a18"
                roughness={0.92}
                metalness={0}
              />
            </mesh>

            {/* Very faint grid for scale reference */}
            <gridHelper args={[2.2, 11, "#1a2623", "#1a2623"]} position={[0, 0.002, 0]} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

const FISH_OPTIONS = Object.keys(CHARACTER_FISH_COLORS) as CharacterFishColorId[];
const HOODIE_OPTIONS = Object.keys(CHARACTER_HOODIE_COLORS) as CharacterHoodieColorId[];
const PANTS_OPTIONS = Object.keys(CHARACTER_PANTS_COLORS) as CharacterPantsColorId[];
const SHOES_OPTIONS = Object.keys(CHARACTER_SHOES_COLORS) as CharacterShoesColorId[];

export function CharacterDevPreview() {
  // Parse URL params for reproducible shots
  const initialParams = useMemo(() => {
    if (typeof window === "undefined") return { ...DEFAULT_CHARACTER_LOOK, phase: 0.85, frozen: true };
    const sp = new URLSearchParams(window.location.search);
    const fish = (sp.get("fish") as CharacterFishColorId) || DEFAULT_CHARACTER_LOOK.fish;
    const hoodie = (sp.get("hoodie") as CharacterHoodieColorId) || DEFAULT_CHARACTER_LOOK.hoodie;
    const pants = (sp.get("pants") as CharacterPantsColorId) || DEFAULT_CHARACTER_LOOK.pants;
    const shoes = (sp.get("shoes") as CharacterShoesColorId) || DEFAULT_CHARACTER_LOOK.shoes;
    const phaseStr = sp.get("phase");
    const phase = phaseStr !== null ? parseFloat(phaseStr) : 0.85;
    const frozen = sp.get("frozen") !== "false";
    return {
      fish: FISH_OPTIONS.includes(fish) ? fish : DEFAULT_CHARACTER_LOOK.fish,
      hoodie: HOODIE_OPTIONS.includes(hoodie) ? hoodie : DEFAULT_CHARACTER_LOOK.hoodie,
      pants: PANTS_OPTIONS.includes(pants) ? pants : DEFAULT_CHARACTER_LOOK.pants,
      shoes: SHOES_OPTIONS.includes(shoes) ? shoes : DEFAULT_CHARACTER_LOOK.shoes,
      phase: isNaN(phase) ? 0.85 : phase,
      frozen,
    };
  }, []);

  const [fish, setFish] = useState<CharacterFishColorId>(initialParams.fish);
  const [hoodie, setHoodie] = useState<CharacterHoodieColorId>(initialParams.hoodie);
  const [pants, setPants] = useState<CharacterPantsColorId>(initialParams.pants);
  const [shoes, setShoes] = useState<CharacterShoesColorId>(initialParams.shoes);
  const [phase, setGaitPhase] = useState<number>(initialParams.phase);
  const [frozen, setFrozen] = useState<boolean>(initialParams.frozen);

  const look: CharacterLook = useMemo(() => ({ fish, hoodie, pants, shoes }), [fish, hoodie, pants, shoes]);
  const walkPhase = frozen ? phase : undefined;
  const isWalking = !frozen;

  // Keep URL in sync for copy-paste / script reproducibility
  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set("fish", fish);
    sp.set("hoodie", hoodie);
    sp.set("pants", pants);
    sp.set("shoes", shoes);
    if (frozen) {
      sp.set("phase", phase.toFixed(2));
      sp.set("frozen", "true");
    } else {
      sp.set("frozen", "false");
    }
    const newUrl = `${window.location.pathname}?${sp.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }, [fish, hoodie, pants, shoes, phase, frozen]);

  function setPreset(preset: "default" | "teal-lab" | "neutral" | "stride") {
    if (preset === "default") {
      setFish("beta_blue");
      setHoodie("cream");
      setPants("blue");
      setShoes("white");
      setGaitPhase(0.9);
      setFrozen(true);
    } else if (preset === "teal-lab") {
      setFish("emerald");
      setHoodie("teal");
      setPants("charcoal");
      setShoes("teal");
      setGaitPhase(0.0);
      setFrozen(true);
    } else if (preset === "neutral") {
      setGaitPhase(0.0);
      setFrozen(true);
    } else if (preset === "stride") {
      setGaitPhase(1.4);
      setFrozen(true);
    }
  }

  return (
    <div className="bg-[#0a100e] px-5 py-6 text-brand-cream">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-mono text-[11px] tracking-[3px] text-brand-teal/80">DEV / ITERATION TOOL</div>
            <div className="text-2xl font-semibold tracking-tight">Player Character — Front + Diagonals + Back</div>
          </div>
          <div className="text-right text-xs opacity-70">
            Edit code in <span className="font-mono">PlayerCharacterFigure.tsx</span><br />
            then re-run screenshot script or refresh
          </div>
        </div>

        {/* Controls */}
        <div className="mb-3 rounded-xl border border-white/10 bg-[#111a18] p-3 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="mr-2 text-xs uppercase tracking-widest text-white/50">Presets</span>
            <button onClick={() => setPreset("default")} className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/5">Default fishbowl</button>
            <button onClick={() => setPreset("teal-lab")} className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/5">Lab teal kit</button>
            <button onClick={() => setPreset("neutral")} className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/5">Neutral pose</button>
            <button onClick={() => setPreset("stride")} className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/5">Stride pose</button>

            <div className="ml-auto flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={frozen}
                  onChange={(e) => setFrozen(e.target.checked)}
                />
                <span>Frozen pose</span>
              </label>
              <button
                onClick={() => setFrozen(false)}
                className="rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-white/5"
              >
                Live walk
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2">
              <span className="w-12 text-xs text-white/60">Fish</span>
              <select value={fish} onChange={(e) => setFish(e.target.value as CharacterFishColorId)} className="rounded border border-white/20 bg-black/30 px-2 py-1 text-sm">
                {FISH_OPTIONS.map((option) => (
                  <option key={option} value={option}>{CHARACTER_FISH_COLORS[option].label}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2">
              <span className="w-12 text-xs text-white/60">Hoodie</span>
              <select value={hoodie} onChange={(e) => setHoodie(e.target.value as CharacterHoodieColorId)} className="rounded border border-white/20 bg-black/30 px-2 py-1 text-sm">
                {HOODIE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{CHARACTER_HOODIE_COLORS[option].label}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2">
              <span className="w-12 text-xs text-white/60">Pants</span>
              <select value={pants} onChange={(e) => setPants(e.target.value as CharacterPantsColorId)} className="rounded border border-white/20 bg-black/30 px-2 py-1 text-sm">
                {PANTS_OPTIONS.map((option) => (
                  <option key={option} value={option}>{CHARACTER_PANTS_COLORS[option].label}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2">
              <span className="w-12 text-xs text-white/60">Shoes</span>
              <select value={shoes} onChange={(e) => setShoes(e.target.value as CharacterShoesColorId)} className="rounded border border-white/20 bg-black/30 px-2 py-1 text-sm">
                {SHOES_OPTIONS.map((option) => (
                  <option key={option} value={option}>{CHARACTER_SHOES_COLORS[option].label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-1 items-center gap-2 min-w-[260px]">
              <span className="w-12 text-xs text-white/60">Phase</span>
              <input
                type="range"
                min={0}
                max={Math.PI * 2}
                step={0.01}
                value={phase}
                onChange={(e) => { setGaitPhase(parseFloat(e.target.value)); setFrozen(true); }}
                className="w-full accent-brand-teal"
              />
              <span className="w-12 font-mono text-[11px] tabular-nums">{phase.toFixed(2)}</span>
            </label>

            <div className="text-xs text-white/60">
              Current: <span className="font-medium text-brand-cream">{CHARACTER_FISH_COLORS[fish].label}</span> fish •{" "}
              <span className="font-medium text-brand-cream">{CHARACTER_HOODIE_COLORS[hoodie].label}</span> hoodie
              {frozen ? ` • phase ${phase.toFixed(2)}` : " • LIVE"}
            </div>
          </div>

          <div className="mt-2 text-[10px] text-white/50">
            Tip: Use URL params for scripts — e.g. <span className="font-mono">?fish=gold&amp;hoodie=teal&amp;pants=blue&amp;shoes=white&amp;phase=0.9&amp;frozen=true</span>
          </div>
        </div>

        {/* Views for instant comparison */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CharacterView
            yaw={Math.PI}
            viewAngle="front"
            look={look}
            walkPhase={walkPhase}
            isWalking={isWalking}
            label="FRONT (face)"
          />
          <CharacterView
            yaw={Math.PI + (22 * Math.PI) / 180}
            viewAngle="diagonal"
            look={look}
            walkPhase={walkPhase}
            isWalking={isWalking}
            label="DIAGONAL (+22°)"
          />
          <CharacterView
            yaw={Math.PI + 0.82}
            viewAngle="diagonal"
            look={look}
            walkPhase={walkPhase}
            isWalking={isWalking}
            label="DIAGONAL (+47°)"
          />
          <CharacterView
            yaw={Math.PI}
            viewAngle="back"
            look={look}
            walkPhase={walkPhase}
            isWalking={isWalking}
            label="BACK (hood)"
          />
        </div>

        <div
          data-testid="look-direction-proof"
          className="mt-8"
        >
          <div className="mb-2 font-mono text-[11px] tracking-[3px] text-brand-teal/80">
            LOOK DIRECTION PROOF (body rotationY — same as camera yaw in-game)
          </div>
          <p className="mb-3 text-xs text-white/55">
            Camera stays fixed in front; only the body rotates. In-game this rotationY is synced from where you look, not walk direction.
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <CharacterView viewAngle="fixed-front" yaw={Math.PI} look={look} walkPhase={0} isWalking={false} label="FACE CAMERA (π)" />
            <CharacterView viewAngle="fixed-front" yaw={Math.PI / 2} look={look} walkPhase={0} isWalking={false} label="FACE RIGHT (π/2)" />
            <CharacterView viewAngle="fixed-front" yaw={-Math.PI / 2} look={look} walkPhase={0} isWalking={false} label="FACE LEFT (-π/2)" />
            <CharacterView viewAngle="fixed-front" yaw={0} look={look} walkPhase={0} isWalking={false} label="FACE AWAY (0)" />
          </div>
        </div>

        <div
          data-testid="idle-walk-proof"
          className="mt-8"
        >
          <div className="mb-2 font-mono text-[11px] tracking-[3px] text-brand-teal/80">
            IDLE vs WALKING (isWalking flag)
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CharacterView viewAngle="fixed-front" yaw={Math.PI} look={look} walkPhase={0} isWalking={false} label="IDLE — still pose" />
            <CharacterView viewAngle="fixed-front" yaw={Math.PI} look={look} walkPhase={0.95} isWalking label="WALKING — stride" />
          </div>
        </div>

        <div className="mt-3 text-center text-[10px] text-white/40">
          Lighting is studio for iteration (different from in-game). Change code → refresh or re-run screenshotter.
        </div>
      </div>
    </div>
  );
}
