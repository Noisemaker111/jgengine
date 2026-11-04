/** How long a resource whose last user left waits before it is freed. */
export const LINGER_MS = 2000;

/**
 * Resources whose last user left, held a moment before they are freed. A draw that is torn down and
 * built again a frame later (a batch whose members changed, a field whose inputs were rebuilt) takes
 * back the same GPU resource, and so its linked shaders and baked textures, instead of freeing them
 * and paying for the link or bake again mid-play.
 */
export class Lingering<K, V> {
  private readonly parked = new Map<K, { value: V; timer: ReturnType<typeof setTimeout> }>();

  constructor(
    private readonly free: (value: V) => void,
    private readonly ms = LINGER_MS,
  ) {}

  /** Hold `value` under `key`; it is freed after the grace period unless taken back first. */
  park(key: K, value: V): void {
    this.drop(key);
    const timer = setTimeout(() => {
      if (this.parked.get(key)?.value !== value) return;
      this.parked.delete(key);
      this.free(value);
    }, this.ms);
    this.parked.set(key, { value, timer });
  }

  /** The value parked under `key`, no longer due to be freed; undefined when none waits. */
  take(key: K): V | undefined {
    const found = this.parked.get(key);
    if (found === undefined) return undefined;
    clearTimeout(found.timer);
    this.parked.delete(key);
    return found.value;
  }

  /** Free everything parked now. */
  flush(): void {
    for (const key of [...this.parked.keys()]) this.drop(key);
  }

  /** How many values wait to be freed. */
  get size(): number {
    return this.parked.size;
  }

  private drop(key: K): void {
    const value = this.take(key);
    if (value !== undefined) this.free(value);
  }
}
