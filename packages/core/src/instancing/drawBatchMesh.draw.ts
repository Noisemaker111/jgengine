import * as THREE from "three";

const scheduleUpload = Object.getOwnPropertyDescriptor(THREE.Texture.prototype, "needsUpdate")?.set;

/** Three's per-draw list builder, which the typings do not declare. */
interface DrawListBuilder {
  _updateDrawParameters(camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, drawFormat?: string): void;
  _indirectTexture: THREE.DataTexture;
  _multiDrawCount: number;
}

/** What a draw list was built for: the camera's view and projection, and the flags that change the list. */
const KEY_SIZE = 35;
const viewProjection = new THREE.Matrix4();

/**
 * A `BatchedMesh` that rebuilds its draw list only when something it is made of changed. Three's own
 * rebuilds it before every pass the batch draws in (the scene, each shadow cascade, every prepass):
 * it tests each instance against the camera, sorts them, and uploads the visible ids to the GPU again,
 * which on a scene of small batches cost more than the draws it saved. Here a pass with the same
 * camera, flags and instances as the last build reuses that build (the scene pass and the prepasses
 * that share its camera), and a build whose visible ids match the ones already uploaded uploads
 * nothing. Every list it draws is the list three would build.
 * @internal
 */
export class DrawBatchMesh extends THREE.BatchedMesh {
  /** Typed against the base class, so a batch passes wherever a `BatchedMesh` is taken (the typings bind `this`). */
  declare customSort: ((this: THREE.BatchedMesh, list: Array<{ start: number; count: number; z: number }>, camera: THREE.Camera) => void) | null;
  /** Bumped by every write that changes what a draw list holds. */
  private revision = 0;
  private builtRevision = -1;
  private readonly builtKey = new Float64Array(KEY_SIZE);
  /** The visible ids the indirect texture holds on the GPU (or will after its scheduled upload). */
  private uploaded = new Uint32Array(0);
  private uploadedCount = -1;
  private gated = false;
  private uploadAsked = false;

  constructor(maxInstanceCount: number, maxVertexCount: number, maxIndexCount: number, material: THREE.Material) {
    super(maxInstanceCount, maxVertexCount, maxIndexCount, material);
    this.gateUploads();
  }

  /** Builds and uploads this batch has made, for tests and the probe. */
  readonly counts = { builds: 0, uploads: 0 };

  override setMatrixAt(instanceId: number, matrix: THREE.Matrix4): this {
    this.revision += 1;
    return super.setMatrixAt(instanceId, matrix);
  }

  override setVisibleAt(instanceId: number, visible: boolean): this {
    this.revision += 1;
    return super.setVisibleAt(instanceId, visible);
  }

  override addInstance(geometryId: number): number {
    this.revision += 1;
    return super.addInstance(geometryId);
  }

  override deleteInstance(instanceId: number): this {
    this.revision += 1;
    return super.deleteInstance(instanceId);
  }

  override addGeometry(geometry: THREE.BufferGeometry, reservedVertexRange?: number, reservedIndexRange?: number): number {
    this.revision += 1;
    return super.addGeometry(geometry, reservedVertexRange, reservedIndexRange);
  }

  override setGeometryAt(geometryId: number, geometry: THREE.BufferGeometry): number {
    this.revision += 1;
    return super.setGeometryAt(geometryId, geometry);
  }

  override deleteGeometry(geometryId: number): this {
    this.revision += 1;
    return super.deleteGeometry(geometryId);
  }

  override optimize(): this {
    this.revision += 1;
    return super.optimize();
  }

  override setGeometrySize(maxVertexCount: number, maxIndexCount: number): void {
    this.revision += 1;
    super.setGeometrySize(maxVertexCount, maxIndexCount);
  }

  override setInstanceCount(maxInstanceCount: number): void {
    this.revision += 1;
    super.setInstanceCount(maxInstanceCount);
    // Three made a new indirect texture: it uploads whole on its first draw.
    this.gateUploads();
    this.uploadedCount = -1;
  }

  /** Three's list build, run only when its inputs changed, and uploading only a list the GPU does not already hold. */
  _updateDrawParameters(camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material, drawFormat = "multiDraw"): void {
    const builder = THREE.BatchedMesh.prototype as unknown as DrawListBuilder;
    const array = (camera as THREE.Camera & { isArrayCamera?: boolean }).isArrayCamera === true;
    if (!array && this.sameBuild(camera, material, drawFormat)) return;
    this.uploadAsked = false;
    this.gated = true;
    try {
      builder._updateDrawParameters.call(this, camera, geometry, material, drawFormat);
    } finally {
      this.gated = false;
    }
    this.counts.builds += 1;
    this.builtRevision = array ? -1 : this.revision;
    if (this.uploadAsked) this.uploadIfChanged();
  }

  /** Whether the last build was for this camera, these flags and these instances; records them for the next call when not. */
  private sameBuild(camera: THREE.Camera, material: THREE.Material, drawFormat: string): boolean {
    const key = this.builtKey;
    const elements = viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const flags = (this.sortObjects ? 1 : 0) | (this.perObjectFrustumCulled ? 2 : 0) | ("wireframe" in material && material.wireframe === true ? 4 : 0) |
      (material.transparent ? 8 : 0) | (drawFormat === "merged" ? 16 : 0) | (camera.reversedDepth ? 32 : 0);
    const forward = this.sortObjects ? camera.matrixWorld.elements : null;
    let same = this.builtRevision === this.revision && key[16] === flags;
    for (let index = 0; index < 16; index += 1) {
      const value = elements[index] ?? 0;
      if (key[index] !== value) same = false;
      key[index] = value;
    }
    key[16] = flags;
    // Sorting also reads where the camera stands and looks, which the view-projection alone can hide.
    for (let index = 0; index < 16; index += 1) {
      const value = forward === null ? 0 : (forward[index] ?? 0);
      if (key[17 + index] !== value) same = false;
      key[17 + index] = value;
    }
    const system = camera.coordinateSystem;
    if (key[33] !== system) same = false;
    key[33] = system;
    return same;
  }

  private uploadIfChanged(): void {
    const self = this as unknown as DrawListBuilder;
    const texture = self._indirectTexture;
    const data = texture.image.data as Uint32Array;
    const count = self._multiDrawCount;
    let same = count === this.uploadedCount;
    if (same) for (let index = 0; index < count; index += 1) if (data[index] !== this.uploaded[index]) { same = false; break; }
    if (same) return;
    if (this.uploaded.length < count) this.uploaded = new Uint32Array(data.length);
    this.uploaded.set(data.subarray(0, count));
    this.uploadedCount = count;
    this.counts.uploads += 1;
    scheduleUpload?.call(texture, true);
  }

  /** Three asks for an upload after every build; this batch decides whether the GPU needs one. */
  private gateUploads(): void {
    const texture = (this as unknown as DrawListBuilder)._indirectTexture;
    const batch = this;
    Object.defineProperty(texture, "needsUpdate", {
      configurable: true,
      set(value: boolean) {
        if (value !== true) return;
        if (batch.gated) batch.uploadAsked = true;
        else scheduleUpload?.call(texture, true);
      },
    });
  }
}
