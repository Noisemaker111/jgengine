//! Rewrite preprocessed three.js GLSL ES 3.00 into Vulkan-style GLSL 4.50 that naga accepts and
//! that runs the same on WebGPU. See the module doc in `mod.rs` for the list of rewrites.

use super::preprocess::{tokenize, Tok};
use super::{SamplerSlot, UniformBlock, UniformSlot, VertexInput};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SamplerKind {
    Float,
    Depth,
    Sint,
    Uint,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TextureDim {
    D2,
    Cube,
    D3,
    D2Array,
}

pub struct Renames {
    /// bool uniforms stored as int: original name.
    pub bools: HashSet<String>,
    /// scalar / vec2 arrays stored as vec4 arrays: original name -> (member name, components).
    pub arrays: HashMap<String, (String, u32)>,
}

pub struct Rewritten {
    pub vertex: String,
    pub fragment: String,
    pub inputs: Vec<VertexInput>,
    pub samplers: Vec<SamplerSlot>,
    pub renames: Renames,
    pub fragment_outputs: u32,
    /// Estimated bytes per block; `object_size_hint` is 0 for an unsplit rewrite.
    pub shared_size_hint: u32,
    pub object_size_hint: u32,
}

/// Uniform names that stay constant while a frame's draws run — the camera, the fog, the lights
/// and the renderer's own state — so the backend can keep their bytes resident and upload only
/// changed spans. Everything else (object transforms, morph weights, material values, custom
/// uniforms) goes to the per-object block, which restages whenever a draw changes it: putting a
/// per-draw uniform in the shared block would force a submit between the draws that see different
/// values, so the default is object and only names known frame-constant belong here.
const SHARED_UNIFORMS: &[&str] = &[
    "projectionMatrix",
    "viewMatrix",
    "cameraPosition",
    "isOrthographic",
    "logDepthBufFC",
    "toneMappingExposure",
    "fogColor",
    "fogDensity",
    "fogNear",
    "fogFar",
    "directionalLights",
    "pointLights",
    "spotLights",
    "hemisphereLights",
    "rectAreaLights",
    "sunLights",
    "directionalLightShadows",
    "pointLightShadows",
    "spotLightShadows",
    "sunLightShadows",
    "ambientLightColor",
    "lightProbe",
    "probesMin",
    "probesMax",
    "probesResolution",
    "directionalShadowMatrix",
    "pointShadowMatrix",
    "spotLightMatrix",
    "sunShadowMatrix",
    "sunShadowCascade",
    "clippingPlanes",
];

fn sampler_info(ty: &str) -> Option<(&'static str, &'static str, &'static str, SamplerKind, TextureDim)> {
    // (texture type, sampler type, combined constructor, kind, dim)
    Some(match ty {
        "sampler2D" => ("texture2D", "sampler", "sampler2D", SamplerKind::Float, TextureDim::D2),
        "sampler2DShadow" => ("texture2D", "samplerShadow", "sampler2DShadow", SamplerKind::Depth, TextureDim::D2),
        "samplerCube" => ("textureCube", "sampler", "samplerCube", SamplerKind::Float, TextureDim::Cube),
        "samplerCubeShadow" => ("textureCube", "samplerShadow", "samplerCubeShadow", SamplerKind::Depth, TextureDim::Cube),
        "sampler3D" => ("texture3D", "sampler", "sampler3D", SamplerKind::Float, TextureDim::D3),
        "sampler2DArray" => ("texture2DArray", "sampler", "sampler2DArray", SamplerKind::Float, TextureDim::D2Array),
        "sampler2DArrayShadow" => ("texture2DArray", "samplerShadow", "sampler2DArrayShadow", SamplerKind::Depth, TextureDim::D2Array),
        "isampler2D" => ("itexture2D", "sampler", "isampler2D", SamplerKind::Sint, TextureDim::D2),
        "usampler2D" => ("utexture2D", "sampler", "usampler2D", SamplerKind::Uint, TextureDim::D2),
        "isampler3D" => ("itexture3D", "sampler", "isampler3D", SamplerKind::Sint, TextureDim::D3),
        "usampler3D" => ("utexture3D", "sampler", "usampler3D", SamplerKind::Uint, TextureDim::D3),
        "isampler2DArray" => ("itexture2DArray", "sampler", "isampler2DArray", SamplerKind::Sint, TextureDim::D2Array),
        "usampler2DArray" => ("utexture2DArray", "sampler", "usampler2DArray", SamplerKind::Uint, TextureDim::D2Array),
        _ => return None,
    })
}

const QUALIFIERS: [&str; 10] = ["highp", "mediump", "lowp", "flat", "smooth", "centroid", "invariant", "noperspective", "precise", "const"];

fn is_space(t: &Tok) -> bool {
    matches!(t, Tok::Space | Tok::Newline)
}

fn text(toks: &[Tok]) -> String {
    toks.iter().map(|t| t.text()).collect()
}

fn sig(toks: &[Tok]) -> Vec<Tok> {
    toks.iter().filter(|t| !is_space(t)).cloned().collect()
}

#[derive(Debug, Clone)]
enum Item {
    Precision,
    Uniform { ty: String, decls: Vec<(String, Option<String>)> },
    In { flat: bool, ty: String, name: String, arr: Option<String> },
    Out { location: Option<u32>, flat: bool, ty: String, name: String, arr: Option<String> },
    Struct(Vec<Tok>),
    Function { name: String, header: Vec<Tok>, body: Vec<Tok> },
    Other(Vec<Tok>),
}

/// Declarators after the type: `a`, `b[ 4 ]`, `c` separated by commas.
fn declarators(toks: &[Tok]) -> Vec<(String, Option<String>)> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < toks.len() {
        if let Tok::Ident(name) = &toks[i] {
            let mut arr = None;
            if i + 1 < toks.len() && toks[i + 1].is("[") {
                let mut j = i + 2;
                let mut s = String::new();
                while j < toks.len() && !toks[j].is("]") {
                    s.push_str(toks[j].text());
                    j += 1;
                }
                arr = Some(s);
                i = j;
            }
            out.push((name.clone(), arr));
        }
        i += 1;
    }
    out
}

fn split_items(src: &str) -> Result<Vec<Item>, String> {
    let toks = tokenize(src);
    let mut items = Vec::new();
    let mut i = 0;
    while i < toks.len() {
        // Gather one top-level statement or function.
        let start = i;
        let mut depth_paren = 0;
        let mut end = None;
        let mut is_function = false;
        while i < toks.len() {
            let t = &toks[i];
            if t.is("(") {
                depth_paren += 1;
            } else if t.is(")") {
                depth_paren -= 1;
            } else if t.is(";") && depth_paren == 0 {
                end = Some(i + 1);
                break;
            } else if t.is("{") && depth_paren == 0 {
                let first = sig(&toks[start..i]).first().map(|t| t.text().to_string()).unwrap_or_default();
                // Skip the braces; a struct continues to its ';', a function ends at '}'.
                let mut depth = 0;
                while i < toks.len() {
                    if toks[i].is("{") {
                        depth += 1;
                    } else if toks[i].is("}") {
                        depth -= 1;
                        if depth == 0 {
                            break;
                        }
                    }
                    i += 1;
                }
                if first == "struct" || first == "uniform" {
                    i += 1;
                    continue;
                }
                is_function = true;
                end = Some(i + 1);
                break;
            }
            i += 1;
        }
        let end = end.unwrap_or(toks.len());
        i = end;
        let stmt = &toks[start..end];
        let s = sig(stmt);
        if s.is_empty() {
            continue;
        }
        let first = s[0].text().to_string();
        if is_function {
            let brace = stmt.iter().position(|t| t.is("{")).unwrap();
            let header = stmt[..brace].to_vec();
            let hs = sig(&header);
            let paren = hs.iter().position(|t| t.is("(")).ok_or("function without (")?;
            let name = hs[paren - 1].text().to_string();
            items.push(Item::Function { name, header, body: stmt[brace..].to_vec() });
            continue;
        }
        if first == "precision" {
            items.push(Item::Precision);
            continue;
        }
        if first == "struct" {
            items.push(Item::Struct(stmt.to_vec()));
            continue;
        }
        // Strip layout(...) and qualifiers.
        let mut location = None;
        let mut rest: Vec<Tok> = Vec::new();
        let mut k = 0;
        let mut flat = false;
        while k < s.len() {
            if s[k].is("layout") {
                let close = s[k..].iter().position(|t| t.is(")")).unwrap() + k;
                for w in s[k..close].windows(3) {
                    if w[0].is("location") && w[1].is("=") {
                        location = w[2].text().parse::<u32>().ok();
                    }
                }
                k = close + 1;
                continue;
            }
            if QUALIFIERS.contains(&s[k].text()) && !(s[k].is("const") && rest.is_empty() && first == "const") {
                if s[k].is("flat") {
                    flat = true;
                }
                k += 1;
                continue;
            }
            rest.push(s[k].clone());
            k += 1;
        }
        let head = rest.first().map(|t| t.text().to_string()).unwrap_or_default();
        match head.as_str() {
            "uniform" if rest.len() >= 3 && !rest.iter().any(|t| t.is("{")) => {
                let ty = rest[1].text().to_string();
                items.push(Item::Uniform { ty, decls: declarators(&rest[2..rest.len() - 1]) });
            }
            "in" | "out" if rest.len() >= 3 => {
                let ty = rest[1].text().to_string();
                let d = declarators(&rest[2..rest.len() - 1]);
                for (name, arr) in d {
                    if head == "in" {
                        items.push(Item::In { flat, ty: ty.clone(), name, arr });
                    } else {
                        items.push(Item::Out { location, flat, ty: ty.clone(), name, arr });
                    }
                }
            }
            _ => items.push(Item::Other(stmt.to_vec())),
        }
    }
    Ok(items)
}

/// A struct definition padded at its end to a multiple of 16 bytes. std140 rounds a struct's
/// alignment and size up to a vec4's, so an array of three's `DirectionalLightShadow` (four floats
/// and a vec2, 24 bytes) strides 32 in GL; naga's GLSL reader keeps the natural 24, which WGSL
/// rejects in a uniform buffer. Trailing padding moves no member. A struct with a member type this
/// does not size is left as is (the emitted WGSL's validation then names it).
fn std140_struct(def: &str) -> String {
    let (Some(open), Some(close)) = (def.find('{'), def.rfind('}')) else { return def.to_string() };
    let mut size = 0u32;
    for member in def[open + 1..close].split(';').map(str::trim).filter(|m| !m.is_empty()) {
        let mut words = member.split_whitespace().filter(|w| !matches!(*w, "highp" | "mediump" | "lowp"));
        let Some(ty) = words.next() else { return def.to_string() };
        let (bytes, align) = match ty {
            "float" | "int" | "uint" | "bool" => (4, 4),
            "vec2" | "ivec2" | "uvec2" => (8, 8),
            "vec3" | "ivec3" | "uvec3" => (12, 16),
            "vec4" | "ivec4" | "uvec4" => (16, 16),
            "mat3" => (48, 16),
            "mat4" => (64, 16),
            _ => return def.to_string(),
        };
        // An array member strides 16 per element in std140; three's uniform structs have none.
        if words.collect::<String>().contains('[') {
            return def.to_string();
        }
        size = size.next_multiple_of(align) + bytes;
    }
    let pad = (size.next_multiple_of(16) - size) / 4;
    if pad == 0 {
        return def.to_string();
    }
    let fill: String = (0..pad).map(|i| format!(" float jg_pad{i};")).collect();
    format!("{}{fill} {}", def[..close].trim_end(), &def[close..])
}

/// What a uniform type takes in std140 and how much a vec4-array rewrite needs.
fn components(ty: &str) -> Option<(char, u32)> {
    Some(match ty {
        "float" => ('f', 1),
        "vec2" => ('f', 2),
        "int" => ('i', 1),
        "ivec2" => ('i', 2),
        "uint" => ('u', 1),
        "uvec2" => ('u', 2),
        _ => return None,
    })
}

fn vec4_of(kind: char) -> &'static str {
    match kind {
        'i' => "ivec4",
        'u' => "uvec4",
        _ => "vec4",
    }
}

fn swizzle(n: u32) -> &'static str {
    match n {
        1 => "x",
        2 => "xy",
        3 => "xyz",
        _ => "xyzw",
    }
}

fn attr_shape(ty: &str) -> Result<(u32, u32, char), String> {
    // (columns, components per column, kind)
    Ok(match ty {
        "float" => (1, 1, 'f'),
        "vec2" => (1, 2, 'f'),
        "vec3" => (1, 3, 'f'),
        "vec4" => (1, 4, 'f'),
        "int" => (1, 1, 'i'),
        "ivec2" => (1, 2, 'i'),
        "ivec3" => (1, 3, 'i'),
        "ivec4" => (1, 4, 'i'),
        "uint" => (1, 1, 'u'),
        "uvec2" => (1, 2, 'u'),
        "uvec3" => (1, 3, 'u'),
        "uvec4" => (1, 4, 'u'),
        "mat2" => (2, 2, 'f'),
        "mat3" => (3, 3, 'f'),
        "mat4" => (4, 4, 'f'),
        other => return Err(format!("unsupported attribute type {other}")),
    })
}

fn col_type(n: u32, kind: char) -> String {
    let base = match kind {
        'i' => "ivec",
        'u' => "uvec",
        _ => "vec",
    };
    if n == 1 {
        match kind {
            'i' => "int".into(),
            'u' => "uint".into(),
            _ => "float".into(),
        }
    } else {
        format!("{base}{n}")
    }
}

/// Replacement rules applied to code tokens.
struct Rules {
    /// identifier -> replacement text (not after '.').
    simple: HashMap<String, String>,
    /// identifier followed by `[ k ]` -> replacement per literal index.
    indexed_literal: HashMap<String, Vec<String>>,
    /// identifier followed by `[ expr ]` -> (prefix, suffix) around `[ expr ]`.
    indexed_any: HashMap<String, (String, String)>,
    /// functions with sampler parameters: name -> parameter positions.
    sampler_params: HashMap<String, HashSet<usize>>,
}

fn apply(toks: &[Tok], rules: &Rules, local: &HashMap<String, String>) -> Result<Vec<Tok>, String> {
    let mut out: Vec<Tok> = Vec::with_capacity(toks.len());
    let mut i = 0;
    let prev_sig = |out: &Vec<Tok>| out.iter().rev().find(|t| !is_space(t)).cloned();
    while i < toks.len() {
        let t = &toks[i];
        if let Tok::Ident(name) = t {
            let after_dot = prev_sig(&out).is_some_and(|p| p.is("."));
            if !after_dot {
                // Next significant token.
                let mut j = i + 1;
                while j < toks.len() && is_space(&toks[j]) {
                    j += 1;
                }
                let bracket = j < toks.len() && toks[j].is("[");
                if bracket {
                    // Find the matching ']'.
                    let mut depth = 0;
                    let mut k = j;
                    while k < toks.len() {
                        if toks[k].is("[") {
                            depth += 1;
                        } else if toks[k].is("]") {
                            depth -= 1;
                            if depth == 0 {
                                break;
                            }
                        }
                        k += 1;
                    }
                    let inner = &toks[j + 1..k];
                    if let Some(list) = rules.indexed_literal.get(name) {
                        let idx: usize = text(&sig(inner)).parse().map_err(|_| format!("sampler array {name} indexed by a non-literal `{}`", text(inner)))?;
                        let rep = list.get(idx).ok_or(format!("{name}[{idx}] out of range"))?;
                        out.extend(tokenize(rep));
                        i = k + 1;
                        continue;
                    }
                    if let Some((pre, suf)) = rules.indexed_any.get(name) {
                        let inner = apply(inner, rules, local)?;
                        out.extend(tokenize(pre));
                        out.push(Tok::Punct("[".into()));
                        out.extend(inner);
                        out.push(Tok::Punct("]".into()));
                        out.extend(tokenize(suf));
                        i = k + 1;
                        continue;
                    }
                }
                if let Some(rep) = local.get(name).or_else(|| rules.simple.get(name)) {
                    out.extend(tokenize(rep));
                    i += 1;
                    continue;
                }
                // A call to a function that takes samplers: unwrap `samplerX(t, s)` arguments.
                if let Some(positions) = rules.sampler_params.get(name) {
                    let mut j = i + 1;
                    while j < toks.len() && is_space(&toks[j]) {
                        j += 1;
                    }
                    if j < toks.len() && toks[j].is("(") {
                        let mut depth = 0;
                        let mut k = j;
                        let mut args: Vec<Vec<Tok>> = vec![Vec::new()];
                        while k < toks.len() {
                            let tk = &toks[k];
                            if tk.is("(") {
                                depth += 1;
                                if depth > 1 {
                                    args.last_mut().unwrap().push(tk.clone());
                                }
                            } else if tk.is(")") {
                                depth -= 1;
                                if depth == 0 {
                                    break;
                                }
                                args.last_mut().unwrap().push(tk.clone());
                            } else if tk.is(",") && depth == 1 {
                                args.push(Vec::new());
                            } else {
                                args.last_mut().unwrap().push(tk.clone());
                            }
                            k += 1;
                        }
                        out.push(t.clone());
                        out.push(Tok::Punct("(".into()));
                        for (ai, a) in args.iter().enumerate() {
                            if ai > 0 {
                                out.push(Tok::Punct(",".into()));
                            }
                            let a = apply(a, rules, local)?;
                            if positions.contains(&ai) {
                                // `sampler2D ( t , s )` -> `t , s`
                                let s = sig(&a);
                                if s.len() >= 6 && s[1].is("(") && s.last().unwrap().is(")") {
                                    out.extend(s[2..s.len() - 1].iter().cloned());
                                    continue;
                                }
                                return Err(format!("call to {name}: sampler argument {ai} is `{}`", text(&a)));
                            }
                            out.extend(a);
                        }
                        out.push(Tok::Punct(")".into()));
                        i = k + 1;
                        continue;
                    }
                }
            }
        }
        out.push(t.clone());
        i += 1;
    }
    Ok(out)
}

/// Rewrite a function header's sampler parameters; returns the header, the positions, and the
/// local replacements for the body.
fn rewrite_params(header: &[Tok]) -> (Vec<Tok>, HashSet<usize>, HashMap<String, String>) {
    let open = header.iter().position(|t| t.is("(")).unwrap();
    let close = header.iter().rposition(|t| t.is(")")).unwrap();
    let params = &header[open + 1..close];
    let mut parts: Vec<Vec<Tok>> = vec![Vec::new()];
    for t in params {
        if t.is(",") {
            parts.push(Vec::new());
        } else {
            parts.last_mut().unwrap().push(t.clone());
        }
    }
    let mut positions = HashSet::new();
    let mut local = HashMap::new();
    let mut new_parts = Vec::new();
    for (pi, p) in parts.iter().enumerate() {
        let s: Vec<Tok> = sig(p).into_iter().filter(|t| !QUALIFIERS.contains(&t.text()) && !t.is("in")).collect();
        if s.len() == 2
            && let Some((tex, smp, ctor, _, _)) = sampler_info(s[0].text())
        {
            let name = s[1].text();
            positions.insert(pi);
            local.insert(name.to_string(), format!("{ctor}({name}_jgt, {name}_jgs)"));
            new_parts.push(format!("{tex} {name}_jgt, {smp} {name}_jgs"));
            continue;
        }
        let kept: Vec<Tok> = p.iter().filter(|t| !t.is("const") && !t.is("in")).cloned().collect();
        new_parts.push(text(&kept));
    }
    let mut out = header[..open + 1].to_vec();
    out.extend(tokenize(&new_parts.join(",")));
    out.extend(header[close..].iter().cloned());
    (out, positions, local)
}

pub fn rewrite(vert: &str, frag: &str, split: bool) -> Result<Rewritten, String> {
    let vitems = exact_hash_corners(split_items(vert)?);
    let fitems = exact_hash_corners(split_items(frag)?);

    // Uniforms of both stages, in first-seen order; one block shared by both.
    let mut block: Vec<(String, String, Option<String>)> = Vec::new(); // (type, name, array)
    let mut samplers: BTreeMap<String, (String, u32, bool)> = BTreeMap::new(); // name -> (type, count, declared as an array)
    let mut sampler_order: Vec<String> = Vec::new();
    let mut structs: Vec<(String, Vec<Tok>)> = Vec::new();
    for items in [&vitems, &fitems] {
        for it in items.iter() {
            match it {
                Item::Uniform { ty, decls } => {
                    for (name, arr) in decls {
                        if sampler_info(ty).is_some() {
                            let count = arr.as_ref().map(|a| a.trim().parse::<u32>().unwrap_or(1)).unwrap_or(1);
                            if !samplers.contains_key(name) {
                                sampler_order.push(name.clone());
                            }
                            samplers.insert(name.clone(), (ty.clone(), count, arr.is_some()));
                        } else if !block.iter().any(|b| &b.1 == name) {
                            block.push((ty.clone(), name.clone(), arr.clone()));
                        }
                    }
                }
                Item::Struct(toks) => {
                    let s = sig(toks);
                    let name = s.get(1).map(|t| t.text().to_string()).unwrap_or_default();
                    if !structs.iter().any(|(n, _)| n == &name) {
                        structs.push((name, toks.clone()));
                    }
                }
                _ => {}
            }
        }
    }

    let mut rules = Rules { simple: HashMap::new(), indexed_literal: HashMap::new(), indexed_any: HashMap::new(), sampler_params: HashMap::new() };
    let mut renames = Renames { bools: HashSet::new(), arrays: HashMap::new() };
    rules.simple.insert("gl_InstanceID".into(), "gl_InstanceIndex".into());
    rules.simple.insert("gl_VertexID".into(), "gl_VertexIndex".into());
    // naga's GLSL frontend has no modf(x, out i); WebGPU has no point sprites, so a points
    // shader's gl_PointCoord is the sprite centre (no recorded draw uses points).
    rules.simple.insert("modf".into(), "jg_modf".into());
    // WGSL has no isinf / isnan (naga: "Unsupported relational function: IsInf", Drift Foundry's
    // track shader went undrawn); read the bits instead, which no fast-math pass can fold away.
    rules.simple.insert("isinf".into(), "jg_isinf".into());
    rules.simple.insert("isnan".into(), "jg_isnan".into());
    rules.simple.insert("gl_PointCoord".into(), "vec2(0.5)".into());
    let mut shared_members = String::new();
    let mut object_members = String::new();
    let mut shared_hint = 0u32;
    let mut object_hint = 0u32;
    for (ty, name, arr) in &block {
        let (members, hint) = if split && !SHARED_UNIFORMS.contains(&name.as_str()) {
            (&mut object_members, &mut object_hint)
        } else {
            (&mut shared_members, &mut shared_hint)
        };
        if ty == "bool" {
            if arr.is_some() {
                return Err(format!("bool array uniform {name}"));
            }
            renames.bools.insert(name.clone());
            rules.simple.insert(name.clone(), format!("({name}_jgb != 0)"));
            members.push_str(&format!("  int {name}_jgb;\n"));
            *hint += 16;
            continue;
        }
        if let (Some(a), Some((kind, n))) = (arr, components(ty)) {
            let member = format!("{name}_jga");
            renames.arrays.insert(name.clone(), (member.clone(), n));
            rules.indexed_any.insert(name.clone(), (member.clone(), format!(".{}", swizzle(n))));
            members.push_str(&format!("  {} {member}[{a}];\n", vec4_of(kind)));
            *hint += 16 * a.trim().parse::<u32>().unwrap_or(1);
            continue;
        }
        match arr {
            Some(a) => members.push_str(&format!("  {ty} {name}[{a}];\n")),
            None => members.push_str(&format!("  {ty} {name};\n")),
        }
        *hint += 16;
    }

    // Samplers: a texture and a sampler binding each, in group 1.
    let mut sampler_decls = String::new();
    let mut slots = Vec::new();
    let mut binding = 0u32;
    for name in &sampler_order {
        let (ty, count, array) = &samplers[name];
        let (tex, smp, ctor, kind, dim) = sampler_info(ty).unwrap();
        let mut per = Vec::new();
        for e in 0..*count {
            let suffix = if *count > 1 { format!("{e}") } else { String::new() };
            let t = format!("{name}_jgt{suffix}");
            let s = format!("{name}_jgs{suffix}");
            sampler_decls.push_str(&format!("layout(set = 1, binding = {binding}) uniform {tex} {t};\nlayout(set = 1, binding = {}) uniform {smp} {s};\n", binding + 1));
            slots.push(SamplerSlot { name: name.clone(), element: e, texture_binding: binding, sampler_binding: binding + 1, kind, dim, array: *array });
            binding += 2;
            per.push(format!("{ctor}({t}, {s})"));
        }
        // An array of one (Deepward's one spot light: `spotShadowMap[ 0 ]`) is still indexed, so the
        // index goes with the name; replacing the bare name left `sampler2DShadow(t, s)[ 0 ]`.
        if *count > 1 || *array {
            rules.indexed_literal.insert(name.clone(), per);
        } else {
            rules.simple.insert(name.clone(), per.pop().unwrap());
        }
    }

    // Functions with sampler parameters (both stages define their own).
    for items in [&vitems, &fitems] {
        for it in items.iter() {
            if let Item::Function { name, header, .. } = it {
                let (_, positions, _) = rewrite_params(header);
                if !positions.is_empty() {
                    rules.sampler_params.insert(name.clone(), positions);
                }
            }
        }
    }

    // Varyings: locations from the vertex outputs; an array takes one location per element.
    let mut varyings: Vec<(String, u32)> = Vec::new();
    for it in &vitems {
        if let Item::Out { name, arr, .. } = it {
            varyings.push((name.clone(), arr_len(arr)?));
        }
    }
    let location_of = |varyings: &Vec<(String, u32)>, name: &str| -> Option<u32> {
        let mut at = 0;
        for (n, c) in varyings {
            if n == name {
                return Some(at);
            }
            at += c;
        }
        None
    };

    let uses_modf = vert.contains("modf") || frag.contains("modf");
    let uses_float_class = ["isinf", "isnan"].iter().any(|f| vert.contains(f) || frag.contains(f));
    let header = |shared_members: &str, object_members: &str| -> String {
        let mut s = String::from("#version 450\n");
        for (name, toks) in &structs {
            // Only a struct the uniform block holds takes std140 padding; the others are built with
            // constructors in the shader body, which padding would break.
            let def = text(toks);
            s.push_str(&if block.iter().any(|(ty, _, _)| ty == name) { std140_struct(&def) } else { def });
            s.push('\n');
        }
        if uses_modf {
            for t in ["float", "vec2", "vec3", "vec4"] {
                s.push_str(&format!("{t} jg_modf({t} x, out {t} i) {{ i = trunc(x); return x - i; }}\n"));
            }
        }
        if uses_float_class {
            s.push_str("bool jg_isinf(float x) { return (floatBitsToUint(x) & 0x7fffffffu) == 0x7f800000u; }\n");
            s.push_str("bool jg_isnan(float x) { return (floatBitsToUint(x) & 0x7fffffffu) > 0x7f800000u; }\n");
            for (n, c) in [(2, "xy"), (3, "xyz"), (4, "xyzw")] {
                for f in ["jg_isinf", "jg_isnan"] {
                    let parts: Vec<String> = c.chars().map(|k| format!("{f}(x.{k})")).collect();
                    s.push_str(&format!("bvec{n} {f}(vec{n} x) {{ return bvec{n}({}); }}\n", parts.join(", ")));
                }
            }
        }
        if split {
            if !shared_members.is_empty() {
                s.push_str("layout(set = 0, binding = 0, std140) uniform JgShared {\n");
                s.push_str(shared_members);
                s.push_str("};\n");
            }
            if !object_members.is_empty() {
                s.push_str("layout(set = 0, binding = 1, std140) uniform JgObject {\n");
                s.push_str(object_members);
                s.push_str("};\n");
            }
        } else if !shared_members.is_empty() {
            s.push_str("layout(set = 0, binding = 0, std140) uniform JgUniforms {\n");
            s.push_str(shared_members);
            s.push_str("};\n");
        }
        s.push_str(&sampler_decls);
        s
    };

    // ---- vertex ----
    let mut vsrc = header(&shared_members, &object_members);
    let mut inputs = Vec::new();
    let mut location = 0u32;
    let mut setup = String::new();
    for it in &vitems {
        if let Item::In { ty, name, arr, .. } = it {
            if arr.is_some() {
                return Err(format!("array attribute {name}"));
            }
            let (cols, n, kind) = attr_shape(ty)?;
            if cols == 1 {
                vsrc.push_str(&format!("layout(location = {location}) in {ty} {name};\n"));
                inputs.push(VertexInput { name: name.clone(), column: 0, location, components: n, kind });
                location += 1;
            } else {
                let mut parts = Vec::new();
                for c in 0..cols {
                    vsrc.push_str(&format!("layout(location = {location}) in {} {name}_jgc{c};\n", col_type(n, kind)));
                    inputs.push(VertexInput { name: name.clone(), column: c, location, components: n, kind });
                    parts.push(format!("{name}_jgc{c}"));
                    location += 1;
                }
                vsrc.push_str(&format!("{ty} {name};\n"));
                setup.push_str(&format!("  {name} = {ty}({});\n", parts.join(", ")));
            }
        }
    }
    let mut copy_out = String::new();
    for it in &vitems {
        if let Item::Out { flat, ty, name, arr, .. } = it {
            if ty.starts_with("mat") {
                return Err(format!("varying {ty} {name} needs splitting"));
            }
            let loc = location_of(&varyings, name).unwrap();
            let q = if *flat { "flat " } else { "" };
            match arr {
                None => vsrc.push_str(&format!("layout(location = {loc}) {q}out {ty} {name};\n")),
                Some(_) => {
                    let n = arr_len(arr)?;
                    vsrc.push_str(&format!("{ty} {name}[{n}];\n"));
                    for i in 0..n {
                        vsrc.push_str(&format!("layout(location = {}) {q}out {ty} {name}_jgv{i};\n", loc + i));
                        copy_out.push_str(&format!("  {name}_jgv{i} = {name}[{i}];\n"));
                    }
                }
            }
        }
    }
    emit_code(&vitems, &rules, &mut vsrc, true, true)?;
    vsrc.push_str(&format!(
        "void main() {{\n{setup}  jg_main();\n{copy_out}  gl_Position.y = -gl_Position.y;\n  gl_Position.z = (gl_Position.z + gl_Position.w) * 0.5;\n}}\n"
    ));

    // ---- fragment ----
    let mut fsrc = header(&shared_members, &object_members);
    let mut outputs = 0u32;
    let mut copy_in = String::new();
    for it in &fitems {
        match it {
            Item::In { flat, ty, name, arr } => {
                let n = arr_len(arr)?;
                let Some(loc) = location_of(&varyings, name) else {
                    // An input the vertex stage never declares: GLSL ES links that only when the
                    // fragment shader never uses it (three's `#ifndef FLAT_SHADED` vNormal next to
                    // a vertex shader without it). It is not part of the interface here, just a
                    // private value nothing reads; WebGPU would demand the vertex stage supply it.
                    match arr {
                        None => fsrc.push_str(&format!("{ty} {name};
")),
                        Some(_) => fsrc.push_str(&format!("{ty} {name}[{n}];
")),
                    }
                    continue;
                };
                let q = if *flat { "flat " } else { "" };
                match arr {
                    None => fsrc.push_str(&format!("layout(location = {loc}) {q}in {ty} {name};\n")),
                    Some(_) => {
                        fsrc.push_str(&format!("{ty} {name}[{n}];\n"));
                        for i in 0..n {
                            fsrc.push_str(&format!("layout(location = {}) {q}in {ty} {name}_jgv{i};\n", loc + i));
                            copy_in.push_str(&format!("  {name}[{i}] = {name}_jgv{i};\n"));
                        }
                    }
                }
            }
            Item::Out { location, ty, name, .. } => {
                let loc = location.unwrap_or(outputs);
                outputs = outputs.max(loc + 1);
                fsrc.push_str(&format!("layout(location = {loc}) out {ty} {name};\n"));
            }
            _ => {}
        }
    }
    emit_code(&fitems, &rules, &mut fsrc, !copy_in.is_empty(), false)?;
    if !copy_in.is_empty() {
        fsrc.push_str(&format!("void main() {{\n{copy_in}  jg_main();\n}}\n"));
    }

    Ok(Rewritten {
        vertex: vsrc,
        fragment: fsrc,
        inputs,
        samplers: slots,
        renames,
        fragment_outputs: outputs.max(1),
        shared_size_hint: shared_hint,
        object_size_hint: if split { object_hint } else { 0 },
    })
}

fn arr_len(arr: &Option<String>) -> Result<u32, String> {
    match arr {
        None => Ok(1),
        Some(a) => a.trim().parse::<u32>().map_err(|_| format!("array size `{a}` is not a number after preprocessing")),
    }
}

/// Remove `gl_PointSize = ...;` statements.
fn drop_point_size(toks: Vec<Tok>) -> Vec<Tok> {
    let mut out = Vec::with_capacity(toks.len());
    let mut i = 0;
    while i < toks.len() {
        if toks[i].is("gl_PointSize") {
            while i < toks.len() && !toks[i].is(";") {
                i += 1;
            }
            i += 1;
            continue;
        }
        out.push(toks[i].clone());
        i += 1;
    }
    out
}

/// Noise corners hashed with exactly the values GL hashes. Games build noise from a hash at a
/// cell's corners, `hash(i)`, `hash(i + vec2(1.0, 0.0))`, ... with `i = floor(p)`, where the hash
/// (`fract(sin(dot(p, k)) * 43758.5453)`, or `fract(p * 0.1031)` and friends) turns a rounding
/// difference in its argument into a different value. The noise is smooth only when a corner hashes
/// bit for bit the same from both cells that share it. NVIDIA's Vulkan compiler folds the constant
/// offset into what follows (`dot(i, k) + 127.1`, `i * 0.1031 + 0.1031`), which rounds differently,
/// and every cell edge jumps: Harbor Heat's clouds, wet patches and surfaces came out as blocks where
/// three (D3D through ANGLE) draws them smooth. Here such a corner is added in integers,
/// `vec2(ivec2(i) + ivec2(1, 0))`: the same value (a floored coordinate plus a whole offset), which
/// no compiler can fold. Touched only when that value is provably the same: a whole operand (between
/// `(`/`,` and `)`/`,`) adding whole numbers to a variable the function assigns once, from `floor(...)`.
fn exact_hash_corners(items: Vec<Item>) -> Vec<Item> {
    items
        .into_iter()
        .map(|it| match it {
            Item::Function { name, header, body } => {
                let body = hash_corners_in(&body);
                Item::Function { name, header, body }
            }
            other => other,
        })
        .collect()
}

fn hash_corners_in(body: &[Tok]) -> Vec<Tok> {
    let at: Vec<usize> = (0..body.len()).filter(|&i| !is_space(&body[i])).collect();
    let s = |k: usize| at.get(k).map(|&i| &body[i]);
    let ident = |k: usize| match s(k) {
        Some(Tok::Ident(v)) => Some(v.as_str()),
        _ => None,
    };
    // Variables with exactly one write in the function, and that write `= floor(`.
    let mut writes: HashMap<&str, u32> = HashMap::new();
    let mut floored: HashSet<&str> = HashSet::new();
    for k in 0..at.len() {
        let Some(v) = ident(k) else { continue };
        let next = s(k + 1);
        let before = k.checked_sub(1).and_then(|b| s(b));
        let written = next.is_some_and(|t| ["=", "+=", "-=", "*=", "/=", "%=", "++", "--"].iter().any(|o| t.is(o))) || before.is_some_and(|t| t.is("++") || t.is("--"));
        if written {
            *writes.entry(v).or_default() += 1;
            if next.is_some_and(|t| t.is("=")) && ident(k + 2) == Some("floor") && s(k + 3).is_some_and(|t| t.is("(")) {
                floored.insert(v);
            }
        }
    }
    floored.retain(|v| writes.get(v) == Some(&1));
    if floored.is_empty() {
        return body.to_vec();
    }
    let whole = |t: Option<&Tok>| match t {
        Some(Tok::Num(n)) => n.trim_end_matches(['f', 'F']).parse::<f64>().ok().filter(|v| v.fract() == 0.0 && v.abs() < 1e6).map(|v| v as i64),
        _ => None,
    };
    let edge = |t: Option<&Tok>, closing: &str| t.is_some_and(|t| t.is(",") || t.is(closing));
    let mut out = Vec::with_capacity(body.len());
    let mut copied = 0;
    let mut k = 1;
    while k < at.len() {
        let var = ident(k).filter(|v| floored.contains(v));
        let n = ident(k + 2).and_then(|t| t.strip_prefix("vec")).and_then(|d| d.parse::<usize>().ok()).filter(|n| (2..=4).contains(n));
        if let (Some(var), Some(n)) = (var, n) {
            if edge(s(k - 1), "(") && s(k + 1).is_some_and(|t| t.is("+")) && s(k + 3).is_some_and(|t| t.is("(")) {
                let mut offsets = Vec::new();
                let mut j = k + 4;
                for c in 0..n {
                    if c > 0 {
                        if !s(j).is_some_and(|t| t.is(",")) {
                            break;
                        }
                        j += 1;
                    }
                    match whole(s(j)) {
                        Some(v) => offsets.push(v.to_string()),
                        None => break,
                    }
                    j += 1;
                }
                if offsets.len() == n && s(j).is_some_and(|t| t.is(")")) && edge(s(j + 1), ")") {
                    out.extend_from_slice(&body[copied..at[k]]);
                    out.extend(tokenize(&format!("vec{n}(ivec{n}({var}) + ivec{n}({}))", offsets.join(", "))));
                    copied = at[j] + 1;
                    k = j + 1;
                    continue;
                }
            }
        }
        k += 1;
    }
    out.extend_from_slice(&body[copied..]);
    out
}

/// A vertex shader's `texture(s, uv)` as `textureLod(s, uv, 0.0)`: GLSL samples level 0 outside a
/// fragment shader (there are no derivatives to pick a level from), and WGSL allows only the
/// explicit-level form there. The same lookup, so the same pixels.
fn vertex_texture_lod(toks: Vec<Tok>) -> Vec<Tok> {
    let mut out: Vec<Tok> = Vec::with_capacity(toks.len());
    let mut close_at: Vec<usize> = Vec::new(); // paren depths whose `)` takes the level argument
    let mut depth = 0usize;
    let mut i = 0;
    while i < toks.len() {
        let t = &toks[i];
        if t.is("texture") {
            let mut j = i + 1;
            while j < toks.len() && is_space(&toks[j]) {
                j += 1;
            }
            if j < toks.len() && toks[j].is("(") {
                out.extend(tokenize("textureLod"));
                i += 1;
                close_at.push(depth + 1);
                continue;
            }
        }
        if t.is("(") {
            depth += 1;
        } else if t.is(")") {
            if close_at.last() == Some(&depth) {
                close_at.pop();
                out.extend(tokenize(", 0.0"));
            }
            depth = depth.saturating_sub(1);
        }
        out.push(t.clone());
        i += 1;
    }
    out
}

/// `wrap_main`: rename `main` to `jg_main` for a wrapper `main` the caller adds; `vertex`: the
/// vertex stage (its texture lookups sample level 0).
fn emit_code(items: &[Item], rules: &Rules, out: &mut String, wrap_main: bool, vertex: bool) -> Result<(), String> {
    let strip = |toks: Vec<Tok>| -> Vec<Tok> { toks.into_iter().filter(|t| !matches!(t, Tok::Ident(s) if s == "highp" || s == "mediump" || s == "lowp")).collect() };
    for it in items {
        match it {
            Item::Other(toks) => {
                let toks = strip(apply(toks, rules, &HashMap::new())?);
                out.push_str(&text(&toks));
                out.push('\n');
            }
            Item::Function { name, header, body } => {
                let (mut h, _, local) = rewrite_params(header);
                if wrap_main && name == "main" {
                    h = tokenize(&text(&h).replacen("main", "jg_main", 1));
                }
                let b = drop_point_size(apply(body, rules, &local)?);
                let b = if vertex { vertex_texture_lod(b) } else { b };
                out.push_str(&text(&strip(h)));
                out.push_str(&text(&strip(b)));
                out.push('\n');
            }
            _ => {}
        }
    }
    Ok(())
}

/// Every uniform three names, located in the module's blocks: offsets come from naga's layout.
/// Returns the slots plus each block's span: binding 0 is the shared block, binding 1 the
/// per-object block (absent when the rewrite was unsplit).
pub fn uniform_slots(module: &naga::Module, renames: &Renames) -> (Vec<UniformSlot>, u32, u32) {
    let mut out = Vec::new();
    let mut shared_size = 0;
    let mut object_size = 0;
    for (_, var) in module.global_variables.iter() {
        if var.space != naga::AddressSpace::Uniform {
            continue;
        }
        let Some(binding) = var.binding else { continue };
        let block = if binding.binding == 1 { UniformBlock::Object } else { UniformBlock::Shared };
        let ty = &module.types[var.ty];
        let naga::TypeInner::Struct { members, span } = &ty.inner else { continue };
        match block {
            UniformBlock::Shared => shared_size = shared_size.max(*span),
            UniformBlock::Object => object_size = object_size.max(*span),
        }
        for m in members {
            let Some(mname) = &m.name else { continue };
            let name = if let Some(n) = mname.strip_suffix("_jgb") {
                n.to_string()
            } else if let Some((orig, _)) = renames.arrays.iter().find(|(_, v)| &v.0 == mname) {
                orig.clone()
            } else {
                mname.clone()
            };
            walk(module, m.ty, &name, m.offset, &mut out, renames.arrays.get(&name).map(|v| v.1), block);
        }
    }
    (out, shared_size, object_size)
}

fn scalar_kind(s: naga::Scalar) -> char {
    match s.kind {
        naga::ScalarKind::Sint => 'i',
        naga::ScalarKind::Uint => 'u',
        naga::ScalarKind::Bool => 'i',
        _ => 'f',
    }
}

/// `packed`: a float/vec2 array stored as vec4s keeps three's element width (`packed` components).
fn walk(module: &naga::Module, ty: naga::Handle<naga::Type>, name: &str, offset: u32, out: &mut Vec<UniformSlot>, packed: Option<u32>, block: UniformBlock) {
    match &module.types[ty].inner {
        naga::TypeInner::Scalar(s) => out.push(UniformSlot { name: name.into(), offset, kind: scalar_kind(*s), columns: 1, rows: 1, column_stride: 0, count: 1, stride: 4, array: false, block }),
        naga::TypeInner::Vector { size, scalar } => out.push(UniformSlot { name: name.into(), offset, kind: scalar_kind(*scalar), columns: 1, rows: *size as u32, column_stride: 0, count: 1, stride: 16, array: false, block }),
        naga::TypeInner::Matrix { columns, rows, scalar } => {
            out.push(UniformSlot { name: name.into(), offset, kind: scalar_kind(*scalar), columns: *columns as u32, rows: *rows as u32, column_stride: if *rows as u32 == 2 { 8 } else { 16 }, count: 1, stride: 0, array: false, block })
        }
        naga::TypeInner::Array { base, size, stride } => {
            let count = match size {
                naga::ArraySize::Constant(n) => n.get(),
                _ => 1,
            };
            match &module.types[*base].inner {
                naga::TypeInner::Struct { members, .. } => {
                    for i in 0..count {
                        for m in members {
                            let mname = m.name.clone().unwrap_or_default();
                            walk(module, m.ty, &format!("{name}[{i}].{mname}"), offset + i * stride + m.offset, out, None, block);
                        }
                    }
                }
                _ => {
                    let mut tmp = Vec::new();
                    walk(module, *base, name, offset, &mut tmp, None, block);
                    if let Some(mut slot) = tmp.pop() {
                        if let Some(n) = packed {
                            slot.rows = n;
                        }
                        slot.count = count;
                        slot.stride = *stride;
                        slot.array = true;
                        out.push(slot);
                    }
                }
            }
        }
        naga::TypeInner::Struct { members, .. } => {
            for m in members {
                let mname = m.name.clone().unwrap_or_default();
                walk(module, m.ty, &format!("{name}.{mname}"), offset + m.offset, out, None, block);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noise_corners_are_added_in_integers() {
        let n = |body: &str| {
            let items = exact_hash_corners(split_items(&format!("float n(vec3 p) {body}\n")).unwrap());
            let Item::Function { body, .. } = &items[0] else { panic!("not a function") };
            text(body)
        };
        // A corner passed to a hash, inside an inline dot, and with int-literal offsets.
        assert_eq!(n("{ vec2 i = floor(p.xy); return h(i) + h(i + vec2(1.0, 0.0)); }"), "{ vec2 i = floor(p.xy); return h(i) + h(vec2(ivec2(i) + ivec2(1, 0))); }");
        assert_eq!(n("{ vec2 i = floor(p.xy); return fract(sin(dot(i + vec2(0.0, 1.0), k)) * c); }"), "{ vec2 i = floor(p.xy); return fract(sin(dot(vec2(ivec2(i) + ivec2(0, 1)), k)) * c); }");
        assert_eq!(n("{ vec3 i = floor(p); return g(i + vec3(1, 0, 1), 2.0); }"), "{ vec3 i = floor(p); return g(vec3(ivec3(i) + ivec3(1, 0, 1)), 2.0); }");
        // Left alone: not floored, a fractional offset, part of a larger sum or product, or written twice.
        for keep in [
            "{ vec2 f = fract(p.xy); return h(f + vec2(1.0, 0.0)); }",
            "{ vec2 i = floor(p.xy); return h(i + vec2(0.5, 1.0)); }",
            "{ vec2 i = floor(p.xy); return h(2.0 * i + vec2(1.0, 0.0)); }",
            "{ vec2 i = floor(p.xy); return h(i + vec2(1.0, 0.0) * s); }",
            "{ vec2 i = floor(p.xy); i *= 0.5; return h(i + vec2(1.0, 0.0)); }",
        ] {
            assert_eq!(n(keep), keep);
        }
    }

    #[test]
    fn a_uniform_struct_pads_to_std140_size() {
        let shadow = "struct DirectionalLightShadow { float shadowIntensity; float shadowBias; float shadowNormalBias; float shadowRadius; vec2 shadowMapSize; };";
        assert!(std140_struct(shadow).contains("vec2 shadowMapSize; float jg_pad0; float jg_pad1; };"));
        let light = "struct DirectionalLight { vec3 direction; vec3 color; };";
        assert_eq!(std140_struct(light), "struct DirectionalLight { vec3 direction; vec3 color; float jg_pad0; };");
        let even = "struct S { vec4 a; };";
        assert_eq!(std140_struct(even), even);
    }

    #[test]
    fn a_vertex_texture_call_samples_level_zero() {
        let out = text(&vertex_texture_lod(tokenize("float h = texture( sampler2D(t, s), uv * (1.0 + f(x)) ).r;")));
        assert_eq!(out, "float h = textureLod( sampler2D(t, s), uv * (1.0 + f(x)) , 0.0).r;");
        let nested = text(&vertex_texture_lod(tokenize("texture(a, texture(b, uv).xy)")));
        assert_eq!(nested, "textureLod(a, textureLod(b, uv, 0.0).xy, 0.0)");
    }
}
