/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useRef, useState } from "@jgengine/core/ui/jsx";

import type { SceneViewDocument } from "@jgengine/core/sceneView/sceneView";

import { Page, PageHero, SectionHeading } from "../components/Layout";
import { seo } from "../lib/seo";
import bench from "../live/smallScene/bench.json";
import house from "../live/smallScene/house.scene.json";
import { definePage } from "../site/routes";

export const Route = definePage({
  head: () =>
    seo({
      title: "Scene view — a small 3D document on any page",
      description:
        "Draw a small scene document (a house, a product, a floor plan) on any canvas with one call: no UI framework, no frame loop, no three.js — under 8 KB gzip.",
      path: "/scene-view",
    }),
  component: SceneViewPage,
});

const MOUNT_CODE = `import { mountSceneView } from "@jgengine/core/sceneView/mount.draw";

const view = mountSceneView(canvas, house, {
  kinds: { "gable-roof": () => import("./gableRoof.draw") },
});
view.update(editedHouse); // redraws only the parts that changed
view.dispose();`;

/** The house with its main roof `rise` meters tall. */
function withRoofRise(rise: number): SceneViewDocument {
  const document = house as SceneViewDocument;
  return {
    ...document,
    volumes: (document.volumes ?? []).map((volume) =>
      volume.id === "main-roof" ? { ...volume, center: { ...volume.center, y: 2.7 + rise / 2 }, halfExtents: { ...volume.halfExtents!, y: rise / 2 } } : volume,
    ),
  };
}

const RISES = [2, 3, 1.2];

type Mode = "view" | "plain";

interface Mounted {
  dispose(): void;
  update?(document: SceneViewDocument): Promise<void>;
}

/** Mounts the house on `canvas` with the scene view or with plain three.js, reporting each frame drawn. */
async function mountHouse(mode: Mode, canvas: HTMLCanvasElement, onDraw: (frames: number) => void): Promise<Mounted> {
  if (mode === "plain") {
    const { drawPlainHouse } = await import("../live/smallScene/plainThree");
    return drawPlainHouse(canvas, withRoofRise(RISES[0]!) as Parameters<typeof drawPlainHouse>[1], onDraw);
  }
  const { mountSceneView } = await import("@jgengine/core/sceneView/mount.draw");
  return mountSceneView(canvas, withRoofRise(RISES[0]!), { kinds: { "gable-roof": () => import("../live/smallScene/gableRoof.draw") }, onDraw });
}

function Stage() {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const mounted = useRef<Mounted | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [frames, setFrames] = useState(0);
  const [rise, setRise] = useState(0);
  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    let live = true;
    setFrames(0);
    setRise(0);
    void mountHouse(mode, element, (count) => { if (live) setFrames(count); }).then((made) => {
      if (live) mounted.current = made;
      else made.dispose();
    });
    return () => {
      live = false;
      mounted.current?.dispose();
      mounted.current = null;
    };
  }, [mode]);
  const raise = () => {
    const next = (rise + 1) % RISES.length;
    setRise(next);
    void mounted.current?.update?.(withRoofRise(RISES[next]!));
  };
  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`rounded-lg border px-3 py-1.5 transition ${mode === value ? "border-accent/40 text-fg" : "border-line text-muted"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-3 flex gap-2 text-sm">{tab("view", "Scene view")}{tab("plain", "Plain three.js")}</div>
      <div key={mode} className="overflow-hidden rounded-xl border border-line" style={{ aspectRatio: "377 / 420" }}>
        <canvas ref={canvas} className="block h-full w-full" aria-label="A house drawn from a scene document; drag to turn it" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <button type="button" onClick={raise} disabled={mode !== "view"} className="rounded-lg border border-line px-3 py-2 text-fg transition hover:border-accent/40 disabled:opacity-40">
          Change the roof pitch
        </button>
        <span className="font-mono text-muted">frames drawn: {frames}</span>
      </div>
      <p className="mt-2 text-sm text-faint">Drag to turn, pinch to zoom. The counter moves only when something changes.</p>
    </div>
  );
}

function Numbers() {
  const [viewer, plain] = bench.pages;
  const rows: [string, string, string][] = [
    ["Downloaded (gzip)", `${viewer!.gzipKB} KB`, `${plain!.gzipKB} KB`],
    ["First frame", `${viewer!.firstFrameMs} ms`, `${plain!.firstFrameMs} ms`],
    ["Draw while turning (median / p95)", `${viewer!.drawMsMedian} / ${viewer!.drawMsP95} ms`, `${plain!.drawMsMedian} / ${plain!.drawMsP95} ms`],
    ["Frames drawn while still (2 s)", `${viewer!.drawsWhileStill}`, `${plain!.drawsWhileStill}`],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-faint">
          <tr><th className="py-2 pr-4 font-normal" /><th className="py-2 pr-4 font-normal">Scene view</th><th className="py-2 font-normal">Plain three.js</th></tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b]) => (
            <tr key={label} className="border-t border-line">
              <td className="py-2 pr-4 text-muted">{label}</td>
              <td className="py-2 pr-4 font-mono text-fg">{a}</td>
              <td className="py-2 font-mono text-fg">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-faint">
        Measured {bench.measured}: Chrome at {bench.device}, median of {bench.runs} loads each. The same house in plain three.js uses
        OrbitControls and draws only on change, the way three.js's own example does. Re-measure with{" "}
        <code className="font-mono">bun scripts/bench-scene-view.ts</code>.
      </p>
    </div>
  );
}

function SceneViewPage() {
  return (
    <Page>
      <PageHero
        eyebrow="Scene view"
        title="A small 3D document on any page"
        blurb="One call draws a scene document on a canvas. No UI framework, no frame loop: it draws when the document, the camera or the size changes, and a still scene costs nothing."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <Stage />
        <div className="mt-14 grid gap-10 lg:grid-cols-2">
          <div className="min-w-0">
            <SectionHeading eyebrow="The code" title="Mount, update, dispose" />
            <pre className="mt-6 overflow-x-auto rounded-xl border border-line bg-sunken p-4 text-[13px] leading-relaxed text-fg"><code>{MOUNT_CODE}</code></pre>
          </div>
          <div className="min-w-0">
            <SectionHeading eyebrow="Measured" title="Next to plain three.js" />
            <div className="mt-6"><Numbers /></div>
          </div>
        </div>
      </section>
    </Page>
  );
}
