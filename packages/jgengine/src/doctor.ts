import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { findWorkspaceRoot, readPackageJson, type PackageJson } from "./pkg";
import { IN_REPO_TSCONFIG_PATHS } from "./templates";

export interface Finding {
  ok: boolean;
  label: string;
  fix?: string;
}

const SKELETON_FILES = new Set(["game.config.ts", "index.tsx", "main.tsx", "loop.ts", "world.ts", "index.css"]);
const SKELETON_DIRS = new Set(["game"]);

function allEngineDeps(pkg: PackageJson): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([name]) => name.startsWith("@jgengine/")),
  );
}

/** @internal */
export function diagnose(dir: string): Finding[] {
  const findings: Finding[] = [];
  const pkg = readPackageJson(join(dir, "package.json"));
  if (pkg === null) {
    return [{ ok: false, label: "package.json readable", fix: `no package.json found in ${dir}` }];
  }

  const engineDeps = allEngineDeps(pkg);
  findings.push({
    ok: Object.keys(engineDeps).length > 0,
    label: "@jgengine/* dependencies declared",
    fix: "add the engine: bun add @jgengine/core @jgengine/react @jgengine/shell (or npx jgengine create for a fresh game)",
  });

  findings.push({
    ok: pkg.type === "module",
    label: 'package.json "type": "module"',
    fix: 'the engine is ESM-only; set "type": "module"',
  });

  findings.push({
    ok: pkg.scripts?.dev !== undefined,
    label: '"dev" script present',
    fix: 'add "dev": "vite" so the standalone harness can launch',
  });

  const ranges = new Set(Object.values(engineDeps).filter((range) => range !== "workspace:*"));
  findings.push({
    ok: ranges.size <= 1,
    label: "@jgengine/* versions aligned",
    fix: `mixed ranges ${[...ranges].join(", ")} — pin every @jgengine/* package to one version, or run npx jgengine versions`,
  });

  const workspaceRoot = findWorkspaceRoot(dir);
  const usesWorkspaceProtocol = Object.values(engineDeps).includes("workspace:*");
  findings.push({
    ok: !usesWorkspaceProtocol || workspaceRoot !== null,
    label: "workspace:* deps only inside a workspace",
    fix: "this game was copied out of the engine monorepo — replace workspace:* with published versions (e.g. ^0.8.0)",
  });

  const tsconfigPath = join(dir, "tsconfig.json");
  const tsconfig = existsSync(tsconfigPath)
    ? (JSON.parse(readFileSync(tsconfigPath, "utf8")) as { compilerOptions?: { paths?: Record<string, string[]> } })
    : null;
  findings.push({ ok: tsconfig !== null, label: "tsconfig.json present", fix: "scaffold one with npx jgengine create" });
  const paths = tsconfig?.compilerOptions?.paths ?? {};
  const monorepoPaths = Object.values(paths)
    .flat()
    .filter((target) => target.includes("../../packages/"));
  const danglingPaths = monorepoPaths.filter((target) => !existsSync(resolve(dir, target.replace(/\/\*$/, ""))));
  findings.push({
    ok: danglingPaths.length === 0,
    label: "tsconfig paths resolve",
    fix: `paths point into a missing engine checkout (${danglingPaths[0] ?? ""}) — outside the monorepo, drop compilerOptions.paths and rely on node_modules`,
  });
  if (workspaceRoot !== null && usesWorkspaceProtocol) {
    const missing = Object.entries(IN_REPO_TSCONFIG_PATHS).filter(([alias, target]) => paths[alias]?.[0] !== target[0]);
    findings.push({
      ok: missing.length === 0,
      label: "in-repo tsconfig paths match the canonical game shape",
      fix: `add compilerOptions.paths ${missing.map(([alias]) => `"${alias}"`).join(", ")} per Games/* (see check-game-shape)`,
    });
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  const usesReactPkg = engineDeps["@jgengine/react"] !== undefined || engineDeps["@jgengine/shell"] !== undefined;
  if (usesReactPkg) {
    findings.push({
      ok: deps.react !== undefined && deps["react-dom"] !== undefined,
      label: "react + react-dom present for @jgengine/react|shell",
      fix: "bun add react react-dom (@jgengine/react peers on react ^19)",
    });
  }
  if (engineDeps["@jgengine/shell"] !== undefined) {
    findings.push({
      ok: deps.three !== undefined && deps["@react-three/fiber"] !== undefined,
      label: "three + @react-three/fiber present for @jgengine/shell",
      fix: "bun add three @react-three/fiber (the shell renders through react-three-fiber)",
    });
  }

  const cssPath = join(dir, "src", "index.css");
  if (existsSync(cssPath)) {
    const css = readFileSync(cssPath, "utf8");
    const usesTailwind = css.includes("tailwindcss");
    const coversReact = /@source\s+"[^"]*(@jgengine\/react|packages\/react)/.test(css);
    const coversShell = /@source\s+"[^"]*(@jgengine\/shell|packages\/shell)/.test(css);
    findings.push({
      ok: !usesTailwind || (coversReact && coversShell),
      label: "Tailwind @source covers @jgengine/react and @jgengine/shell",
      fix: 'without @source entries for the engine UI packages, HUD classes are silently not generated and the UI renders unstyled — add @source "../node_modules/@jgengine/react/dist" and "../node_modules/@jgengine/shell/dist" to src/index.css',
    });
  } else {
    findings.push({ ok: false, label: "src/index.css present", fix: "the standalone harness needs src/index.css importing tailwindcss" });
  }

  findings.push({
    ok: existsSync(join(dir, "index.html")),
    label: "index.html present (standalone harness)",
    fix: "scaffold shape: index.html at the game root mounts /src/main.tsx",
  });
  findings.push({
    ok: existsSync(join(dir, "vite.config.ts")),
    label: "vite.config.ts present",
    fix: "the standalone harness runs on vite with @vitejs/plugin-react + @tailwindcss/vite",
  });

  const configPath = join(dir, "src", "game.config.ts");
  const configOk = existsSync(configPath) && /from\s+["']@jgengine\/shell\/defineGame["']/.test(readFileSync(configPath, "utf8"));
  findings.push({
    ok: configOk,
    label: 'src/game.config.ts defines the game via defineGame from "@jgengine/shell/defineGame"',
    fix: "game.config.ts is the single entry — export const game = defineGame({...})",
  });

  const barrelPath = join(dir, "src", "index.tsx");
  const barrelOk =
    existsSync(barrelPath) &&
    /\bgame\b/.test(readFileSync(barrelPath, "utf8").match(/export\s*\{[^}]*\}/g)?.join(" ") ?? "");
  findings.push({
    ok: barrelOk,
    label: "src/index.tsx re-exports { game }",
    fix: 'add: export { game } from "./game.config";',
  });

  const srcDir = join(dir, "src");
  if (existsSync(srcDir)) {
    const strays = readdirSync(srcDir).filter((entry) => {
      const isDir = statSync(join(srcDir, entry)).isDirectory();
      return isDir ? !SKELETON_DIRS.has(entry) : !SKELETON_FILES.has(entry);
    });
    findings.push({
      ok: strays.length === 0,
      label: "src/ holds only the skeleton (everything else under src/game/)",
      fix: `move ${strays.join(", ")} under src/game/ — src/ is only game.config.ts, index.tsx, main.tsx, loop.ts, world.ts, index.css`,
    });
  }

  if (!usesWorkspaceProtocol) {
    findings.push({
      ok: existsSync(join(dir, "node_modules", "@jgengine", "core")),
      label: "engine installed in node_modules",
      fix: "run bun install (or npm install)",
    });
  }

  return findings;
}

/** @internal */
export function runDoctor(argv: string[]): number {
  const dir = resolve(argv.find((arg) => !arg.startsWith("--")) ?? ".");
  const findings = diagnose(dir);
  for (const finding of findings) {
    if (finding.ok) {
      console.log(`  ✓ ${finding.label}`);
    } else {
      console.log(`  ✗ ${finding.label}`);
      if (finding.fix !== undefined) console.log(`      fix: ${finding.fix}`);
    }
  }
  const failed = findings.filter((finding) => !finding.ok).length;
  console.log(failed === 0 ? "\ndoctor: all clear" : `\ndoctor: ${failed} problem(s) found`);
  return failed === 0 ? 0 : 1;
}
