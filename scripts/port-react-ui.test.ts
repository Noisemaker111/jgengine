import { expect, test } from "bun:test";
import { portBrowserFixture, portProjectConfig, portSdkImports, portSource, stampJsxSource } from "./port-react-ui";

test("game declarations select the renamed UI package and remain stable on rerun", () => {
  const before = '{"id":"react","engine":["assets","core","react","shell"]}';
  const after = '{"id":"react","engine":["assets","core","ui","shell"]}';
  expect(portProjectConfig(before)).toBe(after);
  expect(portProjectConfig(after)).toBe(after);
});

test("browser fixtures pack UI and stop borrowing React peers", () => {
  const source = '  for (const peer of ["react", "react-dom"]) await symlink(resolve("../react/node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");\n  await installPublicPackages(scratch, ["core", "react", "shell"]);\n';
  const result = portBrowserFixture(source);
  expect(result).not.toContain("symlink");
  expect(result).toContain('["core", "ui", "shell"]');
  expect(portBrowserFixture(result)).toBe(result);
  expect(portSource("fixture.test.ts", source).text).toBe(result);
});

test("a component ports both React and SDK UI imports and stays unchanged on rerun", () => {
  const source = 'import { useState, type ReactNode } from "react";\nimport { GameProvider } from "@jgengine/react";\nimport { useGameContext } from "@jgengine/react/provider";\nexport function Counter(): ReactNode { const [n] = useState(1); return <GameProvider>{n}</GameProvider>; }';
  const first = portSource("Counter.tsx", source);
  expect(first.notes).toEqual([]);
  expect(first.text).toContain('from "@jgengine/core/ui/jsx"');
  expect(first.text).toContain('from "@jgengine/ui"');
  expect(first.text).toContain('from "@jgengine/ui/provider"');
  const stamped = stampJsxSource(first.text);
  expect(stampJsxSource(portSource("Counter.tsx", stamped).text)).toBe(stamped);
});

test("a framework host retains React while its SDK imports and mocks move", () => {
  const source = 'import React from "react";\nimport { mount } from "@jgengine/react";\nmock.module("@jgengine/react/hooks", () => ({}));\nconst code = `import { useGameContext } from "@jgengine/react/provider";`;\nimport unrelated from "@jgengine/reactivity";';
  const result = portSdkImports(source);
  expect(result).toContain('import React from "react"');
  expect(result).toContain('from "@jgengine/ui"');
  expect(result).toContain('mock.module("@jgengine/ui/hooks"');
  expect(result).toContain('from "@jgengine/ui/provider"');
  expect(result).toContain('from "@jgengine/reactivity"');
  expect(portSdkImports(result)).toBe(result);
});
