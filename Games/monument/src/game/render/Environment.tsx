import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useGameClock } from "@jgengine/react/hooks";

import { CELL, GRID } from "../catalog";
import { solarModel } from "../city/model";
import { getConcreteTextureCanvas } from "./concrete";

export interface MoodScene {
  day: [string, string, string];
  night: [string, string, string];
  backgroundDay: string;
  backgroundNight: string;
  fogDay: string;
  fogNight: string;
  groundDay: string;
  groundNight: string;
  window: string;
  windowAlt: string;
  lamp: string;
  accent: string;
  windowIntensity: number;
  lampIntensity: number;
}

export const MOOD_SCENES: Record<"default", MoodScene> = {
  default: {
    day: ["#5f91aa", "#b7c3bc", "#d0c2a5"],
    night: ["#111a24", "#24313c", "#0d1216"],
    backgroundDay: "#b9b29f",
    backgroundNight: "#10171c",
    fogDay: "#b7c1b8",
    fogNight: "#10171c",
    groundDay: "#6f746d",
    groundNight: "#17201e",
    window: "#ffd89b",
    windowAlt: "#f6c16f",
    lamp: "#ffd19a",
    accent: "#d7ff43",
    windowIntensity: 0.65,
    lampIntensity: 18,
  },
};

export const MONUMENT_SCENE: MoodScene = MOOD_SCENES.default;

const ATMOSPHERE = {
  haze: 0.45,
  clouds: 0.6,
  stars: 0.5,
  sun: 0.82,
  twilight: "#d89567",
  cloudDay: "#d6d3c8",
  cloudNight: "#1a2530",
};

const BACKGROUND_PALETTE = { a: "#817c72", b: "#6e716d", far: "#596565", roof: "#48504e", ridge: "#68705f" };

const GROUND_SIZE = 440;

const SKY_VERTEX = `
varying vec3 vDir;
void main(){vDir=normalize(position);vec4 clip=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=clip.xyww;}
`;

const SKY_FRAGMENT = `
precision highp float;
uniform float uTime;uniform float uDaylight;uniform float uHaze;uniform float uCloudiness;uniform float uCloudDetail;uniform float uStarIntensity;uniform float uSunStrength;
uniform vec3 uSunDir;uniform vec3 uMoonDir;uniform vec3 uDayTop;uniform vec3 uDayHorizon;uniform vec3 uDayGround;uniform vec3 uNightTop;uniform vec3 uNightHorizon;uniform vec3 uNightGround;
uniform vec3 uHazeDay;uniform vec3 uHazeNight;uniform vec3 uTwilightColor;uniform vec3 uSunColor;uniform vec3 uMoonColor;uniform vec3 uCloudDay;uniform vec3 uCloudNight;
varying vec3 vDir;const float TAU=6.28318530718;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float a=hash21(i),b=hash21(i+vec2(1.,0.)),c=hash21(i+vec2(0.,1.)),d=hash21(i+vec2(1.,1.));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
void main(){
  vec3 dir=normalize(vDir);float h=clamp(dir.y,-1.,1.),day=clamp(uDaylight,0.,1.),nightAmount=1.-day;
  vec3 top=mix(uNightTop,uDayTop,day),horizon=mix(uNightHorizon,uDayHorizon,day),ground=mix(uNightGround,uDayGround,day);
  vec3 upper=mix(horizon,top,pow(max(h,0.),.58)),lower=mix(horizon,ground,clamp(-h*3.,0.,1.));vec3 color=mix(lower,upper,step(0.,h));
  float horizonBand=1.-smoothstep(.02,.36,abs(h));vec2 viewAzimuth=normalize(dir.xz+vec2(.00001,0.)),sunAzimuth=normalize(uSunDir.xz+vec2(.00001,0.));float sunFacing=smoothstep(-.25,.95,dot(viewAzimuth,sunAzimuth));
  vec3 hazeColor=mix(uHazeNight,uHazeDay,day);color=mix(color,hazeColor,clamp(uHaze*horizonBand*(.58+.42*sunFacing),0.,.84));
  float twilight=smoothstep(-.28,-.04,uSunDir.y)*(1.-smoothstep(.02,.22,uSunDir.y))*horizonBand;color=mix(color,uTwilightColor,twilight*(.12+.38*sunFacing));
  float cloudFade=smoothstep(.06,.22,h);vec2 cloudUv=dir.xz/max(.14,h)*.42+vec2(uTime*.0014,uTime*.00035);float cloudNoise=noise2(cloudUv*1.35);if(uCloudDetail>.5)cloudNoise=cloudNoise*.68+noise2(cloudUv*2.75+7.1)*.32;cloudNoise=cloudNoise*.8+(.5+.5*sin(cloudUv.x*1.7+cloudUv.y*.34))*.2;
  float cloudThreshold=mix(.76,.49,uCloudiness),cloud=smoothstep(cloudThreshold,cloudThreshold+.13,cloudNoise)*cloudFade;vec3 cloudColor=mix(uCloudNight,uCloudDay,day);color=mix(color,cloudColor,cloud*(.07+.2*uCloudiness)*mix(.72,1.,day));
  float longitude=atan(dir.z,dir.x)/TAU+.5;vec2 starP=vec2(longitude,h*.5+.5)*vec2(320.,140.),starCell=floor(starP),starLocal=fract(starP)-.5;float starSeed=hash21(starCell+19.19);vec2 starJitter=vec2(hash21(starCell+3.1),hash21(starCell+7.7))-.5;
  float starDistance=length(starLocal-starJitter*.55),starRadius=mix(.025,.07,hash21(starCell+29.7)),starAA=max(.012,fwidth(starDistance)*1.25);float star=(1.-smoothstep(starRadius,starRadius+starAA,starDistance))*step(.993,starSeed);
  float starBrightness=mix(.45,1.55,clamp((starSeed-.993)/.007,0.,1.));vec3 starColor=mix(vec3(.70,.82,1.),vec3(1.,.84,.66),hash21(starCell+41.3));star*=nightAmount*nightAmount*smoothstep(.02,.16,h)*uStarIntensity*(1.-cloud*.82);color+=starColor*star*starBrightness;
  float sunDot=dot(dir,normalize(uSunDir)),sunVisible=smoothstep(-.08,.03,uSunDir.y)*day,sunHalo=smoothstep(.985,.99965,sunDot),sunDisc=smoothstep(.99970,.99991,sunDot);color+=uSunColor*(sunHalo*.11+sunDisc*uSunStrength)*sunVisible*(1.-cloud*.48);
  float moonDot=dot(dir,normalize(uMoonDir)),moonVisible=smoothstep(-.05,.12,uMoonDir.y)*nightAmount,moonHalo=smoothstep(.992,.99965,moonDot),moonDisc=smoothstep(.99962,.99988,moonDot);color+=uMoonColor*(moonHalo*.045+moonDisc*.68)*moonVisible*(1.-cloud*.55);
  color+=(hash21(gl_FragCoord.xy)-.5)/255.;gl_FragColor=vec4(max(color,vec3(0.)),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface BoxInstance {
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: number;
}

function InstancedBoxes({ items, color, roughness = 1 }: { items: BoxInstance[]; color: string; roughness?: number }): ReactNode {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (mesh === null || items.length === 0) return;
    const dummy = new THREE.Object3D();
    items.forEach((item, index) => {
      dummy.position.set(item.position[0], item.position[1], item.position[2]);
      dummy.scale.set(item.scale[0], item.scale[1], item.scale[2]);
      dummy.rotation.set(0, item.rotation ?? 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={false} receiveShadow={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </instancedMesh>
  );
}

const hashText = (text: string) => [...text].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

function backgroundInstances(): { masses: BoxInstance[]; roofs: BoxInstance[]; far: BoxInstance[] } {
  const seeded = (seed: number) => {
    const value = Math.sin(seed * 12.9898 + hashText("default") * 0.017) * 43758.5453;
    return value - Math.floor(value);
  };
  const masses: BoxInstance[] = [];
  const roofs: BoxInstance[] = [];
  const far: BoxInstance[] = [];
  const zones = [
    { kind: "north" as const, fixed: 218, start: -190, end: 190 },
    { kind: "west" as const, fixed: -218, start: -150, end: 195 },
    { kind: "east" as const, fixed: 218, start: -150, end: 195 },
  ];
  const limit = 48;
  let placed = 0;
  zones.forEach((zone, zoneIndex) => {
    let cursor = zone.start;
    let index = 0;
    while (cursor < zone.end && placed < limit) {
      const seed = zoneIndex * 101 + index * 17 + 11;
      const frontage = 14 + seeded(seed) * 23;
      const gap = 6 + seeded(seed + 3) * 11;
      cursor += frontage / 2;
      if (cursor + frontage / 2 > zone.end) break;
      const deep = 14 + seeded(seed + 7) * 13;
      const along = cursor + (seeded(seed + 9) - 0.5) * 3.5;
      const offset = zone.fixed + seeded(seed + 13) * 12;
      const x = zone.kind === "north" ? along : offset;
      const z = zone.kind === "north" ? offset : along;
      const w = zone.kind === "north" ? frontage : deep;
      const d = zone.kind === "north" ? deep : frontage;
      const h = 18 + seeded(seed + 19) * 48;
      masses.push({ position: [x, h / 2, z], scale: [w, h, d] });
      roofs.push({ position: [x, h + 0.65, z], scale: [Math.max(3, w * 0.24), 1.3, Math.max(3, d * 0.24)] });
      cursor += frontage / 2 + gap;
      index++;
      placed++;
    }
  });
  const farCount = 24;
  for (let i = 0; i < farCount; i++) {
    const angle = (i / farCount) * Math.PI * 2 + 0.08;
    const radius = 390 + seeded(600 + i) * 74;
    const h = 18 + seeded(800 + i) * 70;
    far.push({
      position: [Math.sin(angle) * radius, h / 2 - 2, Math.cos(angle) * radius],
      scale: [16 + seeded(900 + i) * 28, h, 15 + seeded(1000 + i) * 20],
      rotation: -angle,
    });
  }
  return { masses, roofs, far };
}

function Atmosphere({ hour, daylight }: { hour: number; daylight: number }): ReactNode {
  const sphere = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDaylight: { value: 1 },
      uSunDir: { value: new THREE.Vector3() },
      uMoonDir: { value: new THREE.Vector3() },
      uDayTop: { value: new THREE.Color() },
      uDayHorizon: { value: new THREE.Color() },
      uDayGround: { value: new THREE.Color() },
      uNightTop: { value: new THREE.Color() },
      uNightHorizon: { value: new THREE.Color() },
      uNightGround: { value: new THREE.Color() },
      uHazeDay: { value: new THREE.Color() },
      uHazeNight: { value: new THREE.Color() },
      uTwilightColor: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uMoonColor: { value: new THREE.Color() },
      uCloudDay: { value: new THREE.Color() },
      uCloudNight: { value: new THREE.Color() },
      uHaze: { value: 0.45 },
      uCloudiness: { value: 0.6 },
      uCloudDetail: { value: 1 },
      uStarIntensity: { value: 0.5 },
      uSunStrength: { value: 0.82 },
    }),
    [],
  );
  useEffect(() => {
    const solar = solarModel(hour);
    const dir = new THREE.Vector3(solar.direction[0], solar.direction[1], solar.direction[2]);
    const moon = dir.clone().negate();
    moon.y += 0.08;
    moon.normalize();
    uniforms.uDaylight.value = daylight;
    uniforms.uSunDir.value.copy(dir);
    uniforms.uMoonDir.value.copy(moon);
    uniforms.uDayTop.value.set(MONUMENT_SCENE.day[0]);
    uniforms.uDayHorizon.value.set(MONUMENT_SCENE.day[1]);
    uniforms.uDayGround.value.set(MONUMENT_SCENE.day[2]);
    uniforms.uNightTop.value.set(MONUMENT_SCENE.night[0]);
    uniforms.uNightHorizon.value.set(MONUMENT_SCENE.night[1]);
    uniforms.uNightGround.value.set(MONUMENT_SCENE.night[2]);
    uniforms.uHazeDay.value.set(MONUMENT_SCENE.fogDay);
    uniforms.uHazeNight.value.set(MONUMENT_SCENE.fogNight);
    uniforms.uTwilightColor.value.set(ATMOSPHERE.twilight);
    uniforms.uSunColor.value.set("#ffe1aa");
    uniforms.uMoonColor.value.set("#b9c9dd");
    uniforms.uCloudDay.value.set(ATMOSPHERE.cloudDay);
    uniforms.uCloudNight.value.set(ATMOSPHERE.cloudNight);
    uniforms.uHaze.value = ATMOSPHERE.haze;
    uniforms.uCloudiness.value = ATMOSPHERE.clouds;
    uniforms.uStarIntensity.value = ATMOSPHERE.stars;
    uniforms.uSunStrength.value = ATMOSPHERE.sun;
  }, [hour, daylight, uniforms]);
  useFrame(({ camera, clock }) => {
    const mesh = sphere.current;
    if (mesh !== null) mesh.position.copy(camera.position);
    uniforms.uTime.value = clock.getElapsedTime();
  });
  return (
    <mesh ref={sphere} scale={760} frustumCulled={false} renderOrder={-1000} raycast={() => null}>
      <sphereGeometry args={[1, 32, 20]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        uniforms={uniforms}
        vertexShader={SKY_VERTEX}
        fragmentShader={SKY_FRAGMENT}
      />
    </mesh>
  );
}

export function MonumentEnvironment(): ReactNode {
  const clock = useGameClock();
  const hour = clock.calendar.dayFraction * 24;
  const solar = solarModel(hour);
  const daylight = solar.daylight;
  const sun: [number, number, number] = [
    solar.direction[0] * 220,
    Math.max(8, solar.direction[1] * 220),
    solar.direction[2] * 220,
  ];
  const blend = (from: string, to: string) => new THREE.Color(from).lerp(new THREE.Color(to), daylight).getStyle();
  const background = blend(MONUMENT_SCENE.backgroundNight, MONUMENT_SCENE.backgroundDay);
  const fogColor = blend(MONUMENT_SCENE.fogNight, MONUMENT_SCENE.fogDay);
  const lightColor = blend(MONUMENT_SCENE.lamp, "#ffd19a");
  const fogNear = THREE.MathUtils.lerp(220, 280, daylight);
  const fogFar = 690;

  const background3d = useMemo(() => backgroundInstances(), []);
  const groundTexture = useMemo(() => {
    const canvas = getConcreteTextureCanvas();
    if (canvas === undefined) return undefined;
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(GROUND_SIZE / 24, GROUND_SIZE / 24);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, []);
  const ridgeGeometry = useMemo(() => {
    const segments = 72;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const radius = 520 + Math.sin(i * 2.17) * 18 + Math.sin(i * 0.63) * 24;
      const top = 18 + Math.sin(i * 0.77) * 9 + Math.sin(i * 1.91) * 5;
      positions.push(
        Math.sin(angle) * radius,
        -34,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        top,
        Math.cos(angle) * radius,
      );
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  useEffect(() => () => ridgeGeometry.dispose(), [ridgeGeometry]);
  useEffect(() => {
    return () => {
      if (groundTexture !== undefined) groundTexture.dispose();
    };
  }, [groundTexture]);

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      <Atmosphere hour={hour} daylight={daylight} />
      <ambientLight intensity={THREE.MathUtils.lerp(0.15, 0.42, daylight)} />
      <hemisphereLight args={[blend(MONUMENT_SCENE.window, "#fff0cf"), "#3a4031", THREE.MathUtils.lerp(0.34, 0.86, daylight)]} />
      <directionalLight
        castShadow
        position={sun}
        intensity={THREE.MathUtils.lerp(0.28, 3.1, daylight)}
        color={lightColor}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
        shadow-camera-near={1}
        shadow-camera-far={640}
        shadow-bias={-0.00015}
        shadow-normalBias={0.025}
        shadow-radius={THREE.MathUtils.lerp(1.4, 2.4, daylight)}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial color="#b8afa0" map={groundTexture} roughness={0.97} />
      </mesh>
      <gridHelper
        args={[GRID * CELL, GRID, "#8a8574", "#8a8574"]}
        position={[0, 0.02, 0]}
        material-transparent
        material-opacity={0.28}
      />
      <group>
        <mesh geometry={ridgeGeometry} castShadow={false} receiveShadow={false}>
          <meshStandardMaterial color={BACKGROUND_PALETTE.ridge} roughness={1} />
        </mesh>
        <InstancedBoxes items={background3d.far} color={BACKGROUND_PALETTE.far} />
        <InstancedBoxes items={background3d.masses} color={BACKGROUND_PALETTE.a} />
        <InstancedBoxes items={background3d.roofs} color={BACKGROUND_PALETTE.roof} roughness={0.9} />
      </group>
    </>
  );
}
