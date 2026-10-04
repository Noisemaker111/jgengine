import {chromium} from '/workspace/JGengine/node_modules/playwright-core';
import {findChromeExecutable} from '/workspace/JGengine/scripts/browser-lib';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const root=import.meta.dir;
const build=await Bun.build({entrypoints:[`${root}/fixture.tsx`],target:'browser',format:'esm'});
if(!build.success)throw Error(build.logs.join('\n'));
const glb='/workspace/JGengine-games/deepward/public/models/imported/deepward/fitter/fitter-salvage-operator.glb';
const bytes=readFileSync(glb);const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:request=>{const p=new URL(request.url).pathname;return p==='/fixture.js'?new Response(build.outputs[0],{headers:{'content-type':'application/javascript'}}):p==='/fitter.glb'?new Response(bytes):new Response('<script type="module" src="/fixture.js"></script>',{headers:{'content-type':'text/html'}})}});
const browser=await chromium.launch({executablePath:findChromeExecutable(),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.port}`);await page.waitForFunction(()=>window.ready);
 const stable=await page.evaluate(()=>window.run(false));const fresh=await page.evaluate(()=>window.run(true));
 const maxDifference=(a,b)=>Math.max(...a.map((n,i)=>Math.abs(n-b[i])));
 const physicalDifference=(a,b)=>({position:Math.max(...a.map((n,i)=>Math.hypot(...n.position.map((v,k)=>v-b[i].position[k])))),rotationRadians:Math.max(...a.map((n,i)=>2*Math.acos(Math.min(1,Math.abs(n.quaternion.reduce((sum,v,k)=>sum+v*b[i].quaternion[k],0))))))});
 const report={label:'actual Deepward Fitter imported rig; real public React hook and manual Fiber frames; numeric pose continuity only, no native appearance claim',glb,glbSha256:createHash('sha256').update(bytes).digest('hex'),cohort:JSON.parse(readFileSync('/workspace/JGengine/.scratch/characters/consumer/height-proportions/candidate-package-manifest.json','utf8')).commit,errors,stable,fresh,metrics:{stableWorldPoseChange:physicalDifference(stable.bonePoses[29],stable.bonePoses[0]),freshWorldPoseChange:physicalDifference(fresh.bonePoses[29],fresh.bonePoses[0]),stableFinalVsFirst:maxDifference(stable.poses[29],stable.poses[0]),freshFinalVsFirst:maxDifference(fresh.poses[29],fresh.poses[0]),finalStableVsFresh:maxDifference(stable.poses[29],fresh.poses[29])}};
 writeFileSync(`${root}/before-f4cbd717-v2.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,stable:{...stable,poses:'stored',bonePoses:'stored',actionTimes:'stored'},fresh:{...fresh,poses:'stored',bonePoses:'stored',actionTimes:'stored'}},null,2));
}finally{await browser.close();server.stop(true)}
