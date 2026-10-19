-- phytoexp.live: setup for its OWN Supabase project (not the shared one).
-- Run once in the NEW project's SQL editor. Never run against hphxsevacjcjfmyfifxz.
-- Generated 2026-10-19 by pg_dump --schema-only of the live public schema
-- (tables, functions, triggers, policies, grants), so it matches what prod runs
-- today rather than src/lib/schema.sql, which has drifted.

--
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

--
-- Name: gathering_viewer_meta(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gathering_viewer_meta(p_token text) RETURNS TABLE(id uuid, title text, is_live boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select g.id, g.title, g.is_live
  from gatherings g
  where g.share_token = p_token;
$$;

--
-- Name: gathering_viewer_sets(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gathering_viewer_sets(p_token text) RETURNS TABLE(set_id uuid, set_position integer, title text, type text, content jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select s.id, gs.position, s.title, s.type, s.content
  from gatherings g
  join gathering_sets gs on gs.gathering_id = g.id
  join sets s           on s.id = gs.set_id
  where g.share_token = p_token
    and g.is_live = true
  order by gs.position;
$$;

--
-- Name: gatherings_live_clock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gatherings_live_clock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

--
-- Name: get_share_view_v2(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_share_view_v2(p_token text, p_version text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_slug    account_slugs%rowtype;
  v_g       gatherings%rowtype;
  v_live    boolean;
  v_view    jsonb;
  v_version text;
  v_arrange boolean;
begin
  if p_token is null or length(p_token) = 0 or length(p_token) > 200 then
    return null;
  end if;

  -- 1. Account/group slug -> the one live gathering in that scope.
  select * into v_slug from account_slugs where slug = p_token;
  if found then
    select g.* into v_g
    from gatherings g
    where g.is_live = true
      and g.live_started_at > now() - interval '14 days'
      and (
        (v_slug.group_id is not null and g.group_id = v_slug.group_id)
        or (v_slug.group_id is null and g.user_id = v_slug.user_id and g.group_id is null)
      )
    order by g.live_started_at desc
    limit 1;
    if not found then
      v_view := jsonb_build_object('kind', 'waiting');
    end if;
  else
    -- 2. Legacy direct link: a gathering's own share_token.
    select g.* into v_g from gatherings g where g.share_token = p_token;
    if not found then
      return null;
    end if;
  end if;

  if v_view is null then
    -- A live row with no clock compares to NULL; NULL must mean "not live".
    v_live := coalesce(v_g.is_live and v_g.live_started_at > now() - interval '14 days', false);

    -- Arrangements apply only while the gathering's workspace has them on.
    select ws.arrangements into v_arrange
    from workspace_settings ws
    where (v_g.group_id is not null and ws.group_id = v_g.group_id)
       or (v_g.group_id is null and ws.user_id = v_g.user_id and ws.group_id is null)
    limit 1;

    v_view := jsonb_build_object(
      'kind', 'gathering',
      'gathering', jsonb_build_object(
        'title',           v_g.title,
        'is_live',         coalesce(v_g.is_live, false),
        'live_started_at', v_g.live_started_at,
        'hidden_sections', coalesce(v_g.hidden_sections, '{}'::jsonb),
        'arrangements',    case when coalesce(v_arrange, false)
                                then coalesce(v_g.arrangements, '{}'::jsonb)
                                else '{}'::jsonb end
      ),
      'sets', case when not v_live then '[]'::jsonb else coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'position', gs.position,
                   'id',       s.id,
                   'title',    s.title,
                   'type',     s.type,
                   'content',  s.content
                 )
                 order by gs.position
               )
        from gathering_sets gs
        join sets s on s.id = gs.set_id
        where gs.gathering_id = v_g.id
      ), '[]'::jsonb) end
    );
  end if;

  v_version := md5(v_view::text);
  if p_version is not null and p_version = v_version then
    return jsonb_build_object('kind', 'unchanged', 'version', v_version);
  end if;
  return v_view || jsonb_build_object('version', v_version);
end;
$$;

--
-- Name: get_transparency_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_transparency_stats() RETURNS TABLE(accounts bigint, sets bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  select
    (select count(*) from auth.users) as accounts,
    (select count(*) from public.sets) as sets;
$$;

--
-- Name: handle_available(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_available(candidate text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select not exists (
    select 1 from public.profiles
    where handle = lower(candidate)
      and user_id is distinct from auth.uid()
  );
$$;

--
-- Name: is_group_invitee(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_invitee(gid uuid, mail text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
    select exists (
      select 1 from group_members gm
      where gm.group_id = gid and gm.email = mail
    );
$$;

--
-- Name: is_group_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_member(gid uuid, uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from group_members gm where gm.group_id = gid and gm.user_id = uid);
$$;

--
-- Name: is_group_owner(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_owner(gid uuid, uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from groups g where g.id = gid and g.owner_id = uid);
$$;

--
-- Name: is_set_in_my_group(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_set_in_my_group(sid uuid, uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.group_sets gs
    join public.group_members gm on gm.group_id = gs.group_id
    where gs.set_id = sid and gm.user_id = uid
  );
$$;

--
-- Name: is_set_shared_with(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_set_shared_with(sid uuid, uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from set_shares s where s.set_id = sid and s.grantee_user_id = uid);
$$;

--
-- Name: profiles_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;

--
-- Name: sets_update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sets_update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if (new.title   is distinct from old.title)
     or (new.type    is distinct from old.type)
     or (new.content is distinct from old.content) then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

--
-- Name: user_id_for_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_id_for_email(p_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_slugs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_slugs (
    slug text NOT NULL,
    user_id uuid,
    group_id uuid,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_slugs_one_scope CHECK (((user_id IS NULL) <> (group_id IS NULL)))
);

--
-- Name: contributors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contributors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    categories text[] NOT NULL,
    portfolio text,
    experience text NOT NULL,
    heard_about text NOT NULL,
    testimony text NOT NULL,
    motivation text NOT NULL,
    ai_experience text NOT NULL,
    user_agent text
);

--
-- Name: deletions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deletions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deletions_kind_check CHECK ((kind = ANY (ARRAY['set'::text, 'gathering'::text])))
);

--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category text NOT NULL,
    message text NOT NULL,
    email text,
    user_agent text
);

--
-- Name: gathering_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gathering_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gathering_id uuid,
    set_id uuid,
    "position" integer NOT NULL
);

--
-- Name: gatherings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gatherings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    share_token text NOT NULL,
    is_live boolean DEFAULT false,
    current_set_index integer DEFAULT 0,
    current_slide_index integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_modified_by text,
    live_started_at timestamp with time zone,
    hidden_sections jsonb DEFAULT '{}'::jsonb NOT NULL,
    group_id uuid,
    arrangements jsonb
);

--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by_email text,
    CONSTRAINT group_members_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])))
);

--
-- Name: group_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    set_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    owner_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    owner_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    user_id uuid NOT NULL,
    handle text NOT NULL,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_display_name_length CHECK (((char_length(btrim(display_name)) >= 1) AND (char_length(btrim(display_name)) <= 60))),
    CONSTRAINT profiles_handle_format CHECK ((handle ~ '^[a-z0-9_]{3,24}$'::text))
);

--
-- Name: set_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.set_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    set_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    grantee_email text NOT NULL,
    grantee_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_email text
);

--
-- Name: sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    content jsonb DEFAULT '{"en": ""}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    synced_at timestamp with time zone DEFAULT now(),
    last_modified_by text,
    group_id uuid
);

--
-- Name: transparency_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transparency_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'CAD'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fees numeric(12,2) DEFAULT 0 NOT NULL,
    net_amount numeric(12,2) GENERATED ALWAYS AS ((amount - fees)) STORED,
    stripe_payment_id text,
    CONSTRAINT transparency_entries_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT transparency_entries_expense_needs_description CHECK (((type <> 'expense'::text) OR (description IS NOT NULL))),
    CONSTRAINT transparency_entries_fees_check CHECK ((fees >= (0)::numeric)),
    CONSTRAINT transparency_entries_type_check CHECK ((type = ANY (ARRAY['donation'::text, 'expense'::text])))
);

--
-- Name: workspace_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    group_id uuid,
    multi_language boolean DEFAULT false NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    language2 text,
    arrangements boolean DEFAULT false NOT NULL,
    CONSTRAINT workspace_settings_one_scope CHECK (((user_id IS NULL) <> (group_id IS NULL)))
);

--
-- Name: account_slugs account_slugs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_slugs
    ADD CONSTRAINT account_slugs_pkey PRIMARY KEY (slug);

--
-- Name: contributors contributors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contributors
    ADD CONSTRAINT contributors_pkey PRIMARY KEY (id);

--
-- Name: deletions deletions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deletions
    ADD CONSTRAINT deletions_pkey PRIMARY KEY (id);

--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);

--
-- Name: gathering_sets gathering_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gathering_sets
    ADD CONSTRAINT gathering_sets_pkey PRIMARY KEY (id);

--
-- Name: gatherings gatherings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gatherings
    ADD CONSTRAINT gatherings_pkey PRIMARY KEY (id);

--
-- Name: gatherings gatherings_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gatherings
    ADD CONSTRAINT gatherings_share_token_key UNIQUE (share_token);

--
-- Name: group_members group_members_group_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_email_key UNIQUE (group_id, email);

--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);

--
-- Name: group_sets group_sets_group_id_set_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sets
    ADD CONSTRAINT group_sets_group_id_set_id_key UNIQUE (group_id, set_id);

--
-- Name: group_sets group_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sets
    ADD CONSTRAINT group_sets_pkey PRIMARY KEY (id);

--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);

--
-- Name: set_shares set_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_shares
    ADD CONSTRAINT set_shares_pkey PRIMARY KEY (id);

--
-- Name: set_shares set_shares_set_id_grantee_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_shares
    ADD CONSTRAINT set_shares_set_id_grantee_email_key UNIQUE (set_id, grantee_email);

--
-- Name: sets sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_pkey PRIMARY KEY (id);

--
-- Name: transparency_entries transparency_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transparency_entries
    ADD CONSTRAINT transparency_entries_pkey PRIMARY KEY (id);

--
-- Name: workspace_settings workspace_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_settings
    ADD CONSTRAINT workspace_settings_pkey PRIMARY KEY (id);

--
-- Name: account_slugs_group_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_slugs_group_current ON public.account_slugs USING btree (group_id) WHERE (is_current AND (group_id IS NOT NULL));

--
-- Name: account_slugs_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_slugs_group_idx ON public.account_slugs USING btree (group_id);

--
-- Name: account_slugs_user_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_slugs_user_current ON public.account_slugs USING btree (user_id) WHERE (is_current AND (group_id IS NULL));

--
-- Name: account_slugs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_slugs_user_idx ON public.account_slugs USING btree (user_id);

--
-- Name: gatherings_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gatherings_group_id_idx ON public.gatherings USING btree (group_id);

--
-- Name: group_members_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_members_email_idx ON public.group_members USING btree (email);

--
-- Name: group_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_members_user_idx ON public.group_members USING btree (user_id, group_id);

--
-- Name: profiles_handle_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_handle_key ON public.profiles USING btree (handle);

--
-- Name: set_shares_grantee_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX set_shares_grantee_email_idx ON public.set_shares USING btree (grantee_email);

--
-- Name: set_shares_grantee_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX set_shares_grantee_user_idx ON public.set_shares USING btree (grantee_user_id);

--
-- Name: set_shares_set_grantee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX set_shares_set_grantee_idx ON public.set_shares USING btree (set_id, grantee_user_id);

--
-- Name: sets_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sets_group_id_idx ON public.sets USING btree (group_id);

--
-- Name: transparency_entries_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transparency_entries_date_idx ON public.transparency_entries USING btree (entry_date DESC);

--
-- Name: transparency_entries_stripe_payment_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transparency_entries_stripe_payment_id_key ON public.transparency_entries USING btree (stripe_payment_id) WHERE (stripe_payment_id IS NOT NULL);

--
-- Name: workspace_settings_group_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_settings_group_key ON public.workspace_settings USING btree (group_id) WHERE (group_id IS NOT NULL);

--
-- Name: workspace_settings_user_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_settings_user_key ON public.workspace_settings USING btree (user_id) WHERE (user_id IS NOT NULL);

--
-- Name: gatherings gatherings_live_clock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gatherings_live_clock BEFORE INSERT OR UPDATE ON public.gatherings FOR EACH ROW EXECUTE FUNCTION public.gatherings_live_clock();

--
-- Name: gatherings gatherings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gatherings_updated_at BEFORE UPDATE ON public.gatherings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

--
-- Name: profiles profiles_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_touch_updated_at();

--
-- Name: sets sets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sets_updated_at BEFORE UPDATE ON public.sets FOR EACH ROW EXECUTE FUNCTION public.sets_update_updated_at();

--
-- Name: account_slugs account_slugs_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_slugs
    ADD CONSTRAINT account_slugs_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

--
-- Name: account_slugs account_slugs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_slugs
    ADD CONSTRAINT account_slugs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: deletions deletions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deletions
    ADD CONSTRAINT deletions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

--
-- Name: gathering_sets gathering_sets_gathering_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gathering_sets
    ADD CONSTRAINT gathering_sets_gathering_id_fkey FOREIGN KEY (gathering_id) REFERENCES public.gatherings(id) ON DELETE CASCADE;

--
-- Name: gathering_sets gathering_sets_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gathering_sets
    ADD CONSTRAINT gathering_sets_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id) ON DELETE CASCADE;

--
-- Name: gatherings gatherings_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gatherings
    ADD CONSTRAINT gatherings_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;

--
-- Name: gatherings gatherings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gatherings
    ADD CONSTRAINT gatherings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

--
-- Name: group_members group_members_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id);

--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

--
-- Name: group_members group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

--
-- Name: group_sets group_sets_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sets
    ADD CONSTRAINT group_sets_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

--
-- Name: group_sets group_sets_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sets
    ADD CONSTRAINT group_sets_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);

--
-- Name: group_sets group_sets_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sets
    ADD CONSTRAINT group_sets_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id) ON DELETE CASCADE;

--
-- Name: groups groups_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);

--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: set_shares set_shares_grantee_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_shares
    ADD CONSTRAINT set_shares_grantee_user_id_fkey FOREIGN KEY (grantee_user_id) REFERENCES auth.users(id);

--
-- Name: set_shares set_shares_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_shares
    ADD CONSTRAINT set_shares_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);

--
-- Name: set_shares set_shares_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_shares
    ADD CONSTRAINT set_shares_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id) ON DELETE CASCADE;

--
-- Name: sets sets_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;

--
-- Name: sets sets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

--
-- Name: workspace_settings workspace_settings_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_settings
    ADD CONSTRAINT workspace_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

--
-- Name: workspace_settings workspace_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_settings
    ADD CONSTRAINT workspace_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: account_slugs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_slugs ENABLE ROW LEVEL SECURITY;

--
-- Name: account_slugs account_slugs: group delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_slugs: group delete" ON public.account_slugs FOR DELETE USING (((group_id IS NOT NULL) AND public.is_group_owner(group_id, auth.uid())));

--
-- Name: account_slugs account_slugs: group insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_slugs: group insert" ON public.account_slugs FOR INSERT WITH CHECK (((group_id IS NOT NULL) AND public.is_group_owner(group_id, auth.uid())));

--
-- Name: account_slugs account_slugs: group update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_slugs: group update" ON public.account_slugs FOR UPDATE USING (((group_id IS NOT NULL) AND public.is_group_owner(group_id, auth.uid()))) WITH CHECK (((group_id IS NOT NULL) AND public.is_group_owner(group_id, auth.uid())));

--
-- Name: account_slugs account_slugs: personal delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_slugs: personal delete" ON public.account_slugs FOR DELETE USING (((user_id = auth.uid()) AND (group_id IS NULL)));

--
-- Name: account_slugs account_slugs: personal insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_slugs: personal insert" ON public.account_slugs FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (group_id IS NULL)));

--
-- Name: account_slugs account_slugs: personal update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_slugs: personal update" ON public.account_slugs FOR UPDATE USING (((user_id = auth.uid()) AND (group_id IS NULL))) WITH CHECK (((user_id = auth.uid()) AND (group_id IS NULL)));

--
-- Name: account_slugs account_slugs: public select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_slugs: public select" ON public.account_slugs FOR SELECT USING (true);

--
-- Name: contributors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contributors ENABLE ROW LEVEL SECURITY;

--
-- Name: deletions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deletions ENABLE ROW LEVEL SECURITY;

--
-- Name: deletions deletions: owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deletions: owner delete" ON public.deletions FOR DELETE USING ((user_id = auth.uid()));

--
-- Name: deletions deletions: owner insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deletions: owner insert" ON public.deletions FOR INSERT WITH CHECK ((user_id = auth.uid()));

--
-- Name: deletions deletions: owner select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deletions: owner select" ON public.deletions FOR SELECT USING ((user_id = auth.uid()));

--
-- Name: deletions deletions: owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deletions: owner update" ON public.deletions FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: gathering_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gathering_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: gathering_sets gathering_sets: member delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gathering_sets: member delete" ON public.gathering_sets FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.gatherings g
  WHERE ((g.id = gathering_sets.gathering_id) AND ((g.user_id = auth.uid()) OR ((g.group_id IS NOT NULL) AND public.is_group_member(g.group_id, auth.uid())))))));

--
-- Name: gathering_sets gathering_sets: member insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gathering_sets: member insert" ON public.gathering_sets FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.gatherings g
  WHERE ((g.id = gathering_sets.gathering_id) AND ((g.user_id = auth.uid()) OR ((g.group_id IS NOT NULL) AND public.is_group_member(g.group_id, auth.uid())))))));

--
-- Name: gathering_sets gathering_sets: member select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gathering_sets: member select" ON public.gathering_sets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.gatherings g
  WHERE ((g.id = gathering_sets.gathering_id) AND ((g.user_id = auth.uid()) OR ((g.group_id IS NOT NULL) AND public.is_group_member(g.group_id, auth.uid())))))));

--
-- Name: gathering_sets gathering_sets: member update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gathering_sets: member update" ON public.gathering_sets FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.gatherings g
  WHERE ((g.id = gathering_sets.gathering_id) AND ((g.user_id = auth.uid()) OR ((g.group_id IS NOT NULL) AND public.is_group_member(g.group_id, auth.uid())))))));

--
-- Name: gatherings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gatherings ENABLE ROW LEVEL SECURITY;

--
-- Name: gatherings gatherings: member delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gatherings: member delete" ON public.gatherings FOR DELETE USING (((user_id = auth.uid()) OR ((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid()))));

--
-- Name: gatherings gatherings: member insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gatherings: member insert" ON public.gatherings FOR INSERT WITH CHECK (((user_id = auth.uid()) AND ((group_id IS NULL) OR public.is_group_member(group_id, auth.uid()))));

--
-- Name: gatherings gatherings: member select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gatherings: member select" ON public.gatherings FOR SELECT USING (((user_id = auth.uid()) OR ((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid()))));

--
-- Name: gatherings gatherings: member update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gatherings: member update" ON public.gatherings FOR UPDATE USING (((user_id = auth.uid()) OR ((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid())))) WITH CHECK (((user_id = auth.uid()) OR ((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid()))));

--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members group_members: delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_members: delete" ON public.group_members FOR DELETE USING ((public.is_group_owner(group_id, auth.uid()) OR (user_id = auth.uid()) OR (email = (auth.jwt() ->> 'email'::text))));

--
-- Name: group_members group_members: owner insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_members: owner insert" ON public.group_members FOR INSERT WITH CHECK (public.is_group_owner(group_id, auth.uid()));

--
-- Name: group_members group_members: read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_members: read" ON public.group_members FOR SELECT USING ((public.is_group_owner(group_id, auth.uid()) OR public.is_group_member(group_id, auth.uid()) OR (email = (auth.jwt() ->> 'email'::text))));

--
-- Name: group_members group_members: update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_members: update" ON public.group_members FOR UPDATE USING ((public.is_group_owner(group_id, auth.uid()) OR (email = (auth.jwt() ->> 'email'::text)))) WITH CHECK ((public.is_group_owner(group_id, auth.uid()) OR ((email = (auth.jwt() ->> 'email'::text)) AND (user_id = auth.uid()))));

--
-- Name: group_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: group_sets group_sets: delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_sets: delete" ON public.group_sets FOR DELETE USING (((owner_id = auth.uid()) OR public.is_group_owner(group_id, auth.uid())));

--
-- Name: group_sets group_sets: owner insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_sets: owner insert" ON public.group_sets FOR INSERT WITH CHECK (((owner_id = auth.uid()) AND public.is_group_member(group_id, auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.sets s
  WHERE ((s.id = group_sets.set_id) AND (s.user_id = auth.uid()))))));

--
-- Name: group_sets group_sets: read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_sets: read" ON public.group_sets FOR SELECT USING ((public.is_group_member(group_id, auth.uid()) OR (owner_id = auth.uid())));

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: groups groups: member select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "groups: member select" ON public.groups FOR SELECT USING (((owner_id = auth.uid()) OR public.is_group_member(id, auth.uid()) OR public.is_group_invitee(id, (auth.jwt() ->> 'email'::text))));

--
-- Name: groups groups: owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "groups: owner delete" ON public.groups FOR DELETE USING ((owner_id = auth.uid()));

--
-- Name: groups groups: owner insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "groups: owner insert" ON public.groups FOR INSERT WITH CHECK ((owner_id = auth.uid()));

--
-- Name: groups groups: owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "groups: owner update" ON public.groups FOR UPDATE USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles: owner inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: owner inserts" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

--
-- Name: profiles profiles: owner reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: owner reads" ON public.profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));

--
-- Name: profiles profiles: owner updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: owner updates" ON public.profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

--
-- Name: set_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.set_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: set_shares set_shares: grantee delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "set_shares: grantee delete" ON public.set_shares FOR DELETE USING ((grantee_user_id = auth.uid()));

--
-- Name: set_shares set_shares: owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "set_shares: owner delete" ON public.set_shares FOR DELETE USING ((owner_id = auth.uid()));

--
-- Name: set_shares set_shares: owner insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "set_shares: owner insert" ON public.set_shares FOR INSERT WITH CHECK (((owner_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.sets s
  WHERE ((s.id = set_shares.set_id) AND (s.user_id = auth.uid()))))));

--
-- Name: set_shares set_shares: read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "set_shares: read" ON public.set_shares FOR SELECT USING (((owner_id = auth.uid()) OR (grantee_user_id = auth.uid()) OR (grantee_email = (auth.jwt() ->> 'email'::text))));

--
-- Name: set_shares set_shares: update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "set_shares: update" ON public.set_shares FOR UPDATE USING (((owner_id = auth.uid()) OR (grantee_email = (auth.jwt() ->> 'email'::text)))) WITH CHECK (((owner_id = auth.uid()) OR ((grantee_email = (auth.jwt() ->> 'email'::text)) AND (grantee_user_id = auth.uid()))));

--
-- Name: sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

--
-- Name: sets sets: member delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sets: member delete" ON public.sets FOR DELETE USING (((user_id = auth.uid()) OR ((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid()))));

--
-- Name: sets sets: member insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sets: member insert" ON public.sets FOR INSERT WITH CHECK (((user_id = auth.uid()) AND ((group_id IS NULL) OR public.is_group_member(group_id, auth.uid()))));

--
-- Name: sets sets: member select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sets: member select" ON public.sets FOR SELECT USING (((user_id = auth.uid()) OR ((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid())) OR public.is_set_shared_with(id, auth.uid()) OR public.is_set_in_my_group(id, auth.uid())));

--
-- Name: sets sets: member update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sets: member update" ON public.sets FOR UPDATE USING (((user_id = auth.uid()) OR ((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid())) OR public.is_set_shared_with(id, auth.uid()) OR public.is_set_in_my_group(id, auth.uid()))) WITH CHECK (((user_id = auth.uid()) OR ((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid())) OR public.is_set_shared_with(id, auth.uid()) OR public.is_set_in_my_group(id, auth.uid())));

--
-- Name: transparency_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transparency_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: transparency_entries transparency_entries: public select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "transparency_entries: public select" ON public.transparency_entries FOR SELECT USING (true);

--
-- Name: workspace_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_settings workspace_settings: group insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "workspace_settings: group insert" ON public.workspace_settings FOR INSERT WITH CHECK (((group_id IS NOT NULL) AND public.is_group_owner(group_id, auth.uid())));

--
-- Name: workspace_settings workspace_settings: group update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "workspace_settings: group update" ON public.workspace_settings FOR UPDATE USING (((group_id IS NOT NULL) AND public.is_group_owner(group_id, auth.uid()))) WITH CHECK (((group_id IS NOT NULL) AND public.is_group_owner(group_id, auth.uid())));

--
-- Name: workspace_settings workspace_settings: personal insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "workspace_settings: personal insert" ON public.workspace_settings FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (group_id IS NULL)));

--
-- Name: workspace_settings workspace_settings: personal update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "workspace_settings: personal update" ON public.workspace_settings FOR UPDATE USING (((user_id = auth.uid()) AND (group_id IS NULL))) WITH CHECK (((user_id = auth.uid()) AND (group_id IS NULL)));

--
-- Name: workspace_settings workspace_settings: public select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "workspace_settings: public select" ON public.workspace_settings FOR SELECT USING (true);

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

--
-- Name: FUNCTION gathering_viewer_meta(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gathering_viewer_meta(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gathering_viewer_meta(p_token text) TO anon;
GRANT ALL ON FUNCTION public.gathering_viewer_meta(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.gathering_viewer_meta(p_token text) TO service_role;

--
-- Name: FUNCTION gathering_viewer_sets(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gathering_viewer_sets(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gathering_viewer_sets(p_token text) TO anon;
GRANT ALL ON FUNCTION public.gathering_viewer_sets(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.gathering_viewer_sets(p_token text) TO service_role;

--
-- Name: FUNCTION gatherings_live_clock(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gatherings_live_clock() TO anon;
GRANT ALL ON FUNCTION public.gatherings_live_clock() TO authenticated;
GRANT ALL ON FUNCTION public.gatherings_live_clock() TO service_role;

--
-- Name: FUNCTION get_share_view_v2(p_token text, p_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_share_view_v2(p_token text, p_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_share_view_v2(p_token text, p_version text) TO anon;
GRANT ALL ON FUNCTION public.get_share_view_v2(p_token text, p_version text) TO authenticated;
GRANT ALL ON FUNCTION public.get_share_view_v2(p_token text, p_version text) TO service_role;

--
-- Name: FUNCTION get_transparency_stats(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_transparency_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_transparency_stats() TO anon;
GRANT ALL ON FUNCTION public.get_transparency_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_transparency_stats() TO service_role;

--
-- Name: FUNCTION handle_available(candidate text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_available(candidate text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_available(candidate text) TO anon;
GRANT ALL ON FUNCTION public.handle_available(candidate text) TO authenticated;
GRANT ALL ON FUNCTION public.handle_available(candidate text) TO service_role;

--
-- Name: FUNCTION is_group_invitee(gid uuid, mail text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_invitee(gid uuid, mail text) TO anon;
GRANT ALL ON FUNCTION public.is_group_invitee(gid uuid, mail text) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_invitee(gid uuid, mail text) TO service_role;

--
-- Name: FUNCTION is_group_member(gid uuid, uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_member(gid uuid, uid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_member(gid uuid, uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_member(gid uuid, uid uuid) TO service_role;

--
-- Name: FUNCTION is_group_owner(gid uuid, uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_owner(gid uuid, uid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_owner(gid uuid, uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_owner(gid uuid, uid uuid) TO service_role;

--
-- Name: FUNCTION is_set_in_my_group(sid uuid, uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_set_in_my_group(sid uuid, uid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_set_in_my_group(sid uuid, uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_set_in_my_group(sid uuid, uid uuid) TO service_role;

--
-- Name: FUNCTION is_set_shared_with(sid uuid, uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_set_shared_with(sid uuid, uid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_set_shared_with(sid uuid, uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_set_shared_with(sid uuid, uid uuid) TO service_role;

--
-- Name: FUNCTION profiles_touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.profiles_touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.profiles_touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.profiles_touch_updated_at() TO service_role;

--
-- Name: FUNCTION sets_update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sets_update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.sets_update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.sets_update_updated_at() TO service_role;

--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;

--
-- Name: FUNCTION user_id_for_email(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.user_id_for_email(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_id_for_email(p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.user_id_for_email(p_email text) TO service_role;

--
-- Name: TABLE account_slugs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.account_slugs TO anon;
GRANT ALL ON TABLE public.account_slugs TO authenticated;
GRANT ALL ON TABLE public.account_slugs TO service_role;

--
-- Name: TABLE contributors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contributors TO anon;
GRANT ALL ON TABLE public.contributors TO authenticated;
GRANT ALL ON TABLE public.contributors TO service_role;

--
-- Name: TABLE deletions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.deletions TO anon;
GRANT ALL ON TABLE public.deletions TO authenticated;
GRANT ALL ON TABLE public.deletions TO service_role;

--
-- Name: TABLE feedback; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.feedback TO anon;
GRANT ALL ON TABLE public.feedback TO authenticated;
GRANT ALL ON TABLE public.feedback TO service_role;

--
-- Name: TABLE gathering_sets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gathering_sets TO anon;
GRANT ALL ON TABLE public.gathering_sets TO authenticated;
GRANT ALL ON TABLE public.gathering_sets TO service_role;

--
-- Name: TABLE gatherings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gatherings TO anon;
GRANT ALL ON TABLE public.gatherings TO authenticated;
GRANT ALL ON TABLE public.gatherings TO service_role;

--
-- Name: TABLE group_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_members TO anon;
GRANT ALL ON TABLE public.group_members TO authenticated;
GRANT ALL ON TABLE public.group_members TO service_role;

--
-- Name: TABLE group_sets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_sets TO anon;
GRANT ALL ON TABLE public.group_sets TO authenticated;
GRANT ALL ON TABLE public.group_sets TO service_role;

--
-- Name: TABLE groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.groups TO anon;
GRANT ALL ON TABLE public.groups TO authenticated;
GRANT ALL ON TABLE public.groups TO service_role;

--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

--
-- Name: TABLE set_shares; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.set_shares TO anon;
GRANT ALL ON TABLE public.set_shares TO authenticated;
GRANT ALL ON TABLE public.set_shares TO service_role;

--
-- Name: TABLE sets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sets TO anon;
GRANT ALL ON TABLE public.sets TO authenticated;
GRANT ALL ON TABLE public.sets TO service_role;

--
-- Name: TABLE transparency_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transparency_entries TO anon;
GRANT ALL ON TABLE public.transparency_entries TO authenticated;
GRANT ALL ON TABLE public.transparency_entries TO service_role;

--
-- Name: TABLE workspace_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspace_settings TO anon;
GRANT ALL ON TABLE public.workspace_settings TO authenticated;
GRANT ALL ON TABLE public.workspace_settings TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
--
