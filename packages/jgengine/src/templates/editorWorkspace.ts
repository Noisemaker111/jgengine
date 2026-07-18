import type { TemplateFile } from "./types";

const editorPackageJson = (engineVersion: string) => `${JSON.stringify(
  {
    name: "jgengine-editor-workspace",
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: {
      "@jgengine/core": `^${engineVersion}`,
      "@jgengine/editor": `^${engineVersion}`,
      "@jgengine/node": `^${engineVersion}`,
      "@jgengine/react": `^${engineVersion}`,
      "@jgengine/shell": `^${engineVersion}`,
      "@react-three/drei": "^10.7.7",
      "@react-three/fiber": "^9.5.0",
      react: "19.2.3",
      "react-dom": "19.2.3",
      three: "^0.182.0",
    },
    devDependencies: {
      "@tailwindcss/vite": "^4.0.15",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      "@types/three": "^0.182.0",
      "@vitejs/plugin-react": "^4.3.4",
      tailwindcss: "^4.0.15",
      vite: "^6.2.2",
    },
  },
  null,
  2,
)}
`;

const editorIndexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>JGengine Scene Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const editorIndexCss = `@import "tailwindcss";
@source "../node_modules/@jgengine/react/dist";
@source "../node_modules/@jgengine/shell/dist";
@source "../node_modules/@jgengine/editor/dist";

html,
body,
#root {
  height: 100%;
  margin: 0;
  background: #0a0a0a;
}
`;

const editorViteConfig = `import { editorHostPlugin } from "@jgengine/node/editorHostPlugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The folder to author scenes for is handed in by \`jgengine editor <dir>\`.
const dir = process.env.JG_EDITOR_DIR ?? process.cwd();
const assetsDir = process.env.JG_EDITOR_ASSETS;

export default defineConfig({
  plugins: [react(), tailwindcss(), editorHostPlugin({ dir, assetsDir })],
  clearScreen: false,
});
`;

const editorMainTsx = `import "./index.css";

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { EditorLayersInput } from "@jgengine/core/editor/index";
import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import { StandaloneEditor, type StandaloneAsset } from "@jgengine/editor";

installSaveEndpoint("/__jgengine/save", "standalone");

interface Manifest {
  scene: EditorLayersInput | null;
  assets: StandaloneAsset[];
}

function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    fetch("/__jgengine/manifest")
      .then((response) => response.json() as Promise<Manifest>)
      .then(setManifest)
      .catch(() => setManifest({ scene: null, assets: [] }));
  }, []);
  if (manifest === null) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading workspace…
      </div>
    );
  }
  return (
    <StandaloneEditor
      sceneId="standalone"
      scene={manifest.scene ?? undefined}
      assets={manifest.assets}
    />
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("main: missing #root mount element");
createRoot(root).render(<App />);
`;

/**
 * Files for the standalone scene-editor workspace `jgengine editor` scaffolds and serves: a Vite app
 * that mounts `@jgengine/editor`'s `StandaloneEditor` over a blank world, loading the target folder's
 * `editor.scene.json` and models through the `@jgengine/node` editor host plugin.
 * @internal
 */
export function editorScaffold(engineVersion: string): TemplateFile[] {
  return [
    { path: "index.html", contents: editorIndexHtml },
    { path: "package.json", contents: editorPackageJson(engineVersion) },
    { path: "vite.config.ts", contents: editorViteConfig },
    { path: "src/index.css", contents: editorIndexCss },
    { path: "src/main.tsx", contents: editorMainTsx },
  ];
}
