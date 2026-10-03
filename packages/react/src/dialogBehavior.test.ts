import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

const scratch = resolve(import.meta.dir, "../../../.scratch/dialog-focus-test");
let browser: Browser;
let page: Page;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await symlink(resolve(import.meta.dir, "../node_modules"), `${scratch}/node_modules`, "dir");
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(entry, `
    import React, { StrictMode, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { createPortal, flushSync } from 'react-dom';
    import { useDialogBehavior } from '../../packages/react/src/dialogBehavior';
    import { ModalHost } from '../../packages/react/src/modals';
    import { createModalStack } from '../../packages/core/src/ui/modalStack';
    const stack = createModalStack();
    function Dialog({id, close, preferred, replacement, children}) {
      const ref = useDialogBehavior({open:true, onClose:close, initialFocus:preferred});
      return <section key={replacement} ref={ref} id={id} role="dialog" aria-modal="true" tabIndex={-1}>{children}</section>;
    }
    function Fixture() {
      const [open,setOpen] = useState(false), [child,setChild] = useState(false);
      const [blocked,setBlocked] = useState(false), [empty,setEmpty] = useState(false);
      const [preferred,setPreferred] = useState(false);
      const [replacement,setReplacement] = useState(0), [childReplacement,setChildReplacement] = useState(0);
      window.fixture = {
        open: (options={}) => flushSync(()=>{setBlocked(!!options.blocked);setEmpty(!!options.empty);setPreferred(options.preferred);setOpen(true)}),
        close: ()=>flushSync(()=>setOpen(false)), child: ()=>flushSync(()=>setChild(true)),
        closeChild: ()=>flushSync(()=>setChild(false)), clear: ()=>flushSync(()=>{setOpen(false);setChild(false)}),
        push: (id)=>flushSync(()=>stack.push({id,kind:id})), pop: ()=>flushSync(()=>stack.pop()),
        depth: ()=>stack.depth(),
        replace: ()=>flushSync(()=>setReplacement(value=>value+1)),
        replaceChild: ()=>flushSync(()=>setChildReplacement(value=>value+1)),
      };
      return <><button id="opener">Open</button><button id="outside">Outside</button>
        {open && <Dialog id="parent" replacement={replacement} close={()=>{if(!blocked)setOpen(false)}} preferred={preferred===true?()=>document.getElementById('last'):preferred}>
          {!empty && <><button id="hidden" hidden>Hidden</button><button id="disabled" disabled>Disabled</button>
            <fieldset disabled><button>Fieldset disabled</button></fieldset><div inert><button>Inert</button></div>
            <button style={{visibility:'hidden'}}>Invisible</button><button tabIndex={-1}>Programmatic only</button>
            <button id="first">First</button><button id="child-opener" onClick={()=>setChild(true)}>Nested</button><button id="last">Last</button></>}
        </Dialog>}
        {child && createPortal(<Dialog id="child" replacement={childReplacement} close={()=>setChild(false)}><button id="child-first">Child first</button><button id="child-last">Child last</button></Dialog>,document.body)}
        <ModalHost stack={stack}>{record=><button id={'stack-'+record.id}>{record.kind}</button>}</ModalHost>
      </>;
    }
    createRoot(document.getElementById('root')).render(location.search==='?strict'?<StrictMode><Fixture/></StrictMode>:<Fixture/>);
  `);
  const script = buildBrowserFixture(entry);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js"
    ? new Response(script, { headers: { "Content-Type": "text/javascript" } })
    : new Response('<div id="root"></div><script src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
}, 30000);

beforeEach(async () => {
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => typeof (window as any).fixture !== "undefined");
  await page.locator("#opener").focus();
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

async function focused(id: string) {
  await page.waitForFunction(expected => document.activeElement?.id === expected, id, { timeout: 2000 });
  expect(await page.evaluate(() => document.activeElement?.id)).toBe(id);
}

async function open(options = {}) {
  await page.evaluate(value => (window as any).fixture.open(value), options);
}

describe("controlled dialog DOM behavior", () => {
  for (const strict of [false, true]) {
    test(`replacing an open dialog root preserves trapping and the original opener${strict ? " in StrictMode" : ""}`, async () => {
      if (strict) {
        await page.goto(`http://127.0.0.1:${server.port}/?strict`);
        await page.waitForFunction(() => typeof (window as any).fixture !== "undefined");
        await page.locator("#opener").focus();
      }
      await open(); await focused("first");
      await page.locator("#last").focus();
      await page.evaluate(() => (window as any).fixture.replace()); await focused("first");
      await page.keyboard.press("Shift+Tab"); await focused("last");
      await page.keyboard.press("Tab"); await focused("first");
      await page.keyboard.press("Escape"); await focused("opener");
      await page.keyboard.press("Tab"); await focused("outside");
    });
  }

  test("replacing a portalled inner root retains the parent opener and topmost ownership", async () => {
    await open(); await focused("first");
    await page.locator("#child-opener").click(); await focused("child-first");
    await page.evaluate(() => (window as any).fixture.replaceChild()); await focused("child-first");
    await page.keyboard.press("Shift+Tab"); await focused("child-last");
    await page.keyboard.press("Escape"); await focused("child-opener");
    await page.keyboard.press("Escape"); await focused("opener");
  });

  test("replacing the parent root keeps a portalled child active and returns to the new parent", async () => {
    await open(); await focused("first");
    await page.locator("#child-opener").click(); await focused("child-first");
    await page.evaluate(() => (window as any).fixture.replace()); await focused("child-first");
    await page.keyboard.press("Shift+Tab"); await focused("child-last");
    await page.keyboard.press("Escape"); await focused("parent");
    await page.keyboard.press("Tab"); await focused("first");
    await page.keyboard.press("Escape"); await focused("opener");
  });

  test("skips hidden, inert and disabled controls; cycles Tab and restores the opener", async () => {
    await open(); await focused("first");
    await page.keyboard.press("Shift+Tab"); await focused("last");
    await page.keyboard.press("Tab"); await focused("first");
    await page.keyboard.press("Tab"); await focused("child-opener");
    await page.keyboard.press("Escape"); await focused("opener");
    await page.keyboard.press("Tab"); await focused("outside");
  });

  test("honors initial focus and traps an empty dialog at its root", async () => {
    await open({ preferred: true }); await focused("last");
    await page.keyboard.press("Escape"); await focused("opener");
    await open({ preferred: "root" }); await focused("parent");
    await page.keyboard.press("Tab"); await focused("first");
    await page.keyboard.press("Escape"); await focused("opener");
    await open({ empty: true }); await focused("parent");
    await page.keyboard.press("Tab"); await focused("parent");
    await page.keyboard.press("Shift+Tab"); await focused("parent");
  });

  test("a rejected Escape close retains focus behavior until the caller closes", async () => {
    await open({ blocked: true }); await focused("first");
    await page.keyboard.press("Escape"); await focused("first");
    await page.keyboard.press("Shift+Tab"); await focused("last");
    await page.evaluate(() => (window as any).fixture.close()); await focused("opener");
  });

  test("only the portalled inner dialog handles Escape and restores its parent opener", async () => {
    await open(); await focused("first");
    await page.locator("#child-opener").click(); await focused("child-first");
    await page.keyboard.press("Shift+Tab"); await focused("child-last");
    await page.keyboard.press("Tab"); await focused("child-first");
    await page.keyboard.press("Escape"); await focused("child-opener");
    expect(await page.locator("#parent").count()).toBe(1);
    await page.keyboard.press("Escape"); await focused("opener");
  });

  test("parent cleanup does not steal inner focus, and preserves the final return target", async () => {
    await open(); await focused("first");
    await page.locator("#child-opener").click(); await focused("child-first");
    await page.evaluate(() => (window as any).fixture.close()); await focused("child-first");
    await page.keyboard.press("Escape"); await focused("opener");
  });

  test("ModalHost still resolves the top record and restores focus after stacked content closes", async () => {
    await page.evaluate(() => (window as any).fixture.push("pause")); await focused("stack-pause");
    await page.evaluate(() => (window as any).fixture.push("confirm")); await focused("stack-confirm");
    await page.keyboard.press("Escape"); await focused("stack-pause");
    expect(await page.evaluate(() => (window as any).fixture.depth())).toBe(1);
    await page.keyboard.press("Escape"); await focused("opener");
  });
});
