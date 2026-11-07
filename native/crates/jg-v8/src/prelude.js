// Web globals a game's tick touches that bare V8 lacks. Timers run on the game clock: the host's one
// call per tick (`__jgHostTick`) ticks the rules, then fires the timers that came due in that tick.
(() => {
  const g = globalThis;
  const print = g.__jgPrint;
  const fmt = (args) => args.map((a) => { try { return typeof a === "string" ? a : JSON.stringify(a); } catch { return String(a); } }).join(" ");
  g.console = { log: (...a) => print(fmt(a)), info: (...a) => print(fmt(a)), debug: () => {}, trace: () => {}, warn: (...a) => print("warn " + fmt(a)), error: (...a) => print("error " + fmt(a)), group: () => {}, groupEnd: () => {}, groupCollapsed: () => {}, time: () => {}, timeEnd: () => {}, table: () => {}, assert: () => {} };

  let clockMs = 0;
  const started = Date.now();
  g.performance = { now: () => Date.now() - started, mark: () => {}, measure: () => {}, timeOrigin: started };

  let nextId = 1;
  const timers = new Map();
  g.setTimeout = (fn, ms = 0, ...args) => { const id = nextId++; timers.set(id, { at: clockMs + Math.max(0, Number(ms) || 0), fn, args, every: 0 }); return id; };
  g.setInterval = (fn, ms = 0, ...args) => { const id = nextId++; const every = Math.max(1, Number(ms) || 0); timers.set(id, { at: clockMs + every, fn, args, every }); return id; };
  g.clearTimeout = g.clearInterval = (id) => { timers.delete(id); };
  g.requestAnimationFrame = (fn) => g.setTimeout(() => fn(clockMs), 0);
  g.cancelAnimationFrame = g.clearTimeout;
  g.queueMicrotask = (fn) => { Promise.resolve().then(fn); };
  const runTimers = () => {
    for (let guard = 0; guard < 1000; guard += 1) {
      let due = null;
      for (const [id, t] of timers) if (t.at <= clockMs && (due === null || t.at < due[1].at)) due = [id, t];
      if (due === null) return;
      const [id, t] = due;
      if (t.every > 0) t.at += t.every; else timers.delete(id);
      t.fn(...t.args);
    }
  };

  const cloneInto = (v, seen) => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return seen.get(v);
    let out;
    if (Array.isArray(v)) { out = []; seen.set(v, out); for (const x of v) out.push(cloneInto(x, seen)); return out; }
    if (v instanceof Date) return new Date(v.getTime());
    if (v instanceof Map) { out = new Map(); seen.set(v, out); for (const [k, x] of v) out.set(cloneInto(k, seen), cloneInto(x, seen)); return out; }
    if (v instanceof Set) { out = new Set(); seen.set(v, out); for (const x of v) out.add(cloneInto(x, seen)); return out; }
    if (ArrayBuffer.isView(v)) return v.slice();
    if (v instanceof ArrayBuffer) return v.slice(0);
    out = {}; seen.set(v, out);
    for (const k of Object.keys(v)) out[k] = cloneInto(v[k], seen);
    return out;
  };
  g.structuredClone = (v) => cloneInto(v, new Map());

  class URLShim {
    constructor(url, base) { this.href = base === undefined ? String(url) : String(base).replace(/[^/]*$/, "") + String(url); }
    toString() { return this.href; }
  }
  g.URL = g.URL ?? URLShim;
  g.TextEncoder = g.TextEncoder ?? class { encode(s) { const u = unescape(encodeURIComponent(s)); const b = new Uint8Array(u.length); for (let i = 0; i < u.length; i += 1) b[i] = u.charCodeAt(i); return b; } };
  g.TextDecoder = g.TextDecoder ?? class { decode(b) { let s = ""; for (const c of b ?? []) s += String.fromCharCode(c); return decodeURIComponent(escape(s)); } };
  g.AbortController = g.AbortController ?? class { constructor() { this.signal = { aborted: false, addEventListener() {}, removeEventListener() {} }; } abort() { this.signal.aborted = true; } };

  g.__jgHostTick = (dt, held, heading) => {
    const seen = g.__jgRules.tick(dt, held, heading);
    clockMs += dt * 1000;
    runTimers();
    return seen;
  };
})();
