import * as THREE from "three";

/**
 * Instanced facade material for city massing walls: a `MeshStandardMaterial` whose fragment stage
 * paints a real facade on the side faces of every instanced unit box — floor bands from the
 * district's `floorHeight`, spandrels between floors, framed panes with mullions, a per-cell hash
 * that lights a minority of windows (emissive), and a ground floor of plinth, storefront glazing
 * and fascia so street level never repeats floor 30. Two instanced attributes drive it:
 * `instanceGroundOffset` (buried foundation to skip) and `instanceFacade` (`x` = per-building seed,
 * `y` = facade kind — 0 punched openings, 1 curtain wall, 2 open parking deck). Same
 * `onBeforeCompile` idiom as the grass/terrain materials; instance colors keep tinting the wall
 * exactly like the plain massing material.
 * @internal — created by `CityRenderer` for the banded-piece InstancedMesh.
 */
export function createCityWindowMaterial(options: {
  floorHeight: number;
  windowColor: string;
  roughness?: number;
}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: options.roughness ?? 0.82,
    metalness: 0.04,
  });
  const uniforms = {
    uFloorHeight: { value: Math.max(2, options.floorHeight) },
    uWindowColor: { value: new THREE.Color(options.windowColor) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
#include <common>
attribute float instanceGroundOffset;
attribute vec2 instanceFacade;
varying vec3 vCityLocal;
varying vec3 vCityScale;
varying vec3 vCityNormal;
varying float vCityGround;
varying vec2 vCityFacade;
`,
      )
      .replace(
        "#include <begin_vertex>",
        `
#include <begin_vertex>
vCityLocal = position;
vCityScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vCityNormal = normal;
vCityGround = instanceGroundOffset;
vCityFacade = instanceFacade;
`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
#include <common>
uniform float uFloorHeight;
uniform vec3 uWindowColor;
varying vec3 vCityLocal;
varying vec3 vCityScale;
varying vec3 vCityNormal;
varying float vCityGround;
varying vec2 vCityFacade;
float cityLit = 0.0;
float cityHash(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}
`,
      )
      .replace(
        "#include <color_fragment>",
        `
#include <color_fragment>
{
  // Side faces only — roofs and undersides stay plain wall.
  if (abs(vCityNormal.y) < 0.5) {
    bool sideX = abs(vCityNormal.x) > 0.5;
    float along = sideX ? (vCityLocal.z + 0.5) * vCityScale.z : (vCityLocal.x + 0.5) * vCityScale.x;
    float faceWidth = sideX ? vCityScale.z : vCityScale.x;
    float up = (vCityLocal.y + 0.5) * vCityScale.y - vCityGround;
    float fh = uFloorHeight;
    float seed = vCityFacade.x;
    float kind = vCityFacade.y;
    float face = (sideX ? 2.0 : 0.0) + (vCityNormal.x + vCityNormal.z > 0.0 ? 1.0 : 0.0);
    vec3 wall = diffuseColor.rgb;
    float floorT = fract(up / fh);
    float floorIndex = floor(up / fh);
    if (kind > 1.5) {
      // Open parking deck: shadowed slots between column bays, solid spandrel below each level.
      float bay = fract(along / 6.0);
      bool slot = up > fh * 0.55 && floorT > 0.22 && floorT < 0.82
        && along > 1.4 && along < faceWidth - 1.4 && bay > 0.14;
      diffuseColor.rgb = slot ? wall * 0.16 : wall * (floorT < 0.18 ? 0.86 : 1.0);
    } else if (up > fh * 1.02) {
      float curtain = step(0.5, kind);
      float pitch = mix(2.45, 1.75, curtain);
      float glassW = mix(0.46, 0.7, curtain);
      float margin = mix(0.9, 0.55, curtain);
      float sillT = mix(0.36, 0.24, curtain);
      float headT = mix(0.8, 0.87, curtain);
      float colIndex = floor(along / pitch);
      float colC = abs(fract(along / pitch) - 0.5) * 2.0;
      bool inBand = along > margin && along < faceWidth - margin;
      if (inBand && floorT > sillT && floorT < headT && colC < glassW) {
        float cell = cityHash(vec2(floorIndex, colIndex) + vec2(seed * 41.0, face * 7.0));
        float lit = step(0.9, cell);
        vec3 pane = uWindowColor * mix(0.34, 0.86, cell);
        pane = mix(pane, vec3(1.0, 0.9, 0.7), lit * 0.5);
        // Pane frame + a transom across tall curtain-wall bays: the grid that reads as glazing.
        float frame = step(glassW - 0.14, colC) + curtain * step(abs(floorT - (sillT + headT) * 0.5), 0.022);
        diffuseColor.rgb = mix(pane, wall * mix(0.7, 0.5, curtain), clamp(frame, 0.0, 1.0));
        cityLit = lit * (1.0 - clamp(frame, 0.0, 1.0)) * 0.3;
      } else if (inBand && (floorT <= sillT || floorT >= headT)) {
        diffuseColor.rgb = wall * mix(0.9, 0.78, curtain);
        // Sill lip under each opening catches the light and breaks the flat band.
        if (colC < glassW && floorT > sillT - 0.055) diffuseColor.rgb = wall * mix(1.08, 0.9, curtain);
      }
    } else {
      // Ground floor: plinth, pier-and-glass shopfront, fascia band under the first slab.
      if (up < 0.55) {
        diffuseColor.rgb = wall * 0.62;
      } else if (faceWidth > 5.0) {
        float pier = abs(fract(along / 3.1) - 0.5) * 2.0;
        bool store = up > 0.75 && up < fh * 0.74 && pier < 0.78
          && along > 1.1 && along < faceWidth - 1.1;
        if (store) {
          diffuseColor.rgb = uWindowColor * 0.17;
          cityLit = 0.1;
        } else if (up > fh * 0.78 && up < fh * 0.96) {
          diffuseColor.rgb = wall * 0.75;
        }
      }
    }
  }
}
`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `
#include <emissivemap_fragment>
totalEmissiveRadiance += mix(uWindowColor, vec3(1.0, 0.86, 0.6), 0.6) * cityLit;
`,
      );
  };
  material.customProgramCacheKey = () => `jgengine-city-windows`;
  return material;
}
