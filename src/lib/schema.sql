-- ============================================================
-- Phyto – Supabase schema
-- ============================================================

-- ------------------------------------------------------------
-- UPGRADE MIGRATION — Run this in Supabase SQL Editor if
-- upgrading from a schema version that predates last_modified_by.
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING).
-- ------------------------------------------------------------
-- alter table sets      add column if not exists last_modified_by text;
-- alter table gatherings add column if not exists last_modified_by text;
--
-- Add the (gathering_id, position) uniqueness invariant to an existing DB.
-- Run AFTER de-duping any stray rows (the old non-atomic delete+insert path
-- could leave duplicate positions). Safe to skip — the client no longer relies
-- on it (it upserts on the deterministic `id` PK):
-- alter table gathering_sets
--   add constraint gathering_sets_gathering_id_position_key
--   unique (gathering_id, position);
--
-- Stop unchanged content re-pushes from bumping sets.updated_at. The client
-- pushes only changed rows now, but a full push (conflict-dialog "Push") still
-- re-upserts every set; without this, each one bumps updated_at and churns the
-- cross-tab liveQuery. RECOMMENDED:
-- create or replace function sets_update_updated_at()
-- returns trigger language plpgsql as $$
-- begin
--   if (new.title is distinct from old.title)
--      or (new.type is distinct from old.type)
--      or (new.content is distinct from old.content) then
--     new.updated_at = now();
--   end if;
--   return new;
-- end;
-- $$;
-- drop trigger if exists sets_updated_at on sets;
-- create trigger sets_updated_at
--   before update on sets
--   for each row execute function sets_update_updated_at();
--
-- Stop is_live flips (goLive/endSession) from bumping gatherings.updated_at,
-- which made every live toggle look like a content change to the sync diff.
-- RECOMMENDED — the client heals the drift silently either way, but this stops
-- creating it:
-- create or replace function gatherings_update_updated_at()
-- returns trigger language plpgsql as $$
-- begin
--   if (new.title is distinct from old.title)
--      or (new.share_token is distinct from old.share_token) then
--     new.updated_at = now();
--   end if;
--   return new;
-- end;
-- $$;
-- drop trigger if exists gatherings_updated_at on gatherings;
-- create trigger gatherings_updated_at
--   before update on gatherings
--   for each row execute function gatherings_update_updated_at();
--
-- 24-HOUR LIVE-SESSION EXPIRY (REQUIRED to stop runaway viewer polling).
-- Presenters routinely close the laptop without ending the session, leaving
-- `is_live` true forever; every viewer tab still open on the share link then
-- re-fetches full set `content` every 8s indefinitely. Adds the live clock,
-- stamps it server-side, and hides sets once the window elapses:
-- alter table gatherings add column if not exists live_started_at timestamptz;
--
-- create or replace function gatherings_live_clock()
-- returns trigger language plpgsql as $$
-- begin
--   if not coalesce(new.is_live, false) then
--     new.live_started_at = null;
--   elsif new.live_started_at is null
--         or (tg_op = 'UPDATE' and new.is_live is distinct from old.is_live) then
--     new.live_started_at = now();
--   end if;
--   return new;
-- end;
-- $$;
-- drop trigger if exists gatherings_live_clock on gatherings;
-- create trigger gatherings_live_clock
--   before insert or update on gatherings
--   for each row execute function gatherings_live_clock();
--
-- drop policy if exists "gathering_sets: public select when live" on gathering_sets;
-- create policy "gathering_sets: public select when live"
--   on gathering_sets for select
--   using (
--     exists (
--       select 1 from gatherings g
--       where g.id = gathering_id
--         and g.is_live = true
--         and g.live_started_at > now() - interval '24 hours'
--     )
--   );
--
-- BACKFILL (run once, after the above). Existing live rows have no clock, so
-- they would all read as expired. `updated_at` is the last content edit, which
-- is the closest proxy for when the session started — sessions edited within
-- the last 24h keep serving, genuinely stale ones expire. The second statement
-- clears the flag on the already-expired ones so owners stop seeing a stale
-- "live" dot (the trigger nulls their live_started_at):
-- update gatherings set live_started_at = updated_at
--   where is_live = true and live_started_at is null;
-- update gatherings set is_live = false
--   where is_live = true and live_started_at <= now() - interval '24 hours';
--
-- Deletion tombstones (REQUIRED for cross-device deletion propagation).
-- Without this table the client logs a warning and falls back to the old
-- behavior, where a device still holding a copy of a deleted item pushes it
-- back to the account. Run the `deletions` table + policies from the schema
-- below (safe to run as-is: IF NOT EXISTS / create policy).
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Helper: auto-update updated_at (generic, unconditional). Retained for any
-- table that wants "bump on every write" semantics. NOTE: `sets` deliberately
-- uses the CONDITIONAL trigger below instead — see sets_update_updated_at.
-- ------------------------------------------------------------
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Table: sets
-- Stores song / scripture / image sets (each with a slides
-- array serialised as JSONB in `content`).
-- ============================================================
create table if not exists sets (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users not null,
  title       text        not null,
  type        text        not null,   -- 'song' | 'scripture' | 'image'
  content     jsonb       not null default '{"en": ""}',
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now(),
  last_modified_by  text
);

-- Sets use a CONDITIONAL trigger: only advance updated_at when synced content
-- actually changes (title / type / content jsonb). The client re-upserts rows
-- and copies the server timestamp back into Dexie; an unconditional bump on
-- every write made each re-push look like a fresh change, churning the cross-tab
-- liveQuery. Mirrors the gatherings trigger below.
create or replace function sets_update_updated_at()
returns trigger language plpgsql as $$
begin
  if (new.title is distinct from old.title)
     or (new.type is distinct from old.type)
     or (new.content is distinct from old.content) then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create trigger sets_updated_at
  before update on sets
  for each row execute function sets_update_updated_at();

alter table sets enable row level security;

create policy "sets: owner select"
  on sets for select
  using (user_id = auth.uid());

create policy "sets: owner insert"
  on sets for insert
  with check (user_id = auth.uid());

create policy "sets: owner update"
  on sets for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "sets: owner delete"
  on sets for delete
  using (user_id = auth.uid());

-- ============================================================
-- Table: gatherings
-- A gathering is a live session with a shareable
-- token and real-time slide state.
-- ============================================================
create table if not exists gatherings (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        references auth.users not null,
  title               text        not null,
  share_token         text        unique not null,
  is_live             boolean     default false,
  -- When the current live session started. Stamped/cleared server-side by
  -- gatherings_live_clock below; a session auto-ends 24h after this.
  live_started_at     timestamptz,
  current_set_index   int         default 0,
  current_slide_index int         default 0,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  last_modified_by    text
);

-- Gatherings use a dedicated trigger: the live-session columns (is_live,
-- current_set_index, current_slide_index) are server-authoritative STATE, not
-- content. Flipping them (goLive / endSession — including goLive's "take all
-- others offline" mass update) must NOT advance updated_at, or every live flip
-- shows up on other devices/refreshes as a false "modified" conflict.
create or replace function gatherings_update_updated_at()
returns trigger language plpgsql as $$
begin
  if (new.title is distinct from old.title)
     or (new.share_token is distinct from old.share_token) then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create trigger gatherings_updated_at
  before update on gatherings
  for each row execute function gatherings_update_updated_at();

-- The live clock is server-authoritative, exactly like is_live: stamped when a
-- gathering becomes live, cleared when it stops. Doing this in a trigger rather
-- than in the client means the 24h expiry also holds for clients running an
-- older bundle that only knows how to flip `is_live`.
--
-- Note the middle branch deliberately does NOT re-stamp a row that is already
-- live, so an ordinary content push (which leaves is_live untouched) cannot
-- extend a running session indefinitely.
create or replace function gatherings_live_clock()
returns trigger language plpgsql as $$
begin
  if not coalesce(new.is_live, false) then
    new.live_started_at = null;
  elsif new.live_started_at is null
        or (tg_op = 'UPDATE' and new.is_live is distinct from old.is_live) then
    new.live_started_at = now();
  end if;
  return new;
end;
$$;

create trigger gatherings_live_clock
  before insert or update on gatherings
  for each row execute function gatherings_live_clock();

alter table gatherings enable row level security;

create policy "gatherings: owner select"
  on gatherings for select
  using (user_id = auth.uid());

create policy "gatherings: owner insert"
  on gatherings for insert
  with check (user_id = auth.uid());

create policy "gatherings: owner update"
  on gatherings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "gatherings: owner delete"
  on gatherings for delete
  using (user_id = auth.uid());

-- Public (unauthenticated) viewers can look up a gathering by share_token.
create policy "gatherings: public select by share_token"
  on gatherings for select
  using (share_token is not null);

-- ============================================================
-- Table: gathering_sets
-- Ordered join table linking sets into a gathering.
-- ============================================================
create table if not exists gathering_sets (
  id           uuid primary key default gen_random_uuid(),
  gathering_id uuid references gatherings on delete cascade,
  set_id       uuid references sets       on delete cascade,
  position     int  not null,
  -- One set per (gathering, position). The client also derives each row's `id`
  -- deterministically from (gathering_id, position) and upserts on that PK to
  -- rewrite a gathering's set list in place (no delete-then-insert window), so
  -- this constraint is a defensive invariant rather than the conflict target.
  unique (gathering_id, position)
);

alter table gathering_sets enable row level security;

create policy "gathering_sets: owner select"
  on gathering_sets for select
  using (
    exists (
      select 1 from gatherings g
      where g.id = gathering_id
        and g.user_id = auth.uid()
    )
  );

create policy "gathering_sets: owner insert"
  on gathering_sets for insert
  with check (
    exists (
      select 1 from gatherings g
      where g.id = gathering_id
        and g.user_id = auth.uid()
    )
  );

create policy "gathering_sets: owner update"
  on gathering_sets for update
  using (
    exists (
      select 1 from gatherings g
      where g.id = gathering_id
        and g.user_id = auth.uid()
    )
  );

create policy "gathering_sets: owner delete"
  on gathering_sets for delete
  using (
    exists (
      select 1 from gatherings g
      where g.id = gathering_id
        and g.user_id = auth.uid()
    )
  );

-- Public viewers can see gathering_sets while the gathering is live AND within
-- its 24h window. This is the enforcement point for live-session expiry: an
-- abandoned session serves no sets, so a viewer tab left open on the share link
-- can no longer pull set `content` forever. The client mirrors this rule in
-- src/lib/live-session.ts (LIVE_SESSION_MS) so it stops polling too — keep the
-- interval below and that constant in step.
create policy "gathering_sets: public select when live"
  on gathering_sets for select
  using (
    exists (
      select 1 from gatherings g
      where g.id = gathering_id
        and g.is_live = true
        and g.live_started_at > now() - interval '24 hours'
    )
  );

-- ============================================================
-- Table: deletions
-- Deletion tombstones for cross-device sync. `id` IS the deleted
-- item's own uuid (from `sets` or `gatherings`), so there is one
-- tombstone per item and re-deleting a resurrected item refreshes
-- deleted_at via upsert. Consulted by the client's sync diff: a
-- local copy whose id is tombstoned at-or-after its last edit is
-- deleted locally instead of being pushed back to the account.
-- Rows are tiny and never need expiring for correctness (a
-- tombstone under a live row is ignored by the client).
-- ============================================================
create table if not exists deletions (
  id         uuid        primary key,
  user_id    uuid        references auth.users not null,
  kind       text        not null check (kind in ('set', 'gathering')),
  deleted_at timestamptz not null default now()
);

alter table deletions enable row level security;

create policy "deletions: owner select"
  on deletions for select
  using (user_id = auth.uid());

create policy "deletions: owner insert"
  on deletions for insert
  with check (user_id = auth.uid());

create policy "deletions: owner update"
  on deletions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "deletions: owner delete"
  on deletions for delete
  using (user_id = auth.uid());
