import { afterAll, beforeAll, expect, test } from "bun:test";
import { cp, mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";

const scratch=resolve(import.meta.dir,'../../../../.scratch/touch-hud-test');
let browser:Browser, server:ReturnType<typeof Bun.serve>;
beforeAll(async()=>{
  await mkdir(scratch,{recursive:true});
  await mkdir(`${scratch}/node_modules/@jgengine`, {recursive:true});
  for (const pkg of ['react','react-dom']) await symlink(resolve(import.meta.dir,'../../../../packages/react/node_modules',pkg),`${scratch}/node_modules/${pkg}`,'dir');
  for (const pkg of ['react','shell','core']) {
    const destination = `${scratch}/node_modules/@jgengine/${pkg}`;
    await mkdir(destination, {recursive:true});
    await cp(resolve(import.meta.dir,'../../../../packages',pkg,'package.json'),`${destination}/package.json`);
    await cp(resolve(import.meta.dir,'../../../../packages',pkg,'dist'),`${destination}/dist`,{recursive:true});
  }
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {TouchControlsDock} from '@jgengine/shell/touch/TouchControlsOverlay';
    import {SettingsMenu} from '@jgengine/shell/settings/SettingsMenu';
    window.trace={selected:0,codes:[],analog:null};
    const scheme={joystick:{up:'up',down:'down',left:'left',right:'right'},buttons:[],gestures:null,look:false,lookSensitivity:1,style:'minimal',layout:{movement:'bottom-left',actions:'bottom-right',utility:'bottom-center'}};
    const sink={onCodeDown:code=>window.trace.codes.push(code),onCodeUp:()=>{},onAnalog:v=>window.trace.analog=v};
    function Fixture() {
      const [open,setOpen]=useState(false);
      const controller={variant:'panel',actions:[],categories:[{id:'controls',label:'Controls',rows:[],keybinds:[{action:'jump',label:'Jump',bindingLabel:'K',isDefault:true,rebind:()=>{},reset:()=>{}}]}]};
      return <><button id="settings-opener" onClick={()=>setOpen(true)}>Open settings</button>{open&&<SettingsMenu controller={controller} onClose={()=>setOpen(false)}/>}<div style={{position:'fixed',inset:0,pointerEvents:'none'}}>
      <div style={{position:'absolute',inset:0,zIndex:20,pointerEvents:'none'}}><button id="slot" style={{position:'absolute',left:100,bottom:240,width:60,height:44,pointerEvents:'auto'}} onClick={()=>window.trace.selected++}>Slot 2</button></div>
      <TouchControlsDock scheme={scheme} sink={sink}/></div></>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  const script=buildBrowserFixture(`${scratch}/fixture.tsx`);
  const html='<meta name="viewport" content="width=device-width, initial-scale=1"><style>.pointer-events-none{pointer-events:none}.pointer-events-auto{pointer-events:auto}.absolute{position:absolute}.relative{position:relative}.inset-0{inset:0}.touch-none{touch-action:none}.invisible{visibility:hidden}.flex{display:flex}.flex-col{flex-direction:column}.items-center{align-items:center}.justify-center{justify-content:center}.overflow-hidden{overflow:hidden}.z-40{z-index:40}.p-3{padding:12px}.flex-1{flex:1 1 0%}.min-h-0{min-height:0}.shrink-0{flex-shrink:0}</style><div id="root"></div><script src="/fixture.js"></script>';
  server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>new URL(r.url).pathname==='/fixture.js'?new Response(script,{headers:{'Content-Type':'text/javascript'}}):new Response(html,{headers:{'Content-Type':'text/html'}})});
  browser=await chromium.launch({executablePath:findChromeExecutable(),headless:true,args:['--no-sandbox']});
},30000);
afterAll(async()=>{await browser?.close();server?.stop(true);await rm(scratch,{recursive:true,force:true});});

test('native HUD touch wins over the invisible joystick area while exposed movement still works',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await page.goto(`http://127.0.0.1:${server.port}`);await page.locator('#slot').waitFor();
  await page.evaluate(()=>{(document.querySelector('#slot')!.parentElement!.nextElementSibling as HTMLElement).style.zIndex='40'});
  expect(await page.evaluate(()=>document.elementFromPoint(130,582)?.id)).not.toBe('slot');
  await page.evaluate(()=>{(document.querySelector('#slot')!.parentElement!.nextElementSibling as HTMLElement).style.zIndex='auto'});
  expect(await page.evaluate(()=>document.elementFromPoint(130,582)?.id)).toBe('slot');
  await page.touchscreen.tap(130,582);
  expect(await page.evaluate(()=>(window as any).trace.selected)).toBe(1);
  expect(await page.evaluate(()=>(window as any).trace.codes.length)).toBe(0);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:740}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:140,y:740}]});
  expect(await page.evaluate(()=>(window as any).trace.codes)).toContain('touch:right');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(await page.evaluate(()=>(window as any).trace.analog)).toBeNull();
  await page.close();
},30000);


test('shared settings traps Tab, cancels rebind Escape, then restores the opener on close',async()=>{
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.locator('#settings-opener').click();
  const dialog=page.getByRole('dialog',{name:'Settings'});
  await dialog.waitFor();
  await page.getByRole('button',{name:'Close settings'}).focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(()=>document.activeElement?.textContent)).toBe('K');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  expect(await dialog.count()).toBe(1);
  await page.keyboard.press('Escape');
  expect(await dialog.count()).toBe(0);
  expect(await page.evaluate(()=>document.activeElement?.id)).toBe('settings-opener');
  await page.close();
},30000);
