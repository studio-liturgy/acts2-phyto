## Copy update sweep + full Deck → Set rename

### Copy edits (text-only)

**`src/routes/__root.tsx`**
- Title meta → `phyto | home gatherings`
- `og:title` / `twitter:title` → `phyto | home gatherings`
- `description` / `og:description` / `twitter:description` → `phyto is a free, open source presentation tool built for small home worship gatherings. Prepare your verses and lyrics beforehand, then run it live.`
- `twitter:site` → `@phyto.live`
- `NotFoundComponent` + `ErrorComponent`: add a primary blue "Feedback" CTA next to existing buttons. Size/style to match the homepage "Present" pill (Link to `/feedback`).

**`src/routes/index.tsx`**
- Title → `Home | phyto` (matching og:title)
- `description` / `og:description` → `Prepare sets, group them into gatherings, and present them live!`
- JSON-LD `WebSite.description` → `A lightweight, open-source presentation tool for small home worship gatherings.`
- JSON-LD `SoftwareApplication.description` → `Prepare sets of songs, scripture, and media – group them into gatherings – and present them live.`
- Hero tagline → `Prepare sets, group them into gatherings, and present them live!`
- Gatherings empty state → `No gatherings yet. Click <b>New</b> to plan a gathering.`

**`src/routes/about.tsx`**
- Title → `What is phyto?` (matching og:title)
- `description` / `og:description` → `phyto is a free, open source presentation tool built for small home worship gatherings.`
- Replace intro p1 with new copy; keep existing intro p2 as-is.
- Replace body p1, p2, and footnote with new copy.

**`src/routes/feedback.tsx`**
- Title → `Feedback | phyto` (matching og:title)
- `description` / `og:description` → `Send your feedback, bug reports, feature requests, and encouragement to phyto.`
- Success message → `Thanks for sending in your feedback! We appreciate your time in checking out phyto :)`
- Both error fallbacks → `Something went wrong. Please try again!`

**`src/routes/updates.tsx`**
- Title → `Updates | phyto` (matching og:title)
- `description` / `og:description` → `Release notes and updates for phyto.`
- Entry text → `Released beta for test users.`

**`src/routes/terms.tsx`**
- Title → `Terms of Use | phyto` (matching og:title)
- Section 2 paragraph → `Phyto is, and will always remain, free to use. There is no fee, subscription, paywall, or in-app purchase required to access any feature of the App. Now or in the future.`
- Section 5 heading → `Music Licensing Is Your Responsibility`

**`src/routes/privacy.tsx`**
- Title → `Privacy Policy | phyto` (matching og:title). Body unchanged.

**`src/routes/output.tsx`**
- Title → `Stage Output | phyto`

### Full Deck → Set rename

**Route**
- Rename file `src/routes/deck.$deckId.tsx` → `src/routes/set.$setId.tsx`.
- Change `createFileRoute("/deck/$deckId")` → `createFileRoute("/set/$setId")`.
- Update every `<Link to="/deck/$deckId" params={{ deckId }}>` and `navigate({ to: "/deck/$deckId", params: { deckId } })` to use `/set/$setId` and `setId` (in `src/routes/index.tsx`, `src/routes/present.tsx`).
- Inside the renamed file: add `head()` with title `Set Editor | phyto`; change `Deck not found.` → `Set not found.`
- Old `/deck/:id` bookmarks will 404 — acceptable since the app is in beta (call out below).

**Types (`src/lib/types.ts`)**
- Rename `Deck` → `Set`, `DeckKind` → `SetKind`, `DeckTemplate` → `SetTemplate`.
- Update playlist field `deckIds` → `setIds`.

**Store (`src/lib/store.ts`)**
- Rename: `decks` → `sets`, `createDeck` → `createSet`, `updateDeck` → `updateSet`, `deleteDeck` → `deleteSet`, `addDeckToPlaylist` → `addSetToPlaylist`, `removeDeckFromPlaylist` → `removeSetFromPlaylist`, `reorderPlaylistDecks` → `reorderPlaylistSets`.
- Bump persist key `stage-library-v1` → `stage-library-v2` and add a `migrate`/`version` step that reads the old `stage-library-v1` localStorage entry once and remaps: `decks → sets`, each playlist's `deckIds → setIds`. Existing users' libraries are preserved.
- Live channel/storage keys (`stage-live-v1`) carry `deckId` in the broadcast payload — rename to `setId` and bump to `stage-live-v2` so old/new tabs don't collide mid-rename.

**Components & route files**
- `src/components/SlideView.tsx`: `DeckTemplate` import → `SetTemplate`; comment "parent deck" → "parent set".
- `src/routes/output.tsx`, `src/routes/present.tsx`, `src/routes/index.tsx`, and the renamed `set.$setId.tsx`: rename every local variable, prop, and key — `deck` → `set`, `activeDeck` → `activeSet`, `liveDeck` → `liveSet`, `deckList` → `setList`, `filteredDecks` → `filteredSets`, `deckFromUrl` → `setFromUrl`, `activeDeckId` → `activeSetId`, etc.
- Drag-and-drop MIME strings: `application/x-deck-id` → `application/x-set-id`, `application/x-stage-deck-id` → `application/x-stage-set-id`. DOM id `deck-section-${id}` → `set-section-${id}`.
- Search-param schema in `present.tsx`: rename `deck` query param to `set` (and `playlist` stays).

**Verification after edits**
- After all renames, run `rg -n "[Dd]eck" -g '*.ts' -g '*.tsx' src/` and confirm only auto-generated `src/routeTree.gen.ts` appears (regenerated by the Vite plugin on next build).
- Spot-check the home page, set editor (open an existing set after migration), and presenter to confirm nothing broke.

### Heads-up
- Anyone who bookmarked a `/deck/<id>` URL will get the 404 page after this ships. Library data itself is preserved by the migration.

If this looks right I'll implement it in one pass.
