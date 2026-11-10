import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitForPage("window.__jgRuneStage?.unavailable === false && window.__jgRuneStage.ui?.rects.size > 0");
    await f.see(/phone/i);
    await f.click("Phone");
    await f.waitForPage("document.querySelector('.hh-city')?.clientHeight > 0");
    await f.page(`(() => {
      const city=document.querySelector('.hh-city');
      const button=document.querySelector('button[aria-label="down"]');
      window.__scrollDebug={clicks:0,calls:[]};
      button.addEventListener('click',()=>window.__scrollDebug.clicks++);
      const scroll=city.scrollBy.bind(city);
      city.scrollBy=(...args)=>{window.__scrollDebug.calls.push(args); return scroll(...args);};
    })()`);
    const inspect = `(() => {
      const city=document.querySelector('.hh-city');
      const button=document.querySelector('button[aria-label="down"]');
      return {debug:window.__scrollDebug,city:{rect:city.getBoundingClientRect().toJSON(),height:city.clientHeight,scrollHeight:city.scrollHeight,top:city.scrollTop},button:{rect:button.getBoundingClientRect().toJSON(),classes:button.className}};
    })()`;
    console.log("scroll before",JSON.stringify(await f.page(inspect)));
    await f.click("down");
    await f.wait(1500);
    console.log("scroll after user click",JSON.stringify(await f.page(inspect)));
    await f.page("document.querySelector('button[aria-label=down]').click()");
    await f.wait(1500);
    console.log("scroll after DOM click",JSON.stringify(await f.page(inspect)));
    await f.page("document.querySelector('.hh-city').scrollBy({top:150,behavior:'smooth'})");
    await f.wait(1500);
    console.log("scroll after direct scroll",JSON.stringify(await f.page(inspect)));
  },
});
