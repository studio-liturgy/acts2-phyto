## Final Sweep Results

Ran `rg -n -i "deck" src/` across the whole source tree.

### Remaining "deck" references — all intentional

Only 6 hits, all inside `src/lib/store.ts` lines 184–198 — the v1 → v2 persisted-state migration. These must stay so existing users' libraries (saved under the old `decks` / `deckIds` shape) are remapped to the new `sets` / `setIds` shape on first load. Comments and `delete ps.decks` / `deckIds: _drop` are part of that migration logic, never user-visible.

### Routes / route tree
- `src/routes/` contains `set.$setId.tsx` (no `deck.*` file).
- `src/routeTree.gen.ts` imports `SetSetIdRouteImport from './routes/set.$setId'` — clean.
- `sitemap[.]xml.ts` has no deck refs.

### Runtime error
The reported error (`Failed to load /src/routes/deck.$deckId.tsx`) is a stale Vite cache entry from before the rename. The current generated route tree no longer references that path, so it will clear on the next dev-server reload.

### Conclusion
No code changes needed. The Deck → Set rename is complete end-to-end: types, store, routes, components, drag MIME types, copy, and titles. The only surviving "deck" tokens are the one-time migration shim, which is correct and should not be removed.

### Proposed action
Nothing to edit. If you'd like, I can switch to build mode and trigger a dev-server restart to flush the stale Vite error, but no source changes are required.