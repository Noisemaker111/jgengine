// The same house drawn the way a three.js page would: hand-built meshes, OrbitControls, and a
// render on every controls change (three.js's own "render on demand" example), not a loop.
import {
  BoxGeometry, BufferGeometry, Color, DirectionalLight, EdgesGeometry, Float32BufferAttribute, Group,
  HemisphereLight, Line, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, OctahedronGeometry,
  PerspectiveCamera, Scene, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface Vec { x: number; y: number; z: number }
interface House {
  volumes: readonly { kind: string; center: Vec; halfExtents: Vec; color: string }[];
  paths: readonly { points: readonly Vec[]; color: string }[];
  markers: readonly { position: Vec; color: string }[];
}

export function drawPlainHouse(canvas: HTMLCanvasElement, house: House, onDraw?: (frames: number) => void) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const scene = new Scene();
  scene.background = new Color("#f4f4f2");
  const sun = new DirectionalLight("#ffffff", 1.8);
  sun.position.set(0.6, 1, 0.35);
  scene.add(new HemisphereLight("#ffffff", "#8d8778", 1.6), sun);
  for (const volume of house.volumes) {
    const { center: c, halfExtents: h } = volume;
    const material = new MeshStandardMaterial({ color: volume.color, roughness: 0.85 });
    if (volume.kind === "gable-roof") {
      const low = c.y - h.y, top = c.y + h.y;
      const corners = [[-h.x, low, h.z], [h.x, low, h.z], [h.x, top, 0], [-h.x, top, 0], [-h.x, low, -h.z], [h.x, low, -h.z]];
      const order = [0, 1, 2, 0, 2, 3, 5, 4, 3, 5, 3, 2, 4, 0, 3, 1, 5, 2];
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(order.flatMap((i) => corners[i]!), 3));
      geometry.computeVertexNormals();
      const roof = new Group();
      roof.position.set(c.x, 0, c.z);
      roof.add(new Mesh(geometry, material), new LineSegments(new EdgesGeometry(geometry), new LineBasicMaterial({ color: "#2f2b28" })));
      scene.add(roof);
      continue;
    }
    const box = new Mesh(new BoxGeometry(h.x * 2, h.y * 2, h.z * 2), material);
    box.position.set(c.x, c.y, c.z);
    scene.add(box);
  }
  for (const path of house.paths) {
    const geometry = new BufferGeometry().setFromPoints(path.points.map((p) => ({ x: p.x, y: p.y, z: p.z }) as never));
    scene.add(new Line(geometry, new LineBasicMaterial({ color: path.color })));
  }
  for (const marker of house.markers) {
    const point = new Mesh(new OctahedronGeometry(0.15), new MeshStandardMaterial({ color: marker.color }));
    point.position.set(marker.position.x, marker.position.y, marker.position.z);
    scene.add(point);
  }
  const camera = new PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.05, 2e5);
  camera.position.set(18, 14, 18);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(3, 1.5, 0);
  controls.update();
  const render = () => {
    renderer.render(scene, camera);
    onDraw?.(renderer.info.render.frame);
  };
  controls.addEventListener("change", render);
  render();
  const dispose = () => {
    controls.dispose();
    scene.traverse((node) => {
      const drawn = node as Partial<Mesh>;
      drawn.geometry?.dispose();
      (drawn.material as MeshStandardMaterial | undefined)?.dispose();
    });
    renderer.dispose();
  };
  return { renderer, dispose };
}
