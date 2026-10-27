import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.expect((p) => p.inDive === 0, "standing in Marrow");
    // a record a few dives in: salvage banked, the cutter, Seal Mk II and the lure scanned, the cold stores charted
    await f.command("deepward.dev.seed", {"stash":["cells","cells","cells","cells","wire","wire","wire","wire","wire","polymer","polymer","polymer","polymer","polymer","polymer"],"known":["cutter","seal2","lure"],"charted":["cold"]});
    // beside the fabricator
    await f.command("deepward.dev.stand", {"x":-5.2,"z":15.1});
    await f.wait(800);
    await f.shot("run-01-marrow");
    // open the fabricator
    await f.press("KeyE");
    await f.see(/Marrow's fabricator/, { timeoutMs: 8000 });
    await f.shot("run-02-fabricator");
    await f.click("Build Cell generator");
    await f.click("Build Water still");
    await f.click("Build Radio mast");
    await f.click("Print Plasma cutter");
    await f.click("Print Seal Mk II");
    await f.click("Print Blood lure");
    await f.click("Print Blood lure");
    await f.expect((p) => p.lures === 2 && p.modules === 3 && p.gear === 2, "two lures waiting, three modules queued, two tools printed");
    await f.wait(600);
    await f.shot("run-03-fabricator-paid");
    await f.click("Back to Marrow");
    // watch the bays go up
    await f.command("deepward.dev.stand", {"x":2.6,"z":15.2});
    // generator powers the bays; the mast catches Printer Zero
    await f.waitFor((p) => p.signal === 1, { timeoutMs: 60000 });
    await f.wait(1500);
    await f.shot("run-04-bays-signal");
    // dive one: the garage
    await f.command("deepward.dev.stand", {"x":0,"z":9.2});
    // depart: two lures on the belt
    await f.press("KeyE");
    await f.waitFor((p) => p.inDive === 1, { timeoutMs: 15000 });
    await f.expect((p) => p.beltLure === 2 && p.stratum === 1, "__jgProbe().beltLure === 2 && __jgProbe().stratum === 1");
    // receiving's descent lift
    await f.command("deepward.dev.stand", {"x":-1.2,"z":-41.6});
    await f.wait(600);
    await f.shot("run-05-vault");
    // ride down to the cold stores
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 2, { timeoutMs: 8000 });
    // lamp on: see and be seen
    await f.press("KeyF");
    await f.waitFor((p) => p.lamp === 1, { timeoutMs: 4000 });
    // walk back off the lift landing
    await f.hold("KeyS", { ms: 2500 });
    // a tray of seedlings, frozen in the aisle
    await f.command("deepward.dev.stand", {"x":-3,"z":10.5});
    // scan it: the growbed blueprint
    await f.press("KeyE");
    await f.waitFor((p) => p.scans >= 1, { timeoutMs: 8000 });
    // step back into the aisle
    await f.command("deepward.dev.stand", {"x":0,"z":8});
    await f.wait(500);
    await f.shot("run-06-cold-scan");
    // a sealed cable run
    await f.command("deepward.dev.stand", {"x":7.4,"z":0.2});
    // cut it with the printed plasma cutter: loud
    await f.press("KeyE");
    await f.wait(1200);
    await f.shot("run-07-cutting");
    // the cut finishes; the noise carries down the aisles
    await f.wait(2500);
    // a ration crate
    await f.command("deepward.dev.stand", {"x":-4,"z":-4.3});
    // rations onto the belt
    await f.press("KeyE");
    await f.waitFor((p) => p.beltRation >= 1, { timeoutMs: 6000 });
    // back down the aisle, lamp on: the courier followed the cutter's noise
    await f.command("deepward.dev.stand", {"x":0.5,"z":-11});
    // the courier sees the lamp and comes
    await f.waitFor((p) => p.hunting >= 1, { timeoutMs: 20000 });
    await f.wait(900);
    await f.shot("run-08-courier-hunts");
    // throw a blood lure
    await f.press("KeyG");
    await f.waitFor((p) => p.luresOut === 1, { timeoutMs: 4000 });
    // lamp off, stand still
    await f.press("KeyF");
    await f.waitFor((p) => p.lamp === 0, { timeoutMs: 4000 });
    await f.wait(2500);
    await f.shot("run-09-lure");
    // the courier eats the lure instead of the diver
    await f.waitFor((p) => p.luresOut === 0, { timeoutMs: 30000 });
    // head for the up-lift
    await f.command("deepward.dev.stand", {"x":0,"z":8});
    // walk the last stretch, lamp dark
    await f.hold("KeyW", { ms: 2500 });
    await f.command("deepward.dev.stand", {"x":0,"z":16.6});
    // up to receiving
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 1, { timeoutMs: 8000 });
    // receiving's rail exit
    await f.command("deepward.dev.stand", {"x":0,"z":2.6});
    // home by rail: cable cells to the stash, the ration to the galley
    await f.press("KeyE");
    await f.waitFor((p) => p.inDive === 0, { timeoutMs: 15000 });
    await f.wait(1200);
    await f.shot("run-10-home-held");
    await f.click("Back to Marrow");
    // between dives: the powered still fills Marrow's galley
    const water = (await f.probe()).galleyWater;
    await f.waitFor((p) => p.galleyWater >= water + 1, { timeoutMs: 120000 });
    await f.command("deepward.dev.stand", {"x":-5.2,"z":15.1});
    // the seed tray scan taught the growbed; the cut cable paid for it
    await f.press("KeyE");
    await f.see(/Marrow's fabricator/, { timeoutMs: 8000 });
    await f.click("Build Growbed");
    await f.expect((p) => p.modules === 4, "__jgProbe().modules === 4");
    await f.wait(600);
    await f.shot("run-11-growbed");
    await f.click("Back to Marrow");
    await f.command("deepward.dev.stand", {"x":2.6,"z":15.2});
    // the growbed goes up in the next bay
    await f.wait(12000);
    await f.shot("run-12-four-bays");
    // dive two: the garage
    await f.command("deepward.dev.stand", {"x":0,"z":9.2});
    await f.press("KeyE");
    await f.waitFor((p) => p.inDive === 1, { timeoutMs: 15000 });
    await f.command("deepward.dev.stand", {"x":-1.2,"z":-41.6});
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 2, { timeoutMs: 8000 });
    // down the central aisle
    await f.hold("KeyS", { ms: 2500 });
    // the cold stores' down-lift: the mast's cage code opens it
    await f.command("deepward.dev.stand", {"x":0,"z":-23.4});
    // ride down to the Ink Wells on Seal Mk II
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 3, { timeoutMs: 8000 });
    await f.press("KeyF");
    await f.waitFor((p) => p.lamp === 1, { timeoutMs: 4000 });
    await f.wait(1200);
    await f.shot("run-13-wells");
    // the radio relay
    await f.command("deepward.dev.stand", {"x":-6.8,"z":-14.2});
    // scan the relay: the cage code for the Choir
    await f.press("KeyE");
    await f.waitFor((p) => p.relay === 1, { timeoutMs: 8000 });
    await f.wait(800);
    await f.shot("run-14-relay");
    // the last lift
    await f.command("deepward.dev.stand", {"x":-5.5,"z":-33.2});
    // into the Choir Deep, past the seal's rating
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 4, { timeoutMs: 8000 });
    await f.expect((p) => p.nearestCreature > 5, "the Overrun is still across the hall");
    await f.wait(1500);
    await f.shot("run-15-choir-crush");
    // across the hall from the Overrun, lamp on
    await f.command("deepward.dev.stand", {"x":0,"z":6});
    await f.wait(700);
    await f.shot("run-16-overrun");
    // back to the lift before the hull gives
    await f.command("deepward.dev.stand", {"x":0,"z":13.8});
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 3, { timeoutMs: 8000 });
    await f.command("deepward.dev.stand", {"x":-5,"z":16.8});
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 2, { timeoutMs: 8000 });
    await f.command("deepward.dev.stand", {"x":0,"z":16.6});
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 1, { timeoutMs: 8000 });
    await f.command("deepward.dev.stand", {"x":0,"z":2.6});
    // home by rail
    await f.press("KeyE");
    await f.waitFor((p) => p.inDive === 0, { timeoutMs: 15000 });
    await f.wait(1200);
    await f.click("Back to Marrow");
    await f.command("deepward.dev.stand", {"x":-5.2,"z":15.1});
    await f.wait(1200);
    await f.shot("run-17-home");
    // the growbed grows a ration while you rest: survival eases as Marrow grows
    const food = (await f.probe()).galleyFood;
    await f.waitFor((p) => p.galleyFood >= food + 1, { timeoutMs: 150000 });
    await f.wait(600);
    await f.shot("run-17b-galley-grows");
    await f.press("KeyE");
    await f.see(/Marrow's fabricator/, { timeoutMs: 8000 });
    await f.expect((p) => p.relay === 1 && p.signal === 1 && p.modules === 4, "the story and the base both held through two dives");
    await f.shot("run-18-journal");
  },
});
