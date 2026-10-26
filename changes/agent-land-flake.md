### Changed

- The land test "two landings watch their checks at once" no longer flakes when three copies run at once: each landing's watch ends when the other is watching too (an event), instead of a shared start time, a 3s sleep and wall-clock ratios that a loaded machine stretched. A 60s cap ends a lone watch and fails the test.
