import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useLibrary } from "@/lib/store";
import { NO_IDS, NO_SETS, phoneKindBg } from "@/lib/phone-layout";
import { songPatternStyle, songPatterns } from "@/lib/song-layout";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Pick a set from your catalogue to add to a live gathering, from the phone
 * view (/g): a full-screen list with a search, newest first.
 */
export function PhoneAddSetSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (setId: string) => void;
}) {
  const sets = useLibrary((s) => s.sets ?? NO_SETS);
  const order = useLibrary((s) => s.order ?? NO_IDS);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return order
      .map((id) => sets[id])
      .filter((d) => d && (!q || d.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [order, sets, query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setQuery("");
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
        aria-describedby={undefined}
      >
        <div className="shrink-0 px-5 pb-3 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <DialogTitle className="pr-10 text-2xl font-normal leading-tight">Add a set</DialogTitle>
          <div className="pill mt-5 flex items-center gap-2 border border-foreground px-4 py-2">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="mono uppercase min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {rows.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => {
                  onPick(d.id);
                  setQuery("");
                  onOpenChange(false);
                }}
                className={`pill flex w-full items-center gap-3 px-5 py-2.5 text-left ${phoneKindBg(d.kind)}`}
                style={songPatternStyle(songPatterns(d), 9, 0.07)}
              >
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="mono shrink-0 text-[10px] uppercase tracking-wider opacity-90">
                  {d.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
