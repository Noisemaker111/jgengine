import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { cp, mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { findChromeExecutable } from "../../../scripts/browser-lib";

const scratch = resolve(import.meta.dir, "../../../.scratch/scroll-rail-test");
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
  await mkdir(scratch, { recursive: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, {recursive:true});
  for (const pkg of ['react','react-dom']) await symlink(resolve(import.meta.dir,'../../../packages/react/node_modules',pkg),`${scratch}/node_modules/${pkg}`,'dir');
  for (const pkg of ['react','shell','core']) {
    const destination = `${scratch}/node_modules/@jgengine/${pkg}`;
    await mkdir(destination, {recursive:true});
    await cp(resolve(import.meta.dir,'../../../packages',pkg,'package.json'),`${destination}/package.json`);
    await cp(resolve(import.meta.dir,'../../../packages',pkg,'dist'),`${destination}/dist`,{recursive:true});
  }
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(entry, `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {ScrollRail, ActionBar} from '@jgengine/react';
    function Fixture() {
      const [selected,select] = useState('Game'), [removed,remove] = useState(false);
      return <><div style={{width:300}}><ScrollRail label="categories">{['Game','Graphics','Audio','Accessibility','Controls'].map(label=><button key={label} style={{flexShrink:0,width:110,height:44}} onClick={()=>select(label)}>{label}</button>)}</ScrollRail></div>
      <output>{selected}</output><ActionBar onActivate={select} defs={removed ? [{id:'new',label:'New'}] : [{id:'old',label:'Old'}]}/><button id="replace" onClick={()=>remove(true)}>Replace actions</button></>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  const build = await Bun.build({ entrypoints: [entry], target: "browser" });
  if (!build.success) throw new Error(build.logs.join("\n"));
  const script = await build.outputs[0]!.text();
  server = Bun.serve({hostname:"127.0.0.1",port:0,fetch:r=>new URL(r.url).pathname === '/fixture.js'
    ? new Response(script,{headers:{'Content-Type':'text/javascript'}})
    : new Response('<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script src="/fixture.js"></script>',{headers:{'Content-Type':'text/html'}})});
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless:true, args:['--no-sandbox'] });
  page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
},30000);
beforeEach(async()=>{await page.goto(`http://127.0.0.1:${server.port}`);await page.getByRole('button',{name:'Show later categories'}).waitFor();});
afterAll(async()=>{await browser?.close();server?.stop(true);await rm(scratch,{recursive:true,force:true});});

test('native touch navigation makes the clipped last control reachable',async()=>{
  const later = page.getByRole('button',{name:'Show later categories'});
  for(let i=0;i<4 && !(await later.isDisabled());i++) await later.tap();
  await page.getByRole('button',{name:'Controls',exact:true}).tap();
  expect(await page.locator('output').textContent()).toBe('Controls');
  expect(await later.isDisabled()).toBe(true);
  await page.getByRole('button',{name:'Show earlier categories'}).tap();
  expect(await later.isDisabled()).toBe(false);
},30000);

test('keyboard focus reveals clipped controls and resize retires unnecessary navigation',async()=>{
  await page.getByRole('button',{name:'Controls',exact:true}).focus();
  const visible = await page.getByRole('button',{name:'Controls',exact:true}).evaluate(el=>{
    const rail=el.parentElement!.getBoundingClientRect(), rect=el.getBoundingClientRect();
    return rect.left>=rail.left-1 && rect.right<=rail.right+1;
  });
  expect(visible).toBe(true);
  await page.keyboard.press('Space');
  expect(await page.locator('output').textContent()).toBe('Controls');
  await page.locator('[data-scroll-rail]').evaluate(el=>{(el.parentElement as HTMLElement).style.width='800px'});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Show later categories"]')===null);
},30000);

test('a replaced focused action leaves the hotbar reachable by Tab and Enter',async()=>{
  await page.getByRole('button',{name:'Old',exact:true}).focus();
  await page.getByRole('button',{name:'Replace actions'}).click();
  expect(await page.getByRole('button',{name:'New',exact:true}).getAttribute('tabindex')).toBe('0');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(()=>document.activeElement?.getAttribute('data-action-id'))).toBe('new');
  await page.keyboard.press('Enter');
  expect(await page.locator('output').textContent()).toBe('new');
},30000);
