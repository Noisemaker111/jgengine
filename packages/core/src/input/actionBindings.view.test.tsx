/** @jsxImportSource @jgengine/core/ui/jsx */
import { expect, test } from "bun:test";
import { renderToString } from "../ui/jsx/markup";
import { ActionBindingsProvider, useActionBindings } from "./actionBindings.view";
import { allActionCodes } from "./actionBindings";

test("bindings inherit, override and restore independently of presentation",() => {
  function Label() {const codes = useActionBindings()["use"]; return <span>{codes === undefined ? "" : allActionCodes(codes).join("+")}</span>;}
  const result = renderToString(<><Label /><ActionBindingsProvider bindings={{use:["KeyE"]}}><Label /><ActionBindingsProvider bindings={{use:["KeyF"]}}><Label /></ActionBindingsProvider><Label /></ActionBindingsProvider><Label /></>);
  expect(result).toBe("<span></span><span>KeyE</span><span>KeyF</span><span>KeyE</span><span></span>");
});
