//! `jg-transpile <programs-dir> <out-dir>`: translate every `NNN.vert`/`NNN.frag` pair into
//! `NNN.vert.wgsl`, `NNN.frag.wgsl` and `NNN.layout.json`. Prints one line per program and exits
//! non-zero when any program fails, with the failure written to `NNN.error.txt`.

use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: jg-transpile <programs-dir> <out-dir>");
        std::process::exit(2);
    }
    let dir = PathBuf::from(&args[1]);
    let out = PathBuf::from(&args[2]);
    std::fs::create_dir_all(&out).expect("create out dir");
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .expect("read programs dir")
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().to_str().and_then(|n| n.strip_suffix(".vert")).map(str::to_string))
        .collect();
    names.sort();
    let mut failed = 0;
    for name in &names {
        let vert = std::fs::read_to_string(dir.join(format!("{name}.vert"))).expect("read vert");
        let frag = std::fs::read_to_string(dir.join(format!("{name}.frag"))).expect("read frag");
        match jg_shader::translate(&vert, &frag) {
            Ok(t) => {
                std::fs::write(out.join(format!("{name}.vert.wgsl")), &t.vertex_wgsl).unwrap();
                std::fs::write(out.join(format!("{name}.frag.wgsl")), &t.fragment_wgsl).unwrap();
                std::fs::write(out.join(format!("{name}.layout.json")), serde_json::to_string_pretty(&t.layout).unwrap()).unwrap();
                let _ = std::fs::remove_file(out.join(format!("{name}.error.txt")));
                println!("{name} ok: {} inputs, {} uniforms ({} bytes), {} textures", t.layout.vertex_inputs.len(), t.layout.uniforms.len(), t.layout.uniform_size, t.layout.samplers.len());
            }
            Err(e) => {
                failed += 1;
                std::fs::write(out.join(format!("{name}.error.txt")), &e).unwrap();
                let first = e.lines().next().unwrap_or("");
                println!("{name} FAILED: {first}");
            }
        }
    }
    println!("{} of {} programs translated", names.len() - failed, names.len());
    if failed > 0 {
        std::process::exit(1);
    }
}
