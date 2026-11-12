// Present from a phone (n133): who may drive a screen room, checked once per
// remote connection against Supabase with the caller's own login (RLS
// applies; no service key). Pure apart from the `fetch` it's given, so it's
// unit-tested.

export interface RoomOwner {
  /** The account whose share slug this is (the creator, for a group slug). */
  userId: string;
  /** Set for a group's slug: any member of the group may drive it. */
  groupId: string | null;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The owner of a share slug (any of its slugs, current or old), or null. */
export async function ownerOfSlug(
  slug: string,
  supabaseUrl: string,
  anonKey: string,
  fetchFn: Fetch = fetch,
): Promise<RoomOwner | null> {
  const url = `${supabaseUrl}/rest/v1/account_slugs?slug=eq.${encodeURIComponent(slug)}&select=user_id,group_id&limit=1`;
  const res = await fetchFn(url, {
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as { user_id: string; group_id: string | null }[];
  const row = rows[0];
  return row ? { userId: row.user_id, groupId: row.group_id ?? null } : null;
}

/** The room a slug's sockets meet in: one per account or group, so a
 *  renamed slug still reaches the same room. */
export function roomName(owner: RoomOwner): string {
  return owner.groupId ? `g:${owner.groupId}` : `u:${owner.userId}`;
}

/** Whether the holder of `token` may drive this room: the account itself, or
 *  for a group's slug, the group's owner or any member. */
export async function canDrive(
  token: string,
  owner: RoomOwner,
  supabaseUrl: string,
  anonKey: string,
  fetchFn: Fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  const headers = { apikey: anonKey, authorization: `Bearer ${token}` };
  const userRes = await fetchFn(`${supabaseUrl}/auth/v1/user`, { headers });
  if (!userRes.ok) return false;
  const uid = ((await userRes.json()) as { id?: string }).id;
  if (!uid) return false;
  if (!owner.groupId) return uid === owner.userId;
  const gid = encodeURIComponent(owner.groupId);
  const groupRes = await fetchFn(`${supabaseUrl}/rest/v1/groups?id=eq.${gid}&select=owner_id`, {
    headers,
  });
  if (groupRes.ok) {
    const rows = (await groupRes.json()) as { owner_id: string }[];
    if (rows[0]?.owner_id === uid) return true;
  }
  const memberRes = await fetchFn(
    `${supabaseUrl}/rest/v1/group_members?group_id=eq.${gid}&user_id=eq.${encodeURIComponent(uid)}&select=user_id`,
    { headers },
  );
  if (!memberRes.ok) return false;
  return ((await memberRes.json()) as unknown[]).length > 0;
}
