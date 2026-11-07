use jg_rules::{HELD_FORWARD, Rules, World, col};

/// A 10 m square room at home, one 2 m solid in the middle of a vault room, both starts at the origin.
fn world() -> World {
    let json = r#"{
      "bounds": {"minX": -6, "minZ": -6, "maxX": 6, "maxZ": 6},
      "rooms": {"home": [{"x": 0, "z": 0, "w": 10, "d": 10}], "vault": [{"x": 0, "z": 0, "w": 10, "d": 10}]},
      "solids": {"home": [], "vault": [{"x": 0, "z": 2, "w": 4, "d": 1}]},
      "radius": 0.28, "navCell": 0.5,
      "fitter": {"spawn": [0, 0, 4], "sight": 12, "coneDeg": 200, "hearing": 15, "memorySeconds": 0.5, "speed": 2.5, "receivingBackZ": 10},
      "movement": {"walkSpeed": 4.4, "walkSpeedMultiplier": 1.75, "backpedalSpeedMultiplier": 0.65, "groundAcceleration": 26, "groundFriction": 18, "maxFrameSeconds": 0.05},
      "body": {"meters": [{"id": "food", "max": 100, "rate": 0.1667}, {"id": "water", "max": 100, "rate": 0.238}], "homeDrain": 0.35, "galleyFeedsBelow": 70, "meal": {"food": 45, "water": 50}, "vaultDrain": {"food": 1, "water": 1, "air": 1}},
      "starts": {"home": [0, 0, 0, 0, 100, 100, 0, 0, 2, 1], "dive": [0, 0, -3, 0, 100, 100, 0, 0, 3, 1]}
    }"#;
    World::load(json).expect("world")
}

#[test]
fn walking_forward_stops_at_the_wall_less_the_actor_radius() {
    let mut rules = Rules::new(world(), "home").unwrap();
    for _ in 0..600 {
        rules.tick(1.0 / 60.0, HELD_FORWARD, 0.0);
    }
    let z = rules.columns[col::Z];
    assert!(z > 4.5 && z < 5.0 - 0.28 + 1e-9, "z {z}");
    assert!(rules.columns[col::FOOD] < 100.0);
}

#[test]
fn the_solid_blocks_movement_and_sight() {
    let w = world();
    assert!(!w.walkable(0.0, 2.0, jg_rules::Place::Vault, 0.28));
    assert!(w.walkable(0.0, 0.0, jg_rules::Place::Vault, 0.28));
    assert!(!w.line_of_sight([0.0, 0.0, 0.0], [0.0, 0.0, 4.0], jg_rules::Place::Vault));
    assert!(w.line_of_sight([4.0, 0.0, 0.0], [4.0, 0.0, 4.0], jg_rules::Place::Vault));
}

#[test]
fn a_dive_ticks_the_fitter_without_leaving_the_floor() {
    let mut rules = Rules::new(world(), "dive").unwrap();
    for i in 0..600 {
        rules.tick(1.0 / 60.0, if i % 120 < 60 { HELD_FORWARD } else { 0 }, f64::NAN);
    }
    let (x, z) = (rules.columns[col::X], rules.columns[col::Z]);
    assert!(rules.world().walkable(x, z, jg_rules::Place::Vault, 0.28), "player at {x},{z}");
    assert_eq!(rules.columns[col::MODE], 3.0);
}
