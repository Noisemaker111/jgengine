#[cfg(target_os = "linux")]
use gungraun::{
    Callgrind, EventKind, LibraryBenchmarkConfig, library_benchmark, library_benchmark_group, main,
};

#[cfg(target_os = "linux")]
fn setup() -> (rune_ref::Scene, rune_ref::Frame) {
    let scene = rune_ref::generate::seeded(24, 5);
    let mut frame = rune_ref::Frame::new(scene.width, scene.height, false);
    frame.render(&scene);
    (scene, frame)
}
#[cfg(target_os = "linux")]
#[library_benchmark(setup = setup)]
fn steady_frame(
    (scene, mut frame): (rune_ref::Scene, rune_ref::Frame),
) -> (rune_ref::Scene, rune_ref::Frame) {
    frame.render(std::hint::black_box(&scene));
    std::hint::black_box((scene, frame))
}
#[cfg(target_os = "linux")]
library_benchmark_group!(name = reference, benchmarks = steady_frame);
#[cfg(target_os = "linux")]
main!(
    config = LibraryBenchmarkConfig::default()
        .tool(Callgrind::default().soft_limits([(EventKind::Ir, 0.5)])),
    library_benchmark_groups = reference
);
#[cfg(not(target_os = "linux"))]
fn main() {
    eprintln!("skipping instruction benchmark: Linux and Valgrind required");
}
