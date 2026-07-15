import type { ReactNode } from "react";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { GUEST_ID, guestColor, guestSkin } from "../entities/guests/catalog";

function Guest({ id }: { id: string }): ReactNode {
  const shirt = guestColor(id);
  const skin = guestSkin(id);
  return (
    <group>
      <mesh position-y={0.55}>
        <capsuleGeometry args={[0.24, 0.5, 4, 8]} />
        <meshStandardMaterial color={shirt} roughness={0.7} />
      </mesh>
      <mesh position-y={1.12}>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshStandardMaterial color={skin} roughness={0.6} />
      </mesh>
    </group>
  );
}

export function renderParkEntity(entity: SceneEntity): ReactNode | undefined {
  if (entity.name === GUEST_ID) return <Guest id={entity.id} />;
  return undefined;
}
