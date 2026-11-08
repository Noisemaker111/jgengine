import { ShaderChunk } from "three";
import { GTAOBlendShader } from "three/examples/jsm/shaders/GTAOShader.js";
import { OutputShader } from "three/examples/jsm/shaders/OutputShader.js";

import { BEAUTY_COPY_FRAGMENT } from "./beautyPass.draw";
import { CONTACT_APPLY_FRAGMENT } from "./contactShadowPass.draw";
import { GRADE_SHADER } from "./gradeShader.draw";
import { HALF_ROUNDING_GLSL } from "./halfPrecision.draw";
import { COMPOSITE_FRAGMENT } from "./sceneCompositePass.draw";

/** three's `#include <chunk>` expansion, which it applies to every material before compiling. */
function resolveIncludes(source: string): string {
  return source.replace(/^[ \t]*#include +<([\w./]+)>/gm, (_, name: string) => {
    const chunk = (ShaderChunk as unknown as Record<string, string | undefined>)[name];
    if (chunk === undefined) throw new Error(`three has no shader chunk ${name}`);
    return resolveIncludes(chunk);
  });
}

/**
 * The shader sources of every merged post draw and of the draws it replaces, with three's includes
 * expanded, for `bun run check postfx-exact` to compile both ways on the GPU.
 * @internal
 */
export function postfxExactSources() {
  return {
    vertex: GTAOBlendShader.vertexShader,
    half: HALF_ROUNDING_GLSL,
    colorspacePars: resolveIncludes("#include <colorspace_pars_fragment>\n"),
    beautyCopy: BEAUTY_COPY_FRAGMENT,
    aoBlend: GTAOBlendShader.fragmentShader,
    contactApply: CONTACT_APPLY_FRAGMENT,
    composite: COMPOSITE_FRAGMENT,
    outputVertex: OutputShader.vertexShader,
    outputFragment: resolveIncludes(OutputShader.fragmentShader),
    gradeVertex: GRADE_SHADER.vertexShader,
    gradeFragment: resolveIncludes(GRADE_SHADER.fragmentShader),
  };
}
