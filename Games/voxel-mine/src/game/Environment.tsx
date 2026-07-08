import "@react-three/fiber";

// No ground plane — the voxel field is the terrain, so what you stand on is what you can mine.
export function Environment() {
  return (
    <>
      <color attach="background" args={["#8ecbff"]} />
      <fog attach="fog" args={["#8ecbff", 32, 110]} />
      <hemisphereLight args={["#ffffff", "#586b46", 0.75]} />
      <directionalLight position={[12, 24, 8]} intensity={0.65} />
    </>
  );
}
