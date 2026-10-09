-- ============================================================
-- Phyto - get_share_view(): show every set in the gathering
-- ============================================================
-- Follow-up to 2026-10-09-share-view-rpc.sql. That version only served sets
-- the gathering's creator could read (own, group, or shared with them). Valiant's
-- call: the share viewer shows ALL sets in a live gathering, whoever owns them,
-- exactly as the old direct-read viewer did. This replaces the function with
-- the ownership filter removed; everything else is unchanged.
--
-- DATA SAFETY: replaces one function body; no table, row or policy touched.
-- Safe to re-run; safe on the shared prod+test DB.
-- ============================================================

begin;

create or replace function public.get_share_view(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug account_slugs%rowtype;
  v_g    gatherings%rowtype;
  v_live boolean;
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
      and g.live_started_at > now() - interval '24 hours'
      and (
        (v_slug.group_id is not null and g.group_id = v_slug.group_id)
        or (v_slug.group_id is null and g.user_id = v_slug.user_id and g.group_id is null)
      )
    order by g.live_started_at desc
    limit 1;
    if not found then
      return jsonb_build_object('kind', 'waiting');
    end if;
  else
    -- 2. Legacy direct link: a gathering's own share_token.
    select g.* into v_g from gatherings g where g.share_token = p_token;
    if not found then
      return null;
    end if;
  end if;

  -- A live row with no clock compares to NULL; NULL must mean "not live".
  v_live := coalesce(v_g.is_live and v_g.live_started_at > now() - interval '24 hours', false);

  return jsonb_build_object(
    'kind', 'gathering',
    'gathering', jsonb_build_object(
      'title',           v_g.title,
      'is_live',         coalesce(v_g.is_live, false),
      'live_started_at', v_g.live_started_at,
      'hidden_sections', coalesce(v_g.hidden_sections, '{}'::jsonb)
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
end;
$$;

revoke all on function public.get_share_view(text) from public;
grant execute on function public.get_share_view(text) to anon, authenticated;

commit;
