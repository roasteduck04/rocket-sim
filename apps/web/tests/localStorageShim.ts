/**
 * Task 12 support helper — this Node runtime (v26) defines an experimental
 * global `localStorage` accessor that throws/no-ops without a
 * `--localstorage-file` flag, and it shadows jsdom's own implementation
 * (jsdom's `window` *is* `globalThis` under vitest's jsdom environment, so
 * there's nowhere for a working one to hide). Both `localStorage` and
 * `window.localStorage` come back `undefined` as a result, which breaks any
 * test that wants to exercise `designModel.ts`'s real persistence path
 * (rather than relying on it always silently falling through its
 * try/catch). `installMemoryLocalStorage()` swaps in a minimal in-memory
 * `Storage` so those tests can set up and observe real reads/writes.
 */

class MemoryStorage implements Storage {
  #store = new Map<string, string>();

  get length(): number {
    return this.#store.size;
  }

  clear(): void {
    this.#store.clear();
  }

  getItem(key: string): string | null {
    return this.#store.has(key) ? (this.#store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.#store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.#store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, String(value));
  }
}

export const installMemoryLocalStorage = (): Storage => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
};
