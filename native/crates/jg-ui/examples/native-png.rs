//! Render a serialized native JSX spec with the production Rune builder.
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 4 {
        eprintln!("usage: cargo run -p jg-ui --example native-png -- <spec.json> <out.png> <width> <height> [font.ttf ...]");
        std::process::exit(2);
    }
    let run = || -> Result<(), Box<dyn std::error::Error>> {
        let json = std::fs::read_to_string(&args[0])?;
        let width: u32 = args[2].parse()?;
        let height: u32 = args[3].parse()?;
        let fonts: Vec<&'static [u8]> = args[4..].iter().map(|path| {
            std::fs::read(path).map(|bytes| &*Box::leak(bytes.into_boxed_slice()))
        }).collect::<Result<_,_>>()?;
        jg_ui::native_png(&json, std::path::Path::new(&args[1]), width, height, &fonts)?;
        println!("rendered {} ({width}×{height})", args[1]);
        Ok(())
    };
    if let Err(error) = run() { eprintln!("native-png: {error}"); std::process::exit(1); }
}
