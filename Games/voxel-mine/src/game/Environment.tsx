import "@react-three/fiber";

export function Environment() {
  return (
    <>
      <color attach="background" args={["#8ecbff"]} />
      <fog attach="fog" args={["#8ecbff", 24, 70]} />
      <hemisphereLight args={["#ffffff", "#586b46", 0.75]} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#4a7a3a" roughness={1} />
      </mesh>
    </>
  );
}
