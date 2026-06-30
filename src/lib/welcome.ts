// Sends the welcome email for newly-created accounts. Shared by the email
// code-verify flow (login.tsx) and the Google OAuth callback (auth.callback.tsx).
export async function sendWelcomeIfNew(user: {
  email?: string;
  created_at: string;
  user_metadata?: Record<string, unknown>;
}) {
  const ageMs = Date.now() - new Date(user.created_at).getTime();
  const isNew = ageMs < 600_000;
  if (!user.email) return;

  const subscribe = sessionStorage.getItem("phyto-subscribe") === "true";
  sessionStorage.removeItem("phyto-subscribe");
  if (!isNew && !subscribe) return;

  try {
    const res = await fetch("/api/auth/welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        name: user.user_metadata?.full_name ?? undefined,
        subscribe,
        skipEmail: !isNew,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`Welcome email request failed: ${res.status} ${detail}`);
    }
  } catch (err) {
    console.warn("Welcome email request error:", err);
  }
}
