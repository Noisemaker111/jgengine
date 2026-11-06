/** Thrown when code touches a {@link SetupWindow} view after the window closed. */
export class SetupClosedError extends Error {
  override readonly name = "SetupClosedError";
}

/** A view of an object that works until {@link close}, then refuses every read, write and call. */
export interface SetupWindow<T extends object> {
  /** The object as setup sees it; anything reached through it (a sub-object, a method's result) closes with it. */
  readonly view: T;
  close(): void;
  readonly closed: boolean;
}

function isReference(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

/**
 * Wrap `target` so setup code can use it freely and lose it the moment setup ends: everything reached
 * through the view is wrapped the same way, so a sub-object or a method saved for later throws too.
 * Calls run on the real object, so classes with private fields and native collections work.
 *
 * @capability setup-window hand setup code a live object that stops working when setup ends, so nothing it kept can write later
 */
export function openSetupWindow<T extends object>(target: T, message: string): SetupWindow<T> {
  let closed = false;
  const proxies = new WeakMap<object, object>();
  const targets = new WeakMap<object, object>();
  const guard = (): void => {
    if (closed) throw new SetupClosedError(message);
  };
  const unwrap = (value: unknown): unknown => (isReference(value) ? (targets.get(value) ?? value) : value);
  const handler: ProxyHandler<object> = {
    get(object, key) {
      guard();
      const value: unknown = Reflect.get(object, key, object);
      // A proxy must hand back a frozen own value unchanged.
      const own = Reflect.getOwnPropertyDescriptor(object, key);
      if (own !== undefined && own.configurable === false && own.writable === false) return value;
      return wrap(value);
    },
    set(object, key, value) {
      guard();
      return Reflect.set(object, key, unwrap(value), object);
    },
    has(object, key) {
      guard();
      return Reflect.has(object, key);
    },
    ownKeys(object) {
      guard();
      return Reflect.ownKeys(object);
    },
    deleteProperty(object, key) {
      guard();
      return Reflect.deleteProperty(object, key);
    },
    defineProperty(object, key, descriptor) {
      guard();
      return Reflect.defineProperty(object, key, descriptor);
    },
    setPrototypeOf(object, prototype) {
      guard();
      return Reflect.setPrototypeOf(object, prototype);
    },
    apply(fn, self, args) {
      guard();
      if (typeof fn !== "function") throw new TypeError("not a function");
      return wrap(Reflect.apply(fn, unwrap(self), args.map(unwrap)));
    },
    construct(fn, args, newTarget) {
      guard();
      if (typeof fn !== "function") throw new TypeError("not a constructor");
      const made: unknown = Reflect.construct(fn, args.map(unwrap), typeof newTarget === "function" ? newTarget : fn);
      return isReference(made) ? wrapReference(made) : {};
    },
  };
  function wrap(value: unknown): unknown {
    return isReference(value) ? wrapReference(value) : value;
  }
  function wrapReference(value: object): object {
    const known = proxies.get(value);
    if (known !== undefined) return known;
    const proxy = new Proxy(value, handler);
    proxies.set(value, proxy);
    targets.set(proxy, value);
    return proxy;
  }
  const view = new Proxy<T>(target, handler);
  proxies.set(target, view);
  targets.set(view, target);
  return {
    view,
    close() {
      closed = true;
    },
    get closed() {
      return closed;
    },
  };
}
