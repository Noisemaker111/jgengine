use rune::color::{srgb_decode, srgb_encode};
use rune::render::{Blend, Gpu, Instance, KIND_RECT, LayerSpec, NO_CLIP, OFFSCREEN_FORMAT, Offscreen, Renderer};

#[test]
fn a_committed_layout_snapshot_does_not_wait_for_next_frames_layout_handler() {
    let spec = |w,h| crate::spec::parse_spec(&format!(r#"{{"children":[{{"k":"x","id":8181,"w":{w},"h":{h}}}]}}"#)).unwrap().children;
    let mut state=crate::Ui::default();state.root=spec(200,150);
    let mut runtime=rune::Runtime::new(state,crate::build::view,(300.0,300.0),rune::Env::new(true,1.0));
    runtime.frame(0.0);runtime.frame(0.016);
    runtime.update(move |state,tx| {state.root=spec(104,26);state.revision+=1;tx.instant();});
    runtime.frame(0.016);
    let snapshot=crate::layout_snapshot(&runtime);
    let rect=snapshot.iter().find(|rect|rect[0]==8181.0).unwrap();
    assert_eq!(&rect[3..],&[104.0,26.0]);
}

#[test]
fn image_tiles_repeat_each_axis_at_their_own_size_and_offset() {
    let gpu = Gpu::headless();
    let pixels = rune::Pixels::new();
    let colors = [[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,255,255]];
    pixels.set(4,4,(0..4).flat_map(|y| (0..4).flat_map(move |x| colors[(y/2)*2+x/2])).collect());
    for repeat in [[false,false],[true,false],[false,true],[true,true]] {
        let mut runtime = rune::Runtime::new((pixels.clone(),repeat), |state, _| rune::el().size(24.0,16.0).pixels_pattern(&state.0,[4.0,4.0],[1.0,-1.0],state.1), (24.0,16.0), rune::Env::new(true,1.0));
        runtime.frame(0.0);
        let mut renderer = Renderer::new(&gpu.device,OFFSCREEN_FORMAT);
        let target = Offscreen::new(&gpu.device,24,16);
        renderer.upload_images(&gpu.device,&gpu.queue,&mut runtime.images);
        renderer.prepare(&gpu.device,&gpu.queue,&mut runtime.text.atlas,&runtime.instances,(24,16));
        let mut encoder = gpu.device.create_command_encoder(&Default::default());
        renderer.draw(&mut encoder,&target.view,[0.0;4]);
        target.copy(&mut encoder); renderer.submit(&gpu.queue,encoder);
        let result = target.read(&gpu.device);
        for (x,y,expected) in [(2,0,colors[0]),(4,0,colors[1]),(2,2,colors[2]),(0,0,if repeat[0] {colors[1]} else {[0;4]}),(6,0,if repeat[0] {colors[0]} else {[0;4]}),(2,6,if repeat[1] {colors[2]} else {[0;4]})] {
            let at=(y*24+x)*4;
            assert_eq!(&result[at..at+4],&expected,"tile {repeat:?} at {x},{y}");
        }
    }
}

fn line_spread(pixels: &[u8], width: usize, x: usize, y: usize) -> f32 {
    let sample=|at: usize| srgb_decode(pixels[(y*width+at)*4] as f32/255.0);
    let weights: Vec<_>=(x-24..x+23).map(|at| (at as f32,(sample(at+1)-sample(at)).max(0.0))).collect();
    let mass: f32=weights.iter().map(|(_,w)|w).sum();
    let mean=weights.iter().map(|(at,w)|at*w).sum::<f32>()/mass;
    (weights.iter().map(|(at,w)|(at-mean).powi(2)*w).sum::<f32>()/mass).sqrt()
}

fn primitive(bounds: [f32; 4], color: [f32; 3], alpha: f32, srgb: bool) -> Instance {
    let mut instance = Instance::begin_layer(bounds, NO_CLIP, LayerSpec::default());
    instance.params = [0.0, KIND_RECT, 0.0, 1.0];
    instance.fill = [0.0, 0.0, 0.0, alpha];
    for c in 0..3 { instance.fill[c] = (if srgb { color[c] } else { srgb_decode(color[c]) }) * alpha; }
    instance
}

#[test]
fn css_blends_match_alpha_compositing_in_both_encodings_and_nested_targets() {
    let gpu = Gpu::headless();
    let mut atlas = rune::text::TextSystem::default().atlas;
    let source = [0.2_f32, 0.7, 0.9];
    let dest = [0.8_f32, 0.35, 0.1];
    for srgb in [false, true] {
        let format = if srgb { OFFSCREEN_FORMAT.remove_srgb_suffix() } else { OFFSCREEN_FORMAT };
        let mut renderer = Renderer::new(&gpu.device, format);
        renderer.set_srgb_blend(srgb);
        let target = Offscreen::with_format(&gpu.device, 32, 24, format);
        for mode in [Blend::Multiply, Blend::Overlay, Blend::Screen, Blend::SoftLight] {
            for da in [0.0, 0.45, 1.0] {
                for nested in [false, true] {
                    let opacity = 0.35;
                    let parent_opacity = if nested { 0.5 } else { 1.0 };
                    let mut instances = Vec::new();
                    if nested { instances.push(Instance::begin_layer([4.0, 3.0, 24.0, 18.0], NO_CLIP, LayerSpec { opacity: parent_opacity, ..Default::default() })); }
                    instances.push(primitive([4.0, 3.0, 24.0, 18.0], dest, da, srgb));
                    instances.push(Instance::begin_layer([8.0, 6.0, 12.0, 8.0], NO_CLIP, LayerSpec { opacity, blend: mode, ..Default::default() }));
                    instances.push(primitive([8.0, 6.0, 12.0, 8.0], source, 0.6, srgb));
                    instances.push(Instance::end_layer());
                    if nested { instances.push(Instance::end_layer()); }
                    renderer.prepare(&gpu.device, &gpu.queue, &mut atlas, &instances, (32, 24));
                    let mut encoder = gpu.device.create_command_encoder(&Default::default());
                    renderer.draw(&mut encoder, &target.view, [0.0; 4]);
                    target.copy(&mut encoder);
                    renderer.submit(&gpu.queue, encoder);
                    let pixels = target.read(&gpu.device);
                    let sa = 0.6 * opacity;
                    let expected: [u8; 4] = std::array::from_fn(|c| {
                        let value = if c == 3 { (sa + da * (1.0 - sa)) * parent_opacity } else {
                            let s = source[c]; let d = dest[c];
                            let mixed = match mode {
                                Blend::Multiply => s * d,
                                Blend::Overlay => if d <= 0.5 { 2.0 * s * d } else { 1.0 - 2.0 * (1.0 - s) * (1.0 - d) },
                                Blend::Screen => s + d - s * d,
                                Blend::SoftLight => if s <= 0.5 { d - (1.0 - 2.0 * s) * d * (1.0 - d) } else {
                                    let curve = if d <= 0.25 { ((16.0 * d - 12.0) * d + 4.0) * d } else { d.sqrt() };
                                    d + (2.0 * s - 1.0) * (curve - d)
                                },
                                _ => unreachable!(),
                            };
                            let working = |v| if srgb { v } else { srgb_decode(v) };
                            let rgb = (sa * (1.0 - da) * working(s) + sa * da * working(mixed) + (1.0 - sa) * da * working(d)) * parent_opacity;
                            if srgb { rgb } else { srgb_encode(rgb) }
                        };
                        (value * 255.0).round() as u8
                    });
                    let at = (10 * 32 + 12) * 4;
                    let got = &pixels[at..at + 4];
                    assert!(got.iter().zip(expected).all(|(a, b)| a.abs_diff(b) <= 2), "{mode:?} srgb={srgb} dest alpha={da} nested={nested}: {got:?} != {expected:?}");
                }
            }
        }
    }
}

#[test]
fn a_css_isolated_subtree_excludes_the_window_from_its_blend_backdrop() {
    let mut state = crate::Ui::default();
    state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":32,"h":24,"bg":4278190335,"c":[{"k":"x","id":2,"pos":2,"ins":[4,3,"auto","auto"],"w":20,"h":16,"isolate":true,"c":[{"k":"x","id":3,"w":20,"h":16,"bg":65535,"blend":2}]}]}]}"#).unwrap().children;
    let mut runtime = rune::Runtime::new(state, crate::build::view, (32.0, 24.0), rune::Env::new(true, 1.0));
    runtime.frame(0.0);
    let gpu = Gpu::headless();
    let mut renderer = Renderer::new(&gpu.device, OFFSCREEN_FORMAT);
    let target = Offscreen::new(&gpu.device, 32, 24);
    renderer.prepare(&gpu.device, &gpu.queue, &mut runtime.text.atlas, &runtime.instances, (32, 24));
    let mut encoder = gpu.device.create_command_encoder(&Default::default());
    renderer.draw(&mut encoder, &target.view, [0.0; 4]);
    target.copy(&mut encoder);
    renderer.submit(&gpu.queue, encoder);
    let pixels = target.read(&gpu.device);
    assert_eq!(&pixels[(8 * 32 + 8) * 4..(8 * 32 + 9) * 4], &[0, 0, 255, 255]);
    assert_eq!(&pixels[0..4], &[255, 0, 0, 255]);
}

#[test]
fn background_blends_keep_their_base_alpha_polygon_and_border_paint_order() {
    let gpu = Gpu::headless();
    for clipped in [false, true] {
        let polygon: Vec<[f32; 4]> = if clipped { vec![[0.0, 0.5, 0.0, 0.0], [0.0, 1.0, 0.0, 0.5], [0.0, 0.5, 0.0, 1.0], [0.0, 0.0, 0.0, 0.5]] } else { vec![] };
        let spec = serde_json::json!({"children":[{"k":"x","id":1,"w":32,"h":24,"bg":0x00ff00ff_u32,"c":[
            {"k":"x","id":2,"pos":2,"ins":[4,3,"auto","auto"],"w":20,"h":16,"bg":0xff000080_u32,
             "ly":[{"flat":0x0000ffff_u32,"blend":2}],"cp":polygon,"bw":if clipped {[0;4]} else {[2;4]},"bc":0xff000080_u32}
        ]}]}).to_string();
        let mut state = crate::Ui::default();
        state.root = crate::spec::parse_spec(&spec).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (32.0, 24.0), rune::Env::new(true, 1.0));
        for _ in 0..3 { runtime.frame(0.0); }
        let mut renderer = Renderer::new(&gpu.device, OFFSCREEN_FORMAT);
        let target = Offscreen::new(&gpu.device, 32, 24);
        renderer.prepare(&gpu.device, &gpu.queue, &mut runtime.text.atlas, &runtime.instances, (32, 24));
        let mut encoder = gpu.device.create_command_encoder(&Default::default());
        renderer.draw(&mut encoder, &target.view, [0.0; 4]);
        target.copy(&mut encoder);
        renderer.submit(&gpu.queue, encoder);
        let pixels = target.read(&gpu.device);
        let pixel = |x: usize, y: usize| &pixels[(y * 32 + x) * 4..(y * 32 + x + 1) * 4];
        let near = |got: &[u8], want: [u8; 4]| assert!(got.iter().zip(want).all(|(a,b)| a.abs_diff(b) <= 2), "clipped={clipped}: {got:?} != {want:?}");
        near(pixel(12,10), [0,0,187,255]);
        if clipped { near(pixel(4,3), [0,255,0,255]); }
        else { near(pixel(4,10), [188,0,136,255]); }
    }
}

#[test]
fn css_blurs_preserve_the_requested_standard_deviation() {
    let gpu = Gpu::headless();
    let draw = |backdrop| {
        let mut children = vec![serde_json::json!({"k":"x","id":2,"w":64,"h":64,"blur":if backdrop {0} else {4},"c":[
            {"k":"x","id":3,"w":32,"h":64,"bg":0x000000ff_u32},{"k":"x","id":4,"w":32,"h":64,"bg":0xffffffff_u32}
        ]})];
        if backdrop { children.push(serde_json::json!({"k":"x","id":5,"pos":2,"ins":[0,0,0,0],"bblur":4})); }
        let mut state = crate::Ui::default();
        state.root = crate::spec::parse_spec(&serde_json::json!({"children":[{"k":"x","id":1,"w":64,"h":64,"c":children}]}).to_string()).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (64.0,64.0), rune::Env::new(true,1.0));
        runtime.frame(0.0);
        let mut renderer = Renderer::new(&gpu.device, OFFSCREEN_FORMAT);
        let target = Offscreen::new(&gpu.device,64,64);
        renderer.prepare(&gpu.device,&gpu.queue,&mut runtime.text.atlas,&runtime.instances,(64,64));
        let mut encoder = gpu.device.create_command_encoder(&Default::default());
        renderer.draw(&mut encoder,&target.view,[0.0;4]); target.copy(&mut encoder); renderer.submit(&gpu.queue,encoder);
        target.read(&gpu.device)
    };
    // A step edge's derivative is its line-spread kernel. Measure its variance because Rune's
    // foreground Gaussian and backdrop pyramid approximate that kernel differently.
    for backdrop in [false,true] {
        let pixels=draw(backdrop);
        let sigma=line_spread(&pixels,64,32,32);
        assert!((sigma-4.0).abs()<0.4,"backdrop={backdrop}: requested sigma 4, measured {sigma}");
    }
}

#[test]
fn every_visible_backdrop_blurs_when_the_surface_count_grows_and_shrinks() {
    let gpu=Gpu::headless();
    let mut renderer=Renderer::new(&gpu.device,OFFSCREEN_FORMAT);
    let target=Offscreen::new(&gpu.device,288,96);
    for count in [1,9,2,9] {
        let mut children: Vec<_>=(0..3).map(|column| serde_json::json!({"k":"x","id":10+column*3,"w":96,"h":96,"c":[
            {"k":"x","id":11+column*3,"w":48,"h":96,"bg":0x000000ff_u32},
            {"k":"x","id":12+column*3,"w":48,"h":96,"bg":0xffffffff_u32}
        ]})).collect();
        for index in 0..count { children.push(serde_json::json!({"k":"x","id":100+index,"pos":2,"ins":[index%3*96,index/3*32,"auto","auto"],"w":96,"h":32,"bblur":4})); }
        let mut state=crate::Ui::default();
        state.root=crate::spec::parse_spec(&serde_json::json!({"children":[{"k":"x","id":1,"w":288,"h":96,"c":children}]}).to_string()).unwrap().children;
        let mut runtime=rune::Runtime::new(state,crate::build::view,(288.0,96.0),rune::Env::new(true,1.0));
        runtime.frame(0.0);
        renderer.prepare(&gpu.device,&gpu.queue,&mut runtime.text.atlas,&runtime.instances,(288,96));
        let mut encoder=gpu.device.create_command_encoder(&Default::default());
        renderer.draw(&mut encoder,&target.view,[0.0;4]); target.copy(&mut encoder); renderer.submit(&gpu.queue,encoder);
        let pixels=target.read(&gpu.device);
        for index in 0..count {
            let sigma=line_spread(&pixels,288,index%3*96+48,index/3*32+16);
            assert!((sigma-4.0).abs()<0.4,"surface {} of {count}: requested sigma 4, measured {sigma}",index+1);
        }
    }
}
