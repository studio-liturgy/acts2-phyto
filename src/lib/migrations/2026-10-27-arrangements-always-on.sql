-- Song arrangements always reach live viewers: get_share_view_v2 no longer
-- checks the workspace's Arrangements setting (removed from the app).
-- Only that check changes; the rest of the function is as in the catalog.
CREATE OR REPLACE FUNCTION public.get_share_view_v2(p_token text, p_version text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- Arrangements are always on now (no workspace setting).
    v_arrange := true;

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
$function$;
