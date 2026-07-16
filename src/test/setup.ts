// Must run before anything imports src/lib/db.ts so Dexie finds an IndexedDB.
import "fake-indexeddb/auto";
import { beforeEach } from "vitest";

// deterministicUuid (sync.ts) needs WebCrypto's subtle digest; jsdom may not
// provide it, Node's webcrypto does.
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = await import("node:crypto");
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

beforeEach(() => {
  localStorage.clear();
});
