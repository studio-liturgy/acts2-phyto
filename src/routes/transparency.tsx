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
  const d = new Date(`${dateStr}T00:00:00`);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}.${dd}.${yy}`;
}

function StatSkeleton() {
  return (
    <span className="inline-block h-9 w-20 animate-pulse rounded bg-[var(--brand-white)]/15" />
  );
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

        {/* Stats */}
        <div className="mt-12 grid grid-cols-2 gap-4 border-t border-[var(--brand-white)]/20 pt-8">
          <div>
            <div className="text-4xl">
              {stats ? stats.accounts.toLocaleString() : <StatSkeleton />}
            </div>
            <div className="mono mt-2 text-xs uppercase tracking-wider opacity-70">Accounts</div>
          </div>
          <div>
            <div className="text-4xl">{stats ? stats.sets.toLocaleString() : <StatSkeleton />}</div>
            <div className="mono mt-2 text-xs uppercase tracking-wider opacity-70">
              Sets created
            </div>
          </div>
        </div>

        {/* Finances summary */}
        <div className="mt-12 grid grid-cols-2 gap-4 border-t border-[var(--brand-white)]/20 pt-8">
          <div>
            <div className="text-4xl">
              {entries ? formatMoney(totalDonations) : <StatSkeleton />}
            </div>
            <div className="mono mt-2 text-xs uppercase tracking-wider opacity-70">
              Total donations
            </div>
          </div>
          <div>
            <div className="text-4xl">
              {entries ? formatMoney(totalExpenses) : <StatSkeleton />}
            </div>
            <div className="mono mt-2 text-xs uppercase tracking-wider opacity-70">
              Total expenses
            </div>
          </div>
        </div>
        <p className="mono mt-4 text-xs uppercase tracking-wider opacity-60">
          All amounts are in CAD.
        </p>

        {error && (
          <p className="mt-8 text-sm opacity-70">Couldn&rsquo;t load the ledger right now.</p>
        )}

        {/* Donations */}
        <section className="mt-16">
          <h2 className="mono text-xs uppercase tracking-wider opacity-70">Donations</h2>
          <div className="mono mt-4 overflow-x-auto uppercase">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="text-left tracking-wider opacity-60">
                  <th className="pb-2 font-normal">Date</th>
                  <th className="pb-2 font-normal text-right">Amount</th>
                  <th className="pb-2 font-normal text-right">Fees</th>
                  <th className="pb-2 font-normal text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brand-white)]/10">
                {donations.map((e) => (
                  <tr key={e.id}>
                    <td className="py-3 text-left">{formatDate(e.entry_date)}</td>
                    <td className="py-3 text-right tabular-nums">{formatMoney(e.amount)}</td>
                    <td className="py-3 text-right tabular-nums opacity-70">
                      {formatMoney(e.fees)}
                    </td>
                    <td className="py-3 text-right tabular-nums">{formatMoney(e.net_amount)}</td>
                  </tr>
                ))}
                {entries && donations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 opacity-70">
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
          <div className="mono mt-4 overflow-x-auto uppercase">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="text-left tracking-wider opacity-60">
                  <th className="pb-2 font-normal">Date</th>
                  <th className="pb-2 font-normal">Description</th>
                  <th className="pb-2 font-normal text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brand-white)]/10">
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="py-3 text-left">{formatDate(e.entry_date)}</td>
                    <td className="py-3">{e.description}</td>
                    <td className="py-3 text-right tabular-nums">{formatMoney(e.amount)}</td>
                  </tr>
                ))}
                {entries && expenses.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 opacity-70">
                      No expenses recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mono mt-16 text-xs uppercase leading-relaxed opacity-70">
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
