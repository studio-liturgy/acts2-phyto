import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { signInWithEmail } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import wordmark from '@/assets/wordmark.svg';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    ...(typeof search.error === 'string' ? { error: search.error } : {}),
  }),
  component: LoginPage,
});

function LoginPage() {
  const { error: callbackError } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(callbackError ?? null);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!sent) return;
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          navigate({ to: '/' });
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sent, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await signInWithEmail(email);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div
      className="relative min-h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/login-bg.jpg')" }}
    >
      {/* Mobile: single centered column. Desktop: two-column grid */}
      <div className="flex min-h-screen flex-col items-center justify-center lg:grid lg:grid-cols-2 lg:items-stretch lg:justify-normal">

        {/* Left — wordmark */}
        <div className="mb-8 flex justify-center lg:mb-0 lg:items-center lg:px-16">
          <Link to="/"><img src={wordmark} alt="phyto" className="w-60 lg:w-80" /></Link>
        </div>

        {/* Right — form or success */}
        <div className="flex w-full items-center justify-center px-8 pb-20 lg:px-16 lg:py-0">
          <div className="w-full max-w-sm">
            {sent ? (
              <div className="space-y-3 text-center text-white">
                <p className="mono uppercase text-lg">Check your email for a sign-in link.</p>
                <p className="text-sm opacity-70">
                  Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}…
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email address"
                    required
                    className="mono uppercase text-sm w-full rounded-full border border-white/60 bg-transparent px-6 py-3 text-center text-white placeholder-white/50 outline-none focus:border-white"
                  />
                  <button
                    type="submit"
                    className="mono uppercase text-sm w-full rounded-full bg-white px-6 py-3 text-[var(--brand-blue)] transition hover:opacity-90"
                  >
                    continue
                  </button>
                </form>

                <div className="flex items-center gap-3 py-1">
                  <hr className="flex-1 border-white/40" />
                  <span className="text-sm text-white/80">or</span>
                  <hr className="flex-1 border-white/40" />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: { redirectTo: window.location.origin + '/auth/callback' },
                    })
                  }
                  className="mono uppercase text-sm w-full rounded-full bg-white px-6 py-3 text-[var(--brand-blue)] transition hover:opacity-90"
                >
                  sign in with Google
                </button>

                {error && (
                  <p className="pt-1 text-center text-sm text-white/80">{error}</p>
                )}

                <p className="pt-2 text-center text-[11px] text-white/50">
                  By signing in, you agree to the online terms of our{' '}
                  <Link to="/terms" hash="online" className="underline hover:text-white/80">Terms of Use</Link>
                  {' '}and{' '}
                  <Link to="/privacy" hash="online" className="underline hover:text-white/80">Privacy Policy</Link>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
