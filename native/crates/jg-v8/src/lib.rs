//! A game's real TypeScript tick, bundled into one script (`bun scripts/native-rules.ts bundle`), run
//! in embedded V8. The host crosses into JS once per tick (`__jgHostTick(dt, held, heading)`) and reads
//! the results straight out of the script's `Float64Array` columns, which share memory with Rust.

use std::sync::Once;

static INIT: Once = Once::new();

fn init_v8() {
    INIT.call_once(|| {
        let platform = v8::new_default_platform(0, false).make_shared();
        v8::V8::initialize_platform(platform);
        v8::V8::initialize();
    });
}

fn print(scope: &mut v8::PinScope, args: v8::FunctionCallbackArguments, _ret: v8::ReturnValue) {
    let line = args.get(0).to_rust_string_lossy(scope);
    eprintln!("[js] {line}");
}

pub struct JsRules {
    isolate: v8::OwnedIsolate,
    context: v8::Global<v8::Context>,
    tick: v8::Global<v8::Function>,
    columns: v8::SharedRef<v8::BackingStore>,
    offset: usize,
    len: usize,
}

fn exception(tc: &mut v8::PinnedRef<'_, v8::TryCatch<v8::HandleScope>>) -> String {
    let text = tc.exception().map(|e| e.to_rust_string_lossy(tc)).unwrap_or_else(|| "unknown exception".into());
    match tc.message() {
        Some(m) => {
            let line = m.get_line_number(tc).unwrap_or_default();
            let source = m.get_source_line(tc).map(|s| s.to_rust_string_lossy(tc)).unwrap_or_default();
            let start = m.get_start_column();
            let snippet: String = source.chars().skip(start.saturating_sub(60)).take(160).collect();
            format!("{text} (line {line}: {snippet})")
        }
        None => text,
    }
}

impl JsRules {
    /// Load the bundle (which must define `globalThis.__jgRules = { columns, tick }`) for a scenario
    /// (`home` or `dive`, which the bundle reads as `globalThis.__jgScenario`).
    pub fn load(bundle: &str, scenario: &str) -> Result<Self, String> {
        if !scenario.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(format!("bad scenario {scenario:?}"));
        }
        let scenario_js = format!("globalThis.__jgScenario = \"{scenario}\";");
        init_v8();
        let mut isolate = v8::Isolate::new(v8::CreateParams::default());
        isolate.set_microtasks_policy(v8::MicrotasksPolicy::Explicit);
        let (context, tick, columns, offset, len) = {
            v8::scope!(let hs, &mut isolate);
            let global = v8::ObjectTemplate::new(hs);
            global.set(v8::String::new(hs, "__jgPrint").unwrap().into(), v8::FunctionTemplate::new(hs, print).into());
            let context = v8::Context::new(hs, v8::ContextOptions { global_template: Some(global), ..Default::default() });
            let scope = &mut v8::ContextScope::new(hs, context);
            v8::tc_scope!(let tc, scope);
            for (name, src) in [("prelude.js", include_str!("prelude.js")), ("scenario.js", scenario_js.as_str()), ("rules.js", bundle)] {
                let code = v8::String::new(tc, src).ok_or("script too large")?;
                let file = v8::String::new(tc, name).unwrap();
                let origin = v8::ScriptOrigin::new(tc, file.into(), 0, 0, false, 0, None, false, false, false, None);
                let Some(script) = v8::Script::compile(tc, code, Some(&origin)) else { return Err(format!("{name}: {}", exception(tc))) };
                if script.run(tc).is_none() { return Err(format!("{name}: {}", exception(tc))); }
                tc.perform_microtask_checkpoint();
            }
            let g = context.global(tc);
            let key = v8::String::new(tc, "__jgHostTick").unwrap();
            let tick = v8::Local::<v8::Function>::try_from(g.get(tc, key.into()).ok_or("no __jgHostTick")?).map_err(|_| "__jgHostTick is not a function")?;
            let key = v8::String::new(tc, "__jgRules").unwrap();
            let rules = g.get(tc, key.into()).and_then(|v| v.to_object(tc)).ok_or("bundle did not set globalThis.__jgRules")?;
            let key = v8::String::new(tc, "columns").unwrap();
            let cols = v8::Local::<v8::Float64Array>::try_from(rules.get(tc, key.into()).ok_or("no columns")?).map_err(|_| "__jgRules.columns is not a Float64Array")?;
            let store = cols.buffer(tc).ok_or("columns have no buffer")?.get_backing_store();
            (v8::Global::new(tc, context), v8::Global::new(tc, tick), store, cols.byte_offset(), cols.length())
        };
        Ok(Self { isolate, context, tick, columns, offset, len })
    }

    /// One tick: one call into JS, then the promise jobs it queued.
    pub fn tick(&mut self, dt: f64, held: u32, heading: f64) -> Result<f64, String> {
        v8::scope_with_context!(let scope, &mut self.isolate, &self.context);
        v8::tc_scope!(let tc, scope);
        let f = v8::Local::new(tc, &self.tick);
        let recv = v8::undefined(tc).into();
        let args = [v8::Number::new(tc, dt).into(), v8::Number::new(tc, held as f64).into(), v8::Number::new(tc, heading).into()];
        let out = f.call(tc, recv, &args);
        let seen = match out {
            Some(v) => v.number_value(tc).unwrap_or(0.0),
            None => return Err(exception(tc)),
        };
        tc.perform_microtask_checkpoint();
        if tc.has_caught() { return Err(exception(tc)); }
        Ok(seen)
    }

    /// The script's columns, read in place.
    pub fn columns(&self) -> &[f64] {
        match self.columns.data() {
            // SAFETY: the backing store outlives `self` (we hold a reference), the offset and length come
            // from the live Float64Array, and JS only writes it during `tick`, which takes `&mut self`.
            Some(p) => unsafe { std::slice::from_raw_parts((p.as_ptr() as *const u8).add(self.offset) as *const f64, self.len) },
            None => &[],
        }
    }
}
