/** Text stored as UTF-16 units in the same shared float buffer as numeric HUD values. @internal */
export interface RuneTextSlots {
  n: number;
  u: number[];
}

interface TextBinding {
  slots: RuneTextSlots;
  value: string;
  changed: boolean;
  grew: boolean;
}

/** Bounded, reusable slots in Rune's shared value buffer. @internal */
export class RuneValueSlots {
  private next = 0;
  private readonly free: number[] = [];
  private readonly numbers = new Map<string, number>();
  private readonly texts = new Map<string, TextBinding>();

  constructor(private readonly values: () => Float32Array) {}

  private reserve(count: number): void {
    if (count > this.values().length - this.next + this.free.length) throw new RangeError("Rune UI shared value buffer is full");
  }

  private allocate(): number {
    this.reserve(1);
    const available = this.free.pop();
    if (available !== undefined) return available;
    return this.next++;
  }

  slot(name: string): number {
    const found = this.numbers.get(name);
    if (found !== undefined) return found;
    const slot = this.allocate();
    this.numbers.set(name, slot);
    return slot;
  }

  write(name: string, value: number): boolean {
    const slot = this.slot(name);
    const values = this.values();
    const next = Math.fround(value);
    if (Object.is(values[slot], next)) return false;
    values[slot] = next;
    return true;
  }

  release(name: string): void {
    const slot = this.numbers.get(name);
    if (slot === undefined) return;
    this.numbers.delete(name);
    this.free.push(slot);
  }

  writeText(name: string, value: string): TextBinding {
    let record = this.texts.get(name);
    const capacity = value.length === 0 ? 0 : 2 ** Math.ceil(Math.log2(value.length));
    const extra = Math.max(0, capacity - (record?.slots.u.length ?? 0));
    this.reserve(extra + (record === undefined ? 1 : 0));
    if (record === undefined) {
      record = { slots: { n: this.allocate(), u: [] }, value: "", changed: true, grew: true };
      this.texts.set(name, record);
    } else {
      record.changed = record.value !== value;
      record.grew = extra > 0;
    }
    if (!record.changed && !record.grew) return record;
    for (let index = 0; index < extra; index += 1) record.slots.u.push(this.allocate());
    const values = this.values();
    for (let index = 0; index < value.length; index += 1) {
      const slot = record.slots.u[index];
      if (slot !== undefined) values[slot] = value.charCodeAt(index);
    }
    values[record.slots.n] = value.length;
    record.value = value;
    return record;
  }

  releaseText(name: string): void {
    const record = this.texts.get(name);
    if (record === undefined) return;
    this.texts.delete(name);
    this.free.push(record.slots.n, ...record.slots.u);
  }
}
