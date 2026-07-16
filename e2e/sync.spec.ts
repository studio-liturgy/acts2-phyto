import { expect, test, type Page } from "@playwright/test";
import { loadSession, seedSession, serviceClient } from "./fixtures/auth";

// Two-device journey against the real Supabase project (e2e user only).
// Cross-device sync is load-triggered — a device pulls once per page load via
// runDiff (__root.tsx), never via realtime — so "the other device sees it"
// always means "after that device (re)loads".

const admin = serviceClient();
const userId = () => loadSession().user.id;

async function remoteTitles(): Promise<string[]> {
  const { data, error } = await admin.from("sets").select("title").eq("user_id", userId());
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.title as string);
}

async function createSongNamed(page: Page, name: string) {
  // Empty device + empty account → first-time landing; "New Set" is a dropdown.
  // Retry the click until the menu opens: a click that lands before React
  // hydrates (slow first compile under `vite dev`) is silently lost.
  await expect(async () => {
    await page.getByRole("button", { name: "New Set" }).click();
    await expect(page.getByRole("menuitem", { name: "New Song" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("menuitem", { name: "New Song" }).click();
  await expect(page).toHaveURL(/\/set\//);
  // Rename via the click-to-edit header; the input autofocuses.
  await page.getByTitle("Click to rename").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(page.getByTitle("Click to rename")).toHaveText(name);
}

async function deleteSetByName(page: Page, name: string) {
  await page.getByRole("button", { name: "Edit catalogue" }).click();
  await page.locator("li", { hasText: name }).click();
  await page.getByRole("button", { name: "Delete selected sets" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(page.locator("main").getByText(name)).toBeHidden();
}

test("a set created on device A syncs to device B, and B's delete clears the account", async ({
  browser,
}) => {
  const name = `E2E Sync ${Date.now()}`;

  // ── Device A: create + rename, then wait for the debounced push to land. ──
  const contextA = await browser.newContext();
  await seedSession(contextA);
  const deviceA = await contextA.newPage();
  await deviceA.goto("/");
  // The session header confirms hydration + auth before we create anything.
  await expect(deviceA.getByText("phyto-e2e@example.com")).toBeVisible({ timeout: 30_000 });
  await createSongNamed(deviceA, name);

  await expect.poll(remoteTitles, { timeout: 30_000 }).toContain(name);
  // A stays untouched from here; close it so nothing else can push.
  await contextA.close();

  // ── Device B: separate context = separate IndexedDB. An empty device
  //    auto-merges the account silently on load — no dialog. ──
  const contextB = await browser.newContext();
  await seedSession(contextB);
  const deviceB = await contextB.newPage();
  await deviceB.goto("/");
  await expect(deviceB.getByText(name)).toBeVisible({ timeout: 30_000 });

  await deleteSetByName(deviceB, name);
  await expect.poll(remoteTitles, { timeout: 30_000 }).not.toContain(name);

  await contextB.close();
});

// Regression for the deletion-tombstone fix: without a tombstone, a device
// still holding a local copy of a remotely-deleted set classifies it as
// onlyLocal on its next diff (latestRemoteTime() null → silent merge), and
// applyMerge Step 4 pushes it BACK to the account. deleteSets now writes a
// `deletions` row (store.ts -> sync.ts recordDeletions) that a later diff
// consults to classify the item as remotelyDeleted instead. The delete must
// go through the app's UI (device B below) — a raw admin-table delete would
// skip recordDeletions and wouldn't exercise the fix at all.
test("a device still holding a copy does not resurrect a set deleted elsewhere", async ({
  browser,
}) => {
  const name = `E2E Tombstone ${Date.now()}`;

  // ── Device A: create the set and keep the context open (still holds a
  //    local copy in its own IndexedDB throughout). ──
  const contextA = await browser.newContext();
  await seedSession(contextA);
  const deviceA = await contextA.newPage();
  await deviceA.goto("/");
  await expect(deviceA.getByText("phyto-e2e@example.com")).toBeVisible({ timeout: 30_000 });
  await createSongNamed(deviceA, name);
  await expect.poll(remoteTitles, { timeout: 30_000 }).toContain(name);

  // ── Device B: pulls the set down, then deletes it through the real UI so
  //    the tombstone gets written. ──
  const contextB = await browser.newContext();
  await seedSession(contextB);
  const deviceB = await contextB.newPage();
  await deviceB.goto("/");
  await expect(deviceB.getByText(name)).toBeVisible({ timeout: 30_000 });
  await deleteSetByName(deviceB, name);
  await expect.poll(remoteTitles, { timeout: 30_000 }).not.toContain(name);
  await contextB.close();

  // ── Device A reloads: its stale local copy must be removed, not re-pushed. ──
  await deviceA.goto("/");
  await expect(deviceA.locator("main").getByText(name)).toBeHidden({ timeout: 30_000 });
  // Give a would-be resurrection a moment to land, then confirm it never did.
  await deviceA.waitForTimeout(3_000);
  expect(await remoteTitles()).not.toContain(name);

  await contextA.close();
});
