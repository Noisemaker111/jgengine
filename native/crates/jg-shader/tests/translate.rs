//! Whole programs through `translate`, for shapes a game drew wrong or not at all on WebGPU.

const VERT: &str = "#version 300 es\nprecision highp float;\nin vec3 position;\nout vec2 vUv;\nvoid main() { vUv = position.xy; gl_Position = vec4(position, 1.0); }";

fn frag(body: &str) -> String {
    format!("#version 300 es\nprecision highp float;\nprecision highp sampler2DShadow;\nin vec2 vUv;\nlayout(location = 0) out highp vec4 pc_fragColor;\n{body}")
}

#[test]
fn a_one_element_sampler_array_keeps_its_index_with_the_name() {
    // Deepward's one spot light: three declares `spotShadowMap[ 1 ]` and passes `spotShadowMap[ 0 ]`
    // to its shadow function. Replacing the bare name left `sampler2DShadow(t, s)[ 0 ]`, which did
    // not translate, so every lit material in the scene went undrawn.
    let fs = frag(
        "uniform sampler2DShadow spotShadowMap[ 1 ];\n\
         float getShadow( sampler2DShadow shadowMap, vec3 coord ) { return texture( shadowMap, coord ); }\n\
         void main() { pc_fragColor = vec4( getShadow( spotShadowMap[ 0 ], vec3( vUv, 0.5 ) ) ); }",
    );
    let out = jg_shader::translate(VERT, &fs).expect("translates");
    let slots: Vec<(String, u32, bool)> = out.layout.samplers.iter().map(|s| (s.name.clone(), s.element, s.array)).collect();
    // Marked as an array, so the context names it `spotShadowMap[0]` to three as GL does; under the
    // bare name three bound its 1x1 color placeholder where a depth texture belongs, and the bind
    // group failed for every lit draw (Deepward rendered black).
    assert_eq!(slots, vec![("spotShadowMap".to_string(), 0, true)]);
}

#[test]
fn isinf_and_isnan_read_the_bits_on_scalars_and_vectors() {
    // WGSL has neither, so naga refused the program (Drift Foundry's track went undrawn).
    let fs = frag(
        "uniform float k;\n\
         void main() { vec3 v = vec3( vUv, k ); bool a = isinf( k ) || isnan( k ); bvec3 b = isinf( v ); bvec2 c = isnan( v.xy );\n\
         pc_fragColor = vec4( a ? 1.0 : 0.0, any( b ) ? 1.0 : 0.0, any( c ) ? 1.0 : 0.0, 1.0 ); }",
    );
    let out = jg_shader::translate(VERT, &fs).expect("translates");
    assert!(out.fragment_wgsl.contains("2139095040u"), "compares against the exponent bits 0x7f800000:\n{}", out.fragment_wgsl);
}
