import { expect, test } from "bun:test";
import { portSdkImports, portSource, stampJsxSource } from "./port-react-ui";

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
