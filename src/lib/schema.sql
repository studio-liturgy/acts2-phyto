-- ============================================================
-- Phyto – Supabase schema
-- ============================================================

-- ------------------------------------------------------------
-- Helper: auto-update updated_at
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
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  synced_at   timestamptz default now()
);

create trigger sets_updated_at
  before update on sets
  for each row execute function update_updated_at();

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
-- A gathering is a live session (playlist) with a shareable
-- token and real-time slide state.
-- ============================================================
create table if not exists gatherings (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        references auth.users not null,
  title               text        not null,
  share_token         text        unique not null,
  is_live             boolean     default false,
  current_set_index   int         default 0,
  current_slide_index int         default 0,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create trigger gatherings_updated_at
  before update on gatherings
  for each row execute function update_updated_at();

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
-- Ordered join table linking sets into a gathering (playlist).
-- ============================================================
create table if not exists gathering_sets (
  id           uuid primary key default gen_random_uuid(),
  gathering_id uuid references gatherings on delete cascade,
  set_id       uuid references sets       on delete cascade,
  position     int  not null
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

-- Public viewers can see gathering_sets when the gathering is live.
create policy "gathering_sets: public select when live"
  on gathering_sets for select
  using (
    exists (
      select 1 from gatherings g
      where g.id = gathering_id
        and g.is_live = true
    )
  );
