"""Run by Errand in its own hidden shell, using its approved Chrome holder.

Only opens/closes its own tab. CDP sends native key and pointer input; page
evaluation observes DOM/storage. MutationObserver and protocol events drive
waits, with one overall deadline. No game/session mutation or polling.
"""
import base64
import json
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, "C:/Users/Jk101/Projects/errand")
from errand.chrome_link import ChromeLink

EVIDENCE = Path(sys.argv[1])
MOBILE_ONLY = "--mobile-only" in sys.argv[2:]
REPORT_PATH = EVIDENCE / ("native-mobile-playtest.json" if MOBILE_ONLY else "native-playtest.json")
DEADLINE = time.time() + (180 if MOBILE_ONLY else 600)
REPORT_PATH.write_text(json.dumps({"status":"starting","started":time.time()}), encoding="utf-8")
try:
    link = ChromeLink({})
    conn = link.get(wait=1)
    target = conn.send("Target.createTarget", {"url": "about:blank", "background": True}, deadline=DEADLINE)["targetId"]
    session = conn.send("Target.attachToTarget", {"targetId": target, "flatten": True}, deadline=DEADLINE)["sessionId"]
except Exception as error:
    REPORT_PATH.write_text(json.dumps({"status":"failed","boundary":"native harness startup","failure":str(error)}), encoding="utf-8")
    raise
class Checks(dict):
    def __setitem__(self, name, value):
        super().__setitem__(name, value)
        EVIDENCE.joinpath("native-mobile-progress.json" if MOBILE_ONLY else "native-progress.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


report = {"status": "running", "checks": Checks(), "errors": []}


def acknowledge_frames():
    cursor = 0
    while conn.alive and time.time() < DEADLINE:
        frame = conn.wait_event(session, cursor, lambda m, p: m == "Page.screencastFrame", DEADLINE-time.time())
        if not frame:
            return
        cursor = conn.mark(session)
        try:
            conn.send("Page.screencastFrameAck", {"sessionId": frame["sessionId"]}, session, DEADLINE)
        except Exception:
            return


def cdp(method, _seconds=30, **params):
    return conn.send(method, params, session, min(DEADLINE, time.time() + _seconds))


def evaluate(expression, seconds=30):
    result = cdp("Runtime.evaluate", _seconds=seconds, expression=expression, returnByValue=True, awaitPromise=True)
    if result.get("exceptionDetails"):
        raise RuntimeError(result["exceptionDetails"])
    return result.get("result", {}).get("value")


def wait_dom(predicate, seconds=25):
    # An immediate read, then actual DOM change events until the one deadline.
    return evaluate("""new Promise((resolve,reject)=>{
      let observer; const check=()=>{if((""" + predicate + """)) {observer?.disconnect();clearTimeout(deadline);resolve(true);}};
      const deadline=setTimeout(()=>{observer?.disconnect();reject(new Error('DOM boundary deadline'));},""" + str(seconds*1000) + """);
      observer=new MutationObserver(check);observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});check();
    })""", seconds + 5)


def key(code, down=None):
    name = {"KeyW": "w", "KeyP": "p", "Space": " ", "Escape": "Escape"}[code]
    vk = {"KeyW": 87, "KeyP": 80, "Space": 32, "Escape": 27}[code]
    params = {"key": name, "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
    if down is not False:
        cdp("Input.dispatchKeyEvent", type="rawKeyDown", **params)
    if down is not True:
        cdp("Input.dispatchKeyEvent", type="keyUp", **params)


def click(selector):
    point = evaluate("(()=>{const b=document.querySelector(" + json.dumps(selector) + ");if(!b)throw new Error('Missing control');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
    cdp("Input.dispatchMouseEvent", type="mouseMoved", **point)
    cdp("Input.dispatchMouseEvent", type="mousePressed", button="left", clickCount=1, **point)
    cdp("Input.dispatchMouseEvent", type="mouseReleased", button="left", clickCount=1, **point)


def touch_click(selector):
    point = evaluate("(()=>{const b=document.querySelector(" + json.dumps(selector) + ");if(!b)throw new Error('Missing touch control');const r=b.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)throw new Error('Touch control outside viewport');return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
    report["checks"]["touchPoint"] = {"selector":selector,"point":point,"metrics":cdp("Page.getLayoutMetrics"),"hit":evaluate("document.elementFromPoint("+str(point["x"])+","+str(point["y"])+")?.outerHTML")}
    cdp("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{**point, "id":0}])
    evaluate("new Promise(resolve=>requestAnimationFrame(resolve))")
    cdp("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])


def hud():
    return evaluate("({time:document.querySelector('.df-location b')?.innerText,speed:document.querySelector('.df-speed b')?.innerText,route:document.querySelector('.df-route')?.innerText,gap:document.querySelector('.df-gap')?.innerText,cue:document.querySelector('.df-gate-cue')?.innerText})")


def frozen(label):
    before = hud()
    # A single bounded pause observation, never a state-checking timer loop.
    evaluate("new Promise(resolve=>setTimeout(resolve,2000))")
    after = hud()
    assert before == after, (label, before, after)
    report["checks"][label] = {"before": before, "after": after}


def screenshot(name):
    # Genuine browser page pixels, not desktop captures or synthetic images.
    image = cdp("Page.captureScreenshot", format="png", captureBeyondViewport=False)
    EVIDENCE.joinpath(name).write_bytes(base64.b64decode(image["data"]))


try:
    cdp("Page.enable")
    cdp("Runtime.enable")
    cdp("Network.enable")
    cdp("Page.setLifecycleEventsEnabled", enabled=True)
    cdp("Emulation.setDeviceMetricsOverride", width=1280, height=800, deviceScaleFactor=1, mobile=False)
    cdp("Emulation.setFocusEmulationEnabled", enabled=True)
    # Background tabs must keep painting for controls and captures.
    cdp("Page.startScreencast", format="jpeg", quality=30, maxWidth=400, maxHeight=300)
    threading.Thread(target=acknowledge_frames, daemon=True).start()
    since = conn.mark(session)
    cdp("Page.navigate", url="http://127.0.0.1:4609")
    assert conn.wait_event(session, since, lambda m, p: m == "Page.loadEventFired", min(25, DEADLINE - time.time())), "page load deadline"
    wait_dom("!!document.querySelector('.df-title-card button.df-primary')")
    if not MOBILE_ONLY:
        evaluate("window.dfNativeKeyTrace=[];for(const name of ['keydown','keyup','focusin','blur'])window.addEventListener(name,e=>dfNativeKeyTrace.push({type:e.type,code:e.code,trusted:e.isTrusted,target:e.target?.tagName,class:e.target?.className}),true)")
        layout = evaluate("({viewport:[innerWidth,innerHeight],root:document.getElementById('root').getBoundingClientRect().toJSON(),canvas:document.querySelector('canvas')?.getBoundingClientRect().toJSON()})")
        assert abs(layout["root"]["height"] - layout["viewport"][1]) < 1.1, layout
        report["checks"]["desktopLayout"] = layout
        wait_dom("document.querySelector('canvas')?.getBoundingClientRect().height > innerHeight*.8")
        report["checks"]["canvasReady"] = evaluate("document.querySelector('canvas').getBoundingClientRect().toJSON()")
        screenshot("native-title.png")
        click(".df-title-card button.df-primary")
        wait_dom("!!document.querySelector('.df-speed')")
        report["checks"]["focusBeforeThrottle"] = evaluate("({tag:document.activeElement.tagName,class:document.activeElement.className})")
        key("KeyW", True)
        wait_dom("Number(document.querySelector('.df-speed b')?.innerText)>20")
        report["checks"]["nativeThrottle"] = hud()
        key("KeyW", False)
        key("KeyP")
        wait_dom("!!document.querySelector('.df-pause')")
        frozen("pause")
        key("KeyP")
        wait_dom("!document.querySelector('.df-pause')")
        click(".df-hud-top button[aria-label='Settings']")
        frozen("settings")
        key("Escape")
        wait_dom("!document.querySelector('button[aria-label=\"Close settings\"]')")
        key("KeyW", True)
        screenshot("native-driving.png")
        wait_dom("!!document.querySelector('[aria-label=\"Crushed results\"]')", 180)
        key("KeyW", False)
        report["checks"]["noJumpLoss"] = evaluate("document.querySelector('.df-results').innerText")
        screenshot("native-loss.png")
        click(".df-results .df-primary")
        wait_dom("!!document.querySelector('.df-speed')")
        report["checks"]["restart"] = hud()
        assert report["checks"]["restart"]["route"].startswith("0/8"), report["checks"]["restart"]
        cdp("Runtime.addBinding", name="dfNativeBoundary")
        evaluate("""(()=>{let sent='';const inspect=()=>{const cue=document.querySelector('.df-gate-cue');const end=document.querySelector('.df-results');
          const next=end?'end':cue?.innerText.includes('JUMP NOW')?cue.querySelector('.df-eyebrow').innerText.replace(/\\/.*$/,'')+cue.querySelector('span:last-child').innerText:'';
          if(next&&next!==sent){sent=next;dfNativeBoundary(JSON.stringify({kind:end?'end':'jump',text:(end||cue).innerText}));}};
          const observer=new MutationObserver(inspect);observer.observe(document.querySelector('.df-ui'),{subtree:true,childList:true,characterData:true});inspect();})()""")
        cursor = conn.mark(session)
        key("KeyW", True)
        jumps = []
        while True:
            event = conn.wait_event(session, cursor, lambda m, p: m == "Runtime.bindingCalled" and p.get("name") == "dfNativeBoundary", min(180, DEADLINE-time.time()))
            assert event, "No next native route boundary before deadline"
            cursor = conn.mark(session)
            boundary = json.loads(event["payload"])
            if boundary["kind"] == "end":
                report["checks"]["timedJumpResult"] = boundary["text"]
                break
            key("Space", True)
            wait_dom("document.querySelector('.df-speed small')?.innerText==='AIRBORNE'")
            key("Space", False)
            jumps.append(boundary["text"])
        key("KeyW", False)
        report["checks"]["nativeJumps"] = jumps
        assert "OUT OF" in report["checks"]["timedJumpResult"], report["checks"]["timedJumpResult"]
        screenshot("native-win.png")
        saved = evaluate("localStorage.getItem('drift-foundry.records.v1')")
        since = conn.mark(session)
        cdp("Page.reload")
        assert conn.wait_event(session, since, lambda m, p: m == "Page.loadEventFired", 25), "reload deadline"
        wait_dom("!!document.querySelector('.df-title-card')")
        restored = evaluate("({saved:localStorage.getItem('drift-foundry.records.v1'),display:document.querySelector('.df-records').innerText})")
        assert restored["saved"] == saved, restored
        report["checks"]["recordsAfterReload"] = restored
    for width, height in [(390, 844), (844, 390)]:
        cdp("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1, mobile=True)
        cdp("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=2)
        evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
        measure = evaluate("({viewport:[innerWidth,innerHeight],card:document.querySelector('.df-title-card').getBoundingClientRect().toJSON(),bodyWidth:document.body.scrollWidth,touch:matchMedia('(pointer:coarse)').matches})")
        assert measure["bodyWidth"] <= measure["viewport"][0], measure
        report["checks"][f"responsive{width}"] = measure
    cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=1, mobile=True)
    evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
    evaluate("window.dfNativeTouchTrace=[];for(const name of ['pointerdown','pointerup','pointercancel','touchstart','touchend','click'])window.addEventListener(name,e=>dfNativeTouchTrace.push({type:e.type,trusted:e.isTrusted,target:e.target?.tagName,class:e.target?.className,x:e.clientX,y:e.clientY,touches:[...(e.changedTouches||[])].map(t=>({x:t.clientX,y:t.clientY}))}),true)")
    touch_click(".df-title-card .df-primary")
    wait_dom("!!document.querySelector('.df-speed')")
    wait_dom("!!document.querySelector('.df-touch') && getComputedStyle(document.querySelector('.df-touch')).display==='flex'")
    point = evaluate("(()=>{const r=[...document.querySelectorAll('.df-touch button')].find(b=>b.innerText==='GO').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
    cdp("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{**point,"id":0}])
    wait_dom("Number(document.querySelector('.df-speed b')?.innerText)>20")
    report["checks"]["nativeTouchThrottle"] = hud()
    cdp("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])
    screenshot("native-mobile.png")
    touch_click(".df-hud-top button[aria-label='Pause run']")
    wait_dom("!!document.querySelector('.df-pause')")
    frozen("nativeTouchPause")
    touch_click(".df-pause .df-actions button:last-child")
    wait_dom("!!document.querySelector('.df-title-card')")
    report["checks"]["nativeTouchReturnToTitle"] = evaluate("document.querySelector('.df-records').innerText")
    report["status"] = "passed"
except Exception as error:
    report["status"] = "failed"
    report["failure"] = str(error)
    try:
        report["lastHud"] = hud()
        report["lastPage"] = evaluate("document.body.innerText")
        report["focus"] = evaluate("({tag:document.activeElement?.tagName,class:document.activeElement?.className,hidden:document.hidden})")
        report["touchTrace"] = evaluate("window.dfNativeTouchTrace")
        report["canvasParents"] = evaluate("(()=>{const out=[];for(let e=document.querySelector('canvas');e;e=e.parentElement){const s=getComputedStyle(e);out.push({tag:e.tagName,class:e.className,rect:e.getBoundingClientRect().toJSON(),height:s.height,display:s.display,position:s.position});}return out;})()")
    except Exception as diagnostic_error:
        report["diagnosticFailure"] = str(diagnostic_error)
finally:
    events = conn.events.get(session, [])
    try:
        report["keyTrace"] = evaluate("window.dfNativeKeyTrace")
    except Exception:
        pass
    report["errors"] = [p for m, p in events if m == "Runtime.exceptionThrown" or m == "Network.loadingFailed"]
    report["httpFailures"] = [p["response"]["url"] for m, p in events if m == "Network.responseReceived" and p["response"]["status"] >= 400]
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    conn.send("Target.closeTarget", {"targetId": target}, deadline=time.time()+10)
    link.close()
    print(json.dumps(report, indent=2))
sys.exit(0 if report["status"] == "passed" else 1)
