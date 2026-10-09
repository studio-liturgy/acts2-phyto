-- ============================================================
-- Phyto - get_share_view(): the /g/<token> viewer's only read path
-- ============================================================
-- The public share viewer used to read account_slugs, gatherings,
-- gathering_sets and sets directly as anon. That needed public SELECT
-- policies on gatherings, gathering_sets and sets, and RLS cannot express
-- "the caller holds this token": a client-side .eq("share_token", ...) is a
-- PostgREST filter applied AFTER the policy decides what is visible. So the
-- token was an address, not a key. Anyone with the public anon key could list
-- every gathering (share_token included) and every set in a live gathering,
-- across all accounts, without any link.
--
-- This function takes the token as an ARGUMENT, which makes it a real key.
-- It mirrors the viewer's existing resolution exactly:
--   1. account/group slug (current or retired) -> the live gathering in that
--      scope, or "waiting" when nothing is live there;
--   2. legacy link: a gathering's own share_token.
-- Sets are only returned while the gathering is live and inside its 24h
-- window (same rule as the "gathering_sets: public select when live" policy
-- and LIVE_SESSION_MS in src/lib/live-session.ts; change them together).
--
-- Returns jsonb:
--   null                                   token matches nothing
--   {"kind":"waiting"}                     real slug, nothing live in scope
--   {"kind":"gathering","gathering":{title,is_live,live_started_at,
--     hidden_sections},"sets":[{position,id,title,type,content}]}
-- No user_id, group_id, share_token or timestamps beyond the live clock.
--
-- Ownership guard: SECURITY DEFINER bypasses sets' RLS, and the
-- gathering_sets insert policy only checks that the GATHERING is the
-- caller's, never the set_id. Without the guard, a user could link a
-- stranger's set uuid into their own gathering, go live, and read it here.
-- A set is served only if the gathering's creator could read it anyway
-- (own, group, or shared with them), or, for a group gathering, it belongs
-- to a member or the owner of that group.
--
-- DATA SAFETY: purely additive. Creates one function; touches no table, row
-- or policy. Code on prod (which doesn't call it) is unaffected. Safe to
-- re-run; safe on the shared prod+test DB.
--
-- The policy drops come later, in a separate migration, only after the
-- viewer that calls this function is live on BOTH phytoexp.live and
-- phyto.live. Dropping them first breaks the current viewer.
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

  -- coalesce the whole test: a live row with no clock compares to NULL, and
  -- NULL must mean "not live" (fail closed), never fall through to the sets.
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
        and (
          s.user_id = v_g.user_id
          or (s.group_id is not null and s.group_id = v_g.group_id)
          or (s.group_id is not null
              and (is_group_member(s.group_id, v_g.user_id)
                   or is_group_owner(s.group_id, v_g.user_id)))
          or is_set_shared_with(s.id, v_g.user_id)
          or (v_g.group_id is not null
              and (is_group_member(v_g.group_id, s.user_id)
                   or is_group_owner(v_g.group_id, s.user_id)))
        )
    ), '[]'::jsonb) end
  );
end;
$$;

-- SECURITY DEFINER functions are executable by PUBLIC on creation: revoke
-- first, then grant explicitly.
revoke all on function public.get_share_view(text) from public;
grant execute on function public.get_share_view(text) to anon, authenticated;

commit;

-- Check after applying (should return {"kind":"waiting"}, a gathering, or null):
--   select get_share_view('<a real slug>');
