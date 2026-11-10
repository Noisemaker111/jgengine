//! A binary without `procwatch::alloc::Counting` installed: allocation figures stay unknown.

#[test]
fn allocation_bytes_are_unknown_without_the_counting_allocator() {
    for _ in 0..3 {
        drop(std::hint::black_box(vec![0u8; 64]));
        assert_eq!(rune_perf::take_allocated_bytes(), None);
    }
}
