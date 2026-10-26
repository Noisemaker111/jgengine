import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";

setDefaultTimeout(30_000);

const scratch=resolve(import.meta.dir,'../../../../.scratch/touch-hud-test');
let browser:Browser, server:ReturnType<typeof Bun.serve>;
beforeAll(async()=>{
  await mkdir(`${scratch}/node_modules`,{recursive:true});
  for (const pkg of ['react','react-dom']) await symlink(resolve(import.meta.dir,'../../../../packages/react/node_modules',pkg),`${scratch}/node_modules/${pkg}`,'dir');
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {TouchControlsDock} from '@jgengine/shell/touch/TouchControlsOverlay';
    import {SettingsMenu} from '@jgengine/core/settings/SettingsMenu.draw';
    window.trace={selected:0,codes:[],analog:null};
    const btn=(action,kind='primary',shape='circle')=>({action,label:action.replace(/([a-z])([A-Z])/g,'$1 $2'),icon:null,kind,shape,anchor:null,image:null});
    const shooter=location.hash==='#shooter';
    const scheme=shooter
      ?{joystick:{up:'up',down:'down',left:'left',right:'right'},buttons:['fire','aim','jump','reload','crouch','interact','sprint','throwGrenade','useHealthVial'].map(a=>btn(a,'primary',a==='fire'?'trigger':'circle')).concat([btn('openSkills','utility')]),slots:['selectSlot1','selectSlot2','selectSlot3','selectSlot4'],gestures:null,look:true,lookSensitivity:1,style:'glass',layout:{movement:'bottom-left',actions:'bottom-right',utility:'bottom-right'}}
      :{joystick:{up:'up',down:'down',left:'left',right:'right'},buttons:[],slots:[],gestures:null,look:false,lookSensitivity:1,style:'minimal',layout:{movement:'bottom-left',actions:'bottom-right',utility:'bottom-right'}};
    const sink={onCodeDown:code=>window.trace.codes.push(code),onCodeUp:()=>{},onAnalog:v=>window.trace.analog=v};
    function Fixture() {
      const [open,setOpen]=useState(false);
      const controller={variant:'panel',actions:[],categories:[{id:'controls',label:'Controls',rows:[],keybinds:[{action:'jump',label:'Jump',bindingLabel:'K',isDefault:true,rebind:()=>{},reset:()=>{}}]}]};
      if (shooter) return <div style={{position:'fixed',inset:0,pointerEvents:'none'}}><TouchControlsDock scheme={scheme} sink={sink}/></div>;
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
}, 60_000);
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


test('shooter dock: one big main button in the corner, icon faces, collapsed slots, multi-touch',async()=>{
  const page=await browser.newPage({viewport:{width:740,height:360},hasTouch:true,isMobile:true});
  await page.goto(`http://127.0.0.1:${server.port}/#shooter`);await page.locator('[data-touch-main]').waitFor();
  const boxes=await page.evaluate(()=>[...document.querySelectorAll('[data-touch-action]')].map(el=>{const r=el.getBoundingClientRect();return {action:el.getAttribute('data-touch-action'),main:el.hasAttribute('data-touch-main'),chip:el.hasAttribute('data-touch-chip'),text:(el.textContent??'').trim(),x:r.x,y:r.y,w:r.width,h:r.height};}));
  const main=boxes.find(b=>b.main)!;
  expect(main.action).toBe('fire');
  expect(main.x).toBeGreaterThan(740*0.7);
  expect(main.y+main.h).toBeGreaterThan(360-main.h-40);
  const secondaries=boxes.filter(b=>!b.main&&!b.chip);
  expect(secondaries).toHaveLength(8);
  for (const b of secondaries) { expect(b.w).toBeLessThan(main.w*0.75); expect(b.x).toBeGreaterThan(740/2); expect(b.y).toBeGreaterThanOrEqual(0); }
  for (const b of boxes) expect(b.text.length).toBeLessThanOrEqual(3);
  const chips=boxes.filter(b=>b.chip);
  expect(chips.map(b=>b.action)).toEqual(['selectSlot1','selectSlot2','selectSlot3','selectSlot4','openSkills']);
  const slot2=chips[1]!;
  await page.touchscreen.tap(slot2.x+slot2.w/2,slot2.y+slot2.h/2);
  expect(await page.evaluate(()=>(window as any).trace.codes)).toContain('touch:selectSlot2');
  const aim=secondaries.find(b=>b.action==='aim')!;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:main.x+main.w/2,y:main.y+main.h/2,id:1},{x:aim.x+aim.w/2,y:aim.y+aim.h/2,id:2}]});
  const codes=await page.evaluate(()=>(window as any).trace.codes);
  expect(codes).toContain('touch:fire');
  expect(codes).toContain('touch:aim');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
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
