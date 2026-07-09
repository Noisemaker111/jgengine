import {
  Behaviour,
  BehaviourModule,
  createBehaviourWorld,
  type BehaviourWorld,
} from "@jgengine/core/behaviour/behaviour";

export class DirectorModule extends BehaviourModule {
  cutscene = false;
  beginCutscene(): void {
    this.cutscene = true;
  }
}

export class ScoreModule extends BehaviourModule {
  points = 0;
  override onUpdate(dt: number): void {
    this.points += dt;
  }
}

declare module "@jgengine/core/behaviour/behaviour" {
  interface JGEngineRegister {
    modules: {
      director: DirectorModule;
      score: ScoreModule;
    };
  }
}

export class CutsceneCamera extends Behaviour {
  framed = false;
  override onUpdate(_dt: number): void {
    this.framed = this.modules.director.cutscene;
  }
}

export function createRegisteredWorld(): BehaviourWorld {
  const world = createBehaviourWorld();
  world.addModules({ director: new DirectorModule(), score: new ScoreModule() });
  // @ts-expect-error keys outside the augmented JGEngineRegister module map are rejected
  const rejected = () => world.addModules({ imposter: new DirectorModule() });
  void rejected;
  return world;
}

export function typedModuleAccess(world: BehaviourWorld): { director: DirectorModule; score: ScoreModule } {
  return { director: world.modules.director, score: world.modules.score };
}
