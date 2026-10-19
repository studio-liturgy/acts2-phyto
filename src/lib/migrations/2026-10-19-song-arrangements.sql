-- ============================================================
-- Phyto - song arrangements (n23)
-- ============================================================
-- gatherings.arrangements: per gathering, set id -> ordered section keys
--   ("Chorus#0", repeats allowed). Session state like hidden_sections.
-- workspace_settings.arrangements: the Settings toggle (off by default).
-- get_share_view_v2 also returns the gathering's arrangements, but only while
--   its workspace has the toggle on ({} otherwise), so the phone follows.
--
-- DATA SAFETY: additive. Two new columns (one nullable, one defaulted), and
-- v2 gains one extra key that current code ignores. No rows or policies
-- change. Safe to re-run; safe on the shared prod+test DB.
-- ============================================================

begin;

alter table public.gatherings add column if not exists arrangements jsonb;
alter table public.workspace_settings
  add column if not exists arrangements boolean not null default false;

create or replace function public.get_share_view_v2(p_token text, p_version text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.get_share_view_v2(text, text) from public;
grant execute on function public.get_share_view_v2(text, text) to anon, authenticated;

commit;
