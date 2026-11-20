import { expect, test } from "bun:test";
import { portBrowserFixture, portSource, stampJsxSource } from "./port-react-ui";

test("browser fixtures pack UI and stop borrowing React peers", () => {
  const source = '  for (const peer of ["react", "react-dom"]) await symlink(resolve("../react/node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");\n  await installPublicPackages(scratch, ["core", "react", "shell"]);\n';
  const result = portBrowserFixture(source);
  expect(result).not.toContain("symlink");
  expect(result).toContain('["core", "ui", "shell"]');
  expect(portBrowserFixture(result)).toBe(result);
  expect(portSource("fixture.test.ts", source).text).toBe(result);
});

test("a component ports both React and SDK UI imports and stays unchanged on rerun", () => {
  const source = 'import { useState, type ReactNode } from "react";\nimport { GameProvider } from "@jgengine/core/ui.view";\nimport { useGameContext } from "@jgengine/core/ui/provider.view";\nexport function Counter(): ReactNode { const [n] = useState(1); return <GameProvider>{n}</GameProvider>; }';
  const first = portSource("Counter.tsx", source);
  expect(first.notes).toEqual([]);
  expect(first.text).toContain('from "@jgengine/core/ui/jsx"');
  expect(first.text).toContain('from "@jgengine/core/ui.view"');
  expect(first.text).toContain('from "@jgengine/core/ui/provider.view"');
  const stamped = stampJsxSource(first.text);
  expect(stampJsxSource(portSource("Counter.tsx", stamped).text)).toBe(stamped);
});

