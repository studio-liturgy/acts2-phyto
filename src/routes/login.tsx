import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { signInWithEmail } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { APP_NAME } from '@/lib/appConfig';
import wordmark from '@/assets/wordmark.svg';
import wordmarkTestBlack from '@/assets/wordmark-test-black.svg';

const isTest = import.meta.env.VITE_APP_ENV === 'test';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    ...(typeof search.error === 'string' ? { error: search.error } : {}),
  }),
  head: () => ({
    meta: [
      { title: `Sign In | ${APP_NAME}` },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { error: callbackError } = Route.useSearch();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [subscribe, setSubscribe] = useState(false);
  const [error, setError] = useState<string | null>(callbackError ?? null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    sessionStorage.setItem("phyto-subscribe", String(subscribe));
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
      style={{ backgroundImage: `url('${isTest ? '/login-bg-or.jpg' : '/login-bg.jpg'}')` }}
    >
      {/* Mobile: single centered column. Desktop: two-column grid */}
      <div className="flex min-h-screen flex-col items-center justify-center lg:grid lg:grid-cols-2 lg:items-stretch lg:justify-normal">

        {/* Left — wordmark */}
        <div className="mb-8 flex justify-center lg:mb-0 lg:items-center lg:px-16">
          <Link to="/"><img src={isTest ? wordmarkTestBlack : wordmark} alt={isTest ? 'phytoexp' : 'phyto'} className="w-60 lg:w-80" /></Link>
        </div>

        {/* Right — form or success */}
        <div className="flex w-full items-center justify-center px-8 pb-20 lg:px-16 lg:py-0">
          <div className="w-full max-w-sm">
            {sent ? (
              <div className={`space-y-3 text-center ${isTest ? 'text-black' : 'text-white'}`}>
                <p className="mono uppercase text-sm lg:text-base">Check your email for a sign-in link!</p>
                <p className="text-sm opacity-70">
                  A link was sent to {email}.
                </p>
                <p className="text-sm opacity-70">
                  If you haven't received it yet, check your spam or junk folder.
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
                    className={`mono uppercase text-sm w-full rounded-full bg-transparent px-6 py-3 text-center outline-none ${
                      isTest
                        ? 'border border-black/40 text-black placeholder-black/50 focus:border-black'
                        : 'border border-white/60 text-white placeholder-white/50 focus:border-white'
                    }`}
                  />
                  <button
                    type="submit"
                    className={`mono uppercase text-sm w-full rounded-full px-6 py-3 transition hover:opacity-90 ${isTest ? 'bg-[var(--brand-black)] text-[var(--brand-white)]' : 'bg-white text-[var(--brand-blue)]'}`}
                  >
                    continue
                  </button>
                </form>

                <div className="flex items-center gap-3 py-1">
                  <hr className={`flex-1 ${isTest ? 'border-black/40' : 'border-white/40'}`} />
                  <span className={`text-sm ${isTest ? 'text-black/80' : 'text-white/80'}`}>or</span>
                  <hr className={`flex-1 ${isTest ? 'border-black/40' : 'border-white/40'}`} />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem("phyto-subscribe", String(subscribe));
                    supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: { redirectTo: window.location.origin + '/auth/callback' },
                    });
                  }}
                  className={`mono uppercase text-sm w-full rounded-full px-6 py-3 transition hover:opacity-90 ${isTest ? 'bg-[var(--brand-black)] text-[var(--brand-white)]' : 'bg-white text-[var(--brand-blue)]'}`}
                >
                  sign in with Google
                </button>

                {error && (
                  <p className={`pt-1 text-center text-sm ${isTest ? 'text-black/80' : 'text-white/80'}`}>{error}</p>
                )}

                <label className={`mono flex cursor-pointer items-center justify-center gap-2 pt-1 text-[11px] uppercase ${isTest ? 'text-black/70' : 'text-white/70'}`}>
                  <input
                    type="checkbox"
                    checked={subscribe}
                    onChange={(e) => setSubscribe(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${isTest ? 'border-black' : 'border-white'}`}>
                    {subscribe && (
                      <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                        <path d="M2 2l6 6M8 2l-6 6" stroke={isTest ? 'black' : 'white'} strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>
                  Keep me in the loop with phyto updates and news.
                </label>

                <p className={`pt-2 text-center text-[11px] ${isTest ? 'text-black/50' : 'text-white/50'}`}>
                  By signing in, you agree to the online terms of our{' '}
                  <Link to="/legal" hash="terms-online" className={`underline ${isTest ? 'hover:text-black/80' : 'hover:text-white/80'}`}>Terms of Use</Link>
                  {' '}and{' '}
                  <Link to="/legal" hash="privacy-online" className={`underline ${isTest ? 'hover:text-black/80' : 'hover:text-white/80'}`}>Privacy Policy</Link>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
