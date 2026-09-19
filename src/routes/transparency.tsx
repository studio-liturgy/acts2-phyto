import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
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

// Everything on this page is in CAD (see the note at the bottom), so
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
    <span className="inline-block h-24 sm:h-28 md:h-32 w-48 sm:w-56 md:w-64 animate-pulse rounded bg-[var(--brand-white)]/15" />
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <div className="text-7xl tracking-[-0.045em] sm:text-8xl md:text-9xl">{value}</div>
      <div className="mono text-xs uppercase tracking-wider whitespace-nowrap opacity-70">
        {label}
      </div>
    </div>
  );
}

/** Funding bar: donations as a percentage of expenses. Full (or over) shows as
 *  a single solid pill; hovering always shows exactly how things stand. */
function FundingBar({
  totalDonations,
  totalExpenses,
}: {
  totalDonations: number;
  totalExpenses: number;
}) {
  const fullyFunded = totalExpenses <= 0 || totalDonations >= totalExpenses;
  const pct = fullyFunded ? 100 : (totalDonations / totalExpenses) * 100;
  const remaining = Math.max(totalExpenses - totalDonations, 0);

  return (
    <div className="group relative mt-12">
      <div className="h-7 w-full overflow-hidden rounded-full bg-[var(--brand-white)]/25">
        <div
          className="h-full rounded-full bg-[var(--brand-white)] transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className="mono pointer-events-none absolute bottom-full mb-2 rounded-full bg-[var(--brand-white)] px-4 py-1.5 text-xs uppercase tracking-wider whitespace-nowrap text-[var(--brand-blue)] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ right: `${100 - Math.min(Math.max(pct, 16), 100)}%` }}
      >
        {fullyFunded ? "Fully funded!" : `${formatMoney(remaining)} remaining`}
      </div>
    </div>
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16 md:px-10">
        <Link
          to="/"
          className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"
        >
          <ArrowLeft className="h-3 w-3" /> BACK
        </Link>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <Stat
            value={stats ? stats.accounts.toLocaleString() : <StatSkeleton />}
            label="Accounts"
          />
          <Stat
            value={stats ? stats.sets.toLocaleString() : <StatSkeleton />}
            label="Sets created"
          />
        </div>

        {/* Funding bar */}
        {entries ? (
          <FundingBar totalDonations={totalDonations} totalExpenses={totalExpenses} />
        ) : (
          <div className="mt-12 h-7 w-full animate-pulse rounded-full bg-[var(--brand-white)]/15" />
        )}

        {/* Totals */}
        <div className="mono mt-6 flex flex-col gap-1 text-base uppercase tracking-wider sm:flex-row sm:items-baseline sm:justify-between sm:gap-2 sm:text-lg">
          <div>Total donations: {entries ? formatMoney(totalDonations) : "—"}</div>
          <div>Total expenses: {entries ? formatMoney(totalExpenses) : "—"}</div>
        </div>

        {error && (
          <p className="mt-8 text-sm opacity-70">Couldn&rsquo;t load the ledger right now.</p>
        )}

        {/* Donations / Expenses */}
        <div className="mt-16 grid grid-cols-1 gap-x-24 gap-y-16 md:grid-cols-2">
          <section>
            <h2 className="mono text-xs uppercase tracking-wider opacity-70">Donations</h2>
            <div className="mono mt-4 overflow-x-auto uppercase">
              <table className="w-full text-xs md:min-w-[420px]">
                <thead>
                  <tr className="text-left tracking-wider opacity-60">
                    <th className="pb-2 font-normal">Date</th>
                    <th className="pb-2 pl-3 font-normal text-right sm:pl-6">Amount</th>
                    <th className="pb-2 pl-3 font-normal text-right sm:pl-6">Fees</th>
                    <th className="pb-2 pl-3 font-normal text-right sm:pl-6">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--brand-white)]/10">
                  {donations.map((e) => (
                    <tr key={e.id}>
                      <td className="py-3 text-left opacity-70">{formatDate(e.entry_date)}</td>
                      <td className="py-3 pl-3 text-right tabular-nums sm:pl-6">
                        {formatMoney(e.amount)}
                      </td>
                      <td className="py-3 pl-3 text-right tabular-nums opacity-70 sm:pl-6">
                        {formatMoney(e.fees)}
                      </td>
                      <td className="py-3 pl-3 text-right tabular-nums sm:pl-6">
                        {formatMoney(e.net_amount)}
                      </td>
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

          <section>
            <h2 className="mono text-xs uppercase tracking-wider opacity-70">Expenses</h2>
            <div className="mono mt-4 uppercase">
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="text-left tracking-wider opacity-60">
                    <th className="w-[4.5rem] pb-2 font-normal sm:w-20">Date</th>
                    <th className="pb-2 pl-3 font-normal sm:pl-6">Description</th>
                    <th className="w-[4.5rem] pb-2 pl-3 font-normal text-right sm:w-24 sm:pl-6">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--brand-white)]/10">
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="py-3 text-left whitespace-nowrap opacity-70">
                        {formatDate(e.entry_date)}
                      </td>
                      <td className="truncate py-3 pl-3 sm:pl-6">{e.description}</td>
                      <td className="py-3 pl-3 text-right tabular-nums sm:pl-6">
                        {formatMoney(e.amount)}
                      </td>
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
        </div>

        <div className="mono mt-16 space-y-2 text-xs uppercase leading-relaxed opacity-70">
          <p>Time spent on phyto is left out of expenses. This is a voluntary passion project.</p>
          <p>All amounts are in CAD.</p>
        </div>
      </main>

      <Footer className="mt-0" />
    </div>
  );
}
