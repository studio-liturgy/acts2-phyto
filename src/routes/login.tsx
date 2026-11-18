import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { fitFontSize } from "@/lib/fit-text";
import { isTesterEmail, signInWithEmail, signInWithPassword, verifyEmailCode } from "@/lib/auth";
import { isReviewEmail } from "@/lib/review-account";
import { TESTERS_ONLY } from "@/lib/testers";
import { TestersOnlyDialog } from "@/components/TestersOnlyDialog";
import { sendWelcomeIfNew } from "@/lib/welcome";
import { supabase } from "@/lib/supabase";
import { safeNextPath } from "@/lib/session-lost";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { APP_NAME } from "@/lib/appConfig";
import { usePhoneLayout } from "@/hooks/use-phone-layout";
import { useNativeApp } from "@/hooks/use-native-app";
import { canSignInWithApple, signInWithAppleInApp, signInWithGoogleInApp } from "@/lib/app-sign-in";
import { PHONE_UI } from "@/lib/phone-layout";
import { PHONE_BTN_TEXT } from "@/lib/phone-buttons";
import wordmark from "@/assets/wordmark.svg";
import wordmarkTestBlack from "@/assets/wordmark-test-black.svg";
import loginBg from "@/assets/login-bg.jpg";
import loginBgOr from "@/assets/login-bg-or.jpg";
import { useImageReady } from "@/hooks/use-image-ready";

const isTestBuild = import.meta.env.VITE_APP_ENV === "test";

// Bundled (hashed, cached for good, and in the app's offline cache), so it's
// already on the device on every visit after the first. The phyto app always
// shows the normal picture and wordmark, even on the test build.
const loginBgFor = (exp: boolean) => (exp ? loginBgOr : loginBg);
// The picture's average colour, shown until it has fully decoded.
const loginBgFillFor = (exp: boolean) => (exp ? "#c08060" : "#407fa1");

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { error?: string; next?: string } => {
    const next = safeNextPath(search.next);
    return {
      ...(typeof search.error === "string" ? { error: search.error } : {}),
      ...(next ? { next } : {}),
    };
  },
  head: () => ({
    meta: [{ title: `Sign In | ${APP_NAME}` }, { name: "robots", content: "noindex" }],
    links: [{ rel: "preload", as: "image", href: loginBgFor(isTestBuild) }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { error: callbackError, next } = Route.useSearch();
  const navigate = useNavigate();
  const native = useNativeApp();
  const nativeApp = native !== null;
  // The test build's look (orange picture, phytoexp wordmark), except in the app.
  const isTest = isTestBuild && !nativeApp;
  const LOGIN_BG = loginBgFor(isTest);
  const LOGIN_BG_FILL = loginBgFillFor(isTest);
  const bgReady = useImageReady(LOGIN_BG);
  // Sign in with Apple: the iPhone app's native sheet (a build that has it).
  const appleIn = native === "ios" && canSignInWithApple();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const review = isReviewEmail(email);
  const [subscribe, setSubscribe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(callbackError ?? null);
  const [notTester, setNotTester] = useState(false);
  // Phone: button words in the big button size (Delete gathering's).
  const phone = usePhoneLayout() === true && PHONE_UI;
  // Phone: the Settings pills' small mono (Sign out, Delete Account).
  const btnText = phone ? PHONE_BTN_TEXT : "text-sm";
  // Sign in with Google / Apple: outlined pills on a phone (like Cancel),
  // filled on a computer.
  const ssoBtn = phone
    ? `border ${isTest ? "border-[var(--brand-black)] text-[var(--brand-black)]" : "border-white text-white"}`
    : isTest
      ? "bg-[var(--brand-black)] text-[var(--brand-white)]"
      : "bg-white text-[var(--brand-blue)]";
  // Phone: "Keep me in the loop" sized to run edge to edge under the buttons.
  const loopRow = useRef<HTMLLabelElement>(null);
  const loopText = useRef<HTMLSpanElement>(null);
  const [loopSize, setLoopSize] = useState<number | null>(null);
  useLayoutEffect(() => {
    const row = loopRow.current;
    const text = loopText.current;
    if (!phone || !row || !text) return;
    const fit = () => {
      const size = parseFloat(getComputedStyle(text).fontSize);
      // The room right of the box (the box plus its 8px gap), whatever the
      // row's current layout.
      const box = text.previousElementSibling?.getBoundingClientRect().width ?? 14;
      const avail = row.getBoundingClientRect().width - box - 8;
      const next = fitFontSize(size, text.getBoundingClientRect().width, avail, {
        min: 8,
        max: 14,
      });
      setLoopSize((s) => (s === next ? s : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(row);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [phone, step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    sessionStorage.setItem("phyto-subscribe", String(subscribe));
    if (TESTERS_ONLY) {
      // phytoexp.live: check the tester list before any code (or account) exists.
      const ok = await isTesterEmail(email);
      if (ok !== true) {
        setSubmitting(false);
        if (ok === false) setNotTester(true);
        else setError("Couldn't check the tester list. Try again.");
        return;
      }
    }
    if (review) {
      const { error } = await signInWithPassword(email, password);
      if (error) {
        setSubmitting(false);
        setError(error.message);
        return;
      }
      navigate({ href: next ?? "/" });
      return;
    }
    const { error } = await signInWithEmail(email);
    setSubmitting(false);
    if (error) {
      setError(error.message);
    } else {
      setCode("");
      setStep("code");
    }
  };

  const handleVerify = async (value: string) => {
    setError(null);
    setSubmitting(true);
    const { data, error } = await verifyEmailCode(email, value);
    if (error) {
      setSubmitting(false);
      setError(error.message);
      setCode("");
      return;
    }
    if (data.user) await sendWelcomeIfNew(data.user);
    navigate({ href: next ?? "/" });
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) handleVerify(code);
  };

  const handleResend = async () => {
    setError(null);
    setCode("");
    const { error } = await signInWithEmail(email);
    if (error) setError(error.message);
  };

  return (
    <div className="relative min-h-screen" style={{ backgroundColor: LOGIN_BG_FILL }}>
      {/* The picture appears whole, never painting in strips: hidden until
          decoded (at once when it's already cached, else a short fade). */}
      <div
        aria-hidden
        className={`absolute inset-0 bg-cover bg-center ${
          bgReady === "instant" ? "" : "transition-opacity duration-300"
        } ${bgReady ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundImage: `url('${LOGIN_BG}')` }}
      />
      {/* Mobile: single centered column. Desktop: two-column grid */}
      <div className="relative flex min-h-screen flex-col items-center justify-center lg:grid lg:grid-cols-2 lg:items-stretch lg:justify-normal">
        {/* Left — wordmark */}
        <div className="mb-8 flex justify-center lg:mb-0 lg:items-center lg:px-16">
          <Link to="/">
            <img
              src={isTest ? wordmarkTestBlack : wordmark}
              alt={isTest ? "phytoexp" : "phyto"}
              className="w-45 lg:w-80"
            />
          </Link>
        </div>

        {/* Right — form or success */}
        <div
          className={`flex w-full items-center justify-center px-8 ${nativeApp ? "pb-20" : "pb-8"} lg:px-16 lg:py-0`}
        >
          <div className="w-full max-w-sm">
            {step === "code" ? (
              <div className={`space-y-4 text-center ${isTest ? "text-black" : "text-white"}`}>
                <p className="mono uppercase text-sm lg:text-base">Enter your sign-in code</p>
                <p className="text-sm opacity-70">We sent a 6-digit code to {email}.</p>
                <form onSubmit={handleCodeSubmit} className="space-y-4">
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={code}
                      onChange={(value) => {
                        setCode(value);
                        if (value.length === 6) handleVerify(value);
                      }}
                      disabled={submitting}
                      autoFocus
                    >
                      <InputOTPGroup className="gap-2">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot
                            key={i}
                            index={i}
                            className={`mono h-12 w-10 rounded-md border text-lg ${
                              isTest
                                ? "border-black/40 text-black"
                                : "border-white/60 bg-transparent text-white"
                            }`}
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || code.length !== 6}
                    className={`mono uppercase ${btnText} w-full rounded-full px-6 py-3 transition hover:opacity-90 disabled:opacity-50 ${isTest ? "bg-[var(--brand-black)] text-[var(--brand-white)]" : "bg-white text-[var(--brand-blue)]"}`}
                  >
                    {submitting ? "verifying…" : "sign in"}
                  </button>
                </form>

                {error && (
                  <p
                    className={`text-center text-sm ${isTest ? "text-black/80" : "text-white/80"}`}
                  >
                    {error}
                  </p>
                )}

                <p className="text-sm opacity-70">
                  Didn't get it? Check your spam folder or{" "}
                  <button type="button" onClick={handleResend} className="underline">
                    resend the code
                  </button>
                  .
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setError(null);
                  }}
                  className={`mono uppercase text-[11px] underline opacity-70 ${isTest ? "text-black" : "text-white"}`}
                >
                  use a different email
                </button>
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
                        ? "border border-black/40 text-black placeholder-black/50 focus:border-black"
                        : "border border-white/60 text-white placeholder-white/50 focus:border-white"
                    }`}
                  />
                  {review && (
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="password"
                      autoComplete="current-password"
                      required
                      className={`mono text-sm w-full rounded-full bg-transparent px-6 py-3 text-center outline-none ${
                        isTest
                          ? "border border-black/40 text-black placeholder-black/50 focus:border-black"
                          : "border border-white/60 text-white placeholder-white/50 focus:border-white"
                      }`}
                    />
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`mono uppercase ${btnText} w-full rounded-full px-6 py-3 transition hover:opacity-90 disabled:opacity-50 ${isTest ? "bg-[var(--brand-black)] text-[var(--brand-white)]" : "bg-white text-[var(--brand-blue)]"}`}
                  >
                    {submitting
                      ? review
                        ? "signing in…"
                        : "sending…"
                      : review
                        ? "sign in"
                        : "continue"}
                  </button>
                </form>

                <div className="flex items-center gap-3 py-1">
                  <hr className={`flex-1 ${isTest ? "border-black/40" : "border-white/40"}`} />
                  <span className={`text-sm ${isTest ? "text-black/80" : "text-white/80"}`}>
                    or
                  </span>
                  <hr className={`flex-1 ${isTest ? "border-black/40" : "border-white/40"}`} />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem("phyto-subscribe", String(subscribe));
                    // The app: Google's page opens in the system sign-in sheet
                    // and comes straight back (Google refuses app web views).
                    if (nativeApp) {
                      void signInWithGoogleInApp().then((r) => {
                        if (r.ok) window.location.assign(r.callbackPath);
                        else if (!r.cancelled) setError(r.error);
                      });
                      return;
                    }
                    supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: { redirectTo: window.location.origin + "/auth/callback" },
                    });
                  }}
                  // With Apple under it: 4px apart (his call: closer than Sign out and
                  // Delete Account; the column's space-y-3 puts 12px under this one).
                  style={appleIn ? { marginBlockEnd: "0.25rem" } : undefined}
                  className={`mono uppercase ${btnText} w-full rounded-full px-6 py-3 transition hover:opacity-90 ${ssoBtn}`}
                >
                  sign in with Google
                </button>

                {/* The iPhone app: Sign in with Apple, full width under Google,
                    same size and shape (the native sheet). */}
                {appleIn && (
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem("phyto-subscribe", String(subscribe));
                      void signInWithAppleInApp().then(async (r) => {
                        if (!r.ok) {
                          if (!r.cancelled) setError(r.error);
                          return;
                        }
                        const { data } = await supabase.auth.getUser();
                        const user = data.user;
                        if (
                          user &&
                          (!TESTERS_ONLY || (await isTesterEmail(user.email ?? "")) === true)
                        ) {
                          await sendWelcomeIfNew(user);
                        }
                      });
                    }}
                    className={`mono uppercase ${btnText} w-full rounded-full px-6 py-3 transition hover:opacity-90 ${ssoBtn}`}
                  >
                    sign in with Apple
                  </button>
                )}

                {error && (
                  <p
                    className={`pt-1 text-center text-sm ${isTest ? "text-black/80" : "text-white/80"}`}
                  >
                    {error}
                  </p>
                )}

                <label
                  ref={loopRow}
                  className={`mono flex cursor-pointer items-center gap-2 pt-1 uppercase ${phone ? "justify-between whitespace-nowrap" : "justify-center text-[11px]"} ${isTest ? "text-black/70" : "text-white/70"}`}
                  style={phone ? { fontSize: loopSize ?? 11 } : undefined}
                >
                  {/* The hidden checkbox sits inside the box, so the row holds
                      only the box and the words. */}
                  <div
                    className={`relative flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${isTest ? "border-black" : "border-white"}`}
                  >
                    <input
                      type="checkbox"
                      checked={subscribe}
                      onChange={(e) => setSubscribe(e.target.checked)}
                      className="sr-only"
                    />
                    {subscribe && (
                      <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M2 2l6 6M8 2l-6 6"
                          stroke={isTest ? "black" : "white"}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </div>
                  <span ref={loopText}>Keep me in the loop with phyto updates and news.</span>
                </label>

                <p
                  className={`pt-2 text-center text-[11px] ${isTest ? "text-black/50" : "text-white/50"}`}
                >
                  By signing in, you agree to the online terms of our{" "}
                  <Link
                    to="/legal"
                    hash="terms-online"
                    className={`underline ${isTest ? "hover:text-black/80" : "hover:text-white/80"}`}
                  >
                    Terms of Use
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/legal"
                    hash="privacy-online"
                    className={`underline ${isTest ? "hover:text-black/80" : "hover:text-white/80"}`}
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* The app has no browser Back: leave sign in from here, at the foot,
          in the same pill as Sign in with Google. */}
      {nativeApp && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center px-8 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
          <button
            type="button"
            onClick={() =>
              window.history.length > 1 ? window.history.back() : navigate({ to: "/" })
            }
            className={`mono uppercase ${btnText} w-full max-w-sm rounded-full border px-6 py-3 transition hover:opacity-70 ${isTest ? "border-[var(--brand-black)] text-[var(--brand-black)]" : "border-white text-white"}`}
          >
            Cancel
          </button>
        </div>
      )}
      {TESTERS_ONLY && <TestersOnlyDialog open={notTester} onOpenChange={setNotTester} />}
    </div>
  );
}
