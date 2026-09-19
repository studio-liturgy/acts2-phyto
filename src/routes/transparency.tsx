import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/lib/appConfig";

export const Route = createFileRoute("/transparency")({
  head: () => ({
    meta: [
      { title: `Transparency | ${APP_NAME}` },
      {
        name: "description",
        content: "Live stats, donations, and expenses behind phyto - all made public.",
      },
      { property: "og:title", content: `Transparency | ${APP_NAME}` },
      {
        property: "og:description",
        content: "Live stats, donations, and expenses behind phyto - all made public.",
      },
      { property: "og:url", content: "https://phyto.live/transparency" },
    ],
    links: [{ rel: "canonical", href: "https://phyto.live/transparency" }],
  }),
  component: TransparencyPage,
});

type Entry = {
  id: string;
  type: "donation" | "expense";
  entry_date: string;
  description: string | null;
  amount: number;
  fees: number;
  net_amount: number;
};

type Stats = { accounts: number; sets: number };

// Everything on this page is in CAD (see the note under the intro), so
// amounts are just formatted as plain dollars rather than per-row currency.
function formatMoney(amount: number) {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function TransparencyPage() {
  usePageBackgroundColor("var(--brand-blue)");
  const [stats, setStats] = useState<Stats | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/public/stats")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok) setStats({ accounts: json.accounts, sets: json.sets });
      })
      .catch(() => {});

    supabase
      .from("transparency_entries")
      .select("id, type, entry_date, description, amount, fees, net_amount")
      .order("entry_date", { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(true);
          return;
        }
        setEntries((data as Entry[]) ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const donations = entries?.filter((e) => e.type === "donation") ?? [];
  const expenses = entries?.filter((e) => e.type === "expense") ?? [];
  // Total donations reflects what actually landed after processor fees.
  const totalDonations = donations.reduce((sum, e) => sum + e.net_amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.net_amount, 0);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link
          to="/"
          className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"
        >
          <ArrowLeft className="h-3 w-3" /> BACK
        </Link>

        <h1 className="mt-6 text-5xl">Transparency</h1>
        <p className="mt-6 max-w-xl text-sm leading-relaxed opacity-90 md:text-[0.95rem]">
          phyto is free and runs on donations. Here&rsquo;s what&rsquo;s come in, what it&rsquo;s
          gone toward, and how things are growing - updated as it happens.
        </p>
        <p className="mono mt-4 text-xs uppercase tracking-wider opacity-60">
          All amounts are in CAD.
        </p>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-2 gap-4 border-t border-[var(--brand-white)]/20 pt-8">
          <div>
            <div className="text-4xl">{stats ? stats.accounts.toLocaleString() : "—"}</div>
            <div className="mono mt-2 text-xs uppercase tracking-wider opacity-70">Accounts</div>
          </div>
          <div>
            <div className="text-4xl">{stats ? stats.sets.toLocaleString() : "—"}</div>
            <div className="mono mt-2 text-xs uppercase tracking-wider opacity-70">
              Sets created
            </div>
          </div>
        </div>

        {/* Finances summary */}
        <div className="mt-12 grid grid-cols-2 gap-4 border-t border-[var(--brand-white)]/20 pt-8">
          <div>
            <div className="text-4xl">{entries ? formatMoney(totalDonations) : "—"}</div>
            <div className="mono mt-2 text-xs uppercase tracking-wider opacity-70">
              Total donations
            </div>
          </div>
          <div>
            <div className="text-4xl">{entries ? formatMoney(totalExpenses) : "—"}</div>
            <div className="mono mt-2 text-xs uppercase tracking-wider opacity-70">
              Total expenses
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-8 text-sm opacity-70">Couldn&rsquo;t load the ledger right now.</p>
        )}

        {/* Donations */}
        <section className="mt-16">
          <h2 className="mono text-xs uppercase tracking-wider opacity-70">Donations</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="mono text-left text-xs uppercase tracking-wider opacity-60">
                  <th className="pb-2 font-normal">Date</th>
                  <th className="pb-2 font-normal text-right">Amount</th>
                  <th className="pb-2 font-normal text-right">Fees</th>
                  <th className="pb-2 font-normal text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brand-white)]/10">
                {donations.map((e) => (
                  <tr key={e.id}>
                    <td className="py-3">{formatDate(e.entry_date)}</td>
                    <td className="py-3 text-right tabular-nums">{formatMoney(e.amount)}</td>
                    <td className="py-3 text-right tabular-nums opacity-70">
                      {formatMoney(e.fees)}
                    </td>
                    <td className="py-3 text-right tabular-nums">{formatMoney(e.net_amount)}</td>
                  </tr>
                ))}
                {entries && donations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-sm opacity-70">
                      No donations recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Expenses */}
        <section className="mt-12">
          <h2 className="mono text-xs uppercase tracking-wider opacity-70">Expenses</h2>
          <ul className="mt-4 divide-y divide-[var(--brand-white)]/10">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{e.description}</div>
                  <div className="mono mt-1 text-xs uppercase tracking-wider opacity-60">
                    {formatDate(e.entry_date)}
                  </div>
                </div>
                <div className="shrink-0 tabular-nums">{formatMoney(e.amount)}</div>
              </li>
            ))}
            {entries && expenses.length === 0 && (
              <li className="py-3 text-sm opacity-70">No expenses recorded yet.</li>
            )}
          </ul>
        </section>

        <p className="mono mt-16 max-w-xl text-xs uppercase leading-relaxed opacity-70">
          Time spent on phyto is left out of expenses. This is a voluntary passion project.
        </p>

        <div className="mt-12">
          <BackToTop />
        </div>
      </main>

      <Footer className="mt-0" />
    </div>
  );
}
