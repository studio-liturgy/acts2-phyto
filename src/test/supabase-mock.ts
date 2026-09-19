// Hand-rolled stand-in for the @supabase/supabase-js client, shaped around the
// exact call patterns in src/lib/sync.ts: chainable, thenable query builders
// over an in-memory table map, with targeted error injection (e.g. "fail the
// first gatherings upsert with code 42501, then succeed").
//
// Usage:
//   vi.mock("@/lib/supabase", async () => {
//     const { supabaseMock } = await import("@/test/supabase-mock");
//     return { supabase: supabaseMock.client };
//   });
//   beforeEach(() => supabaseMock.configure({ tables: {...}, session: {...} }));

export type Row = Record<string, unknown>;
type Op = "select" | "upsert" | "update" | "delete";

export type InjectedError = {
  table: string;
  op: Op;
  error: { code?: string; message?: string };
  /** How many matching calls fail before the spec is exhausted. Default 1. */
  times?: number;
};

type Filter =
  | { kind: "eq" | "neq" | "in" | "gte" | "is"; column: string; value: unknown }
  // PostgREST `.or("a.eq.1,b.in.(x,y)")`: any one of the sub-filters matches.
  | { kind: "or"; column: ""; value: Filter[] };

export type RecordedCall = {
  table: string;
  op: Op;
  rows?: Row[];
  /** The patch handed to update(). */
  patch?: Row;
  /** The column list handed to select(), so a test can tell a metadata read
   *  ("id, updated_at") from a content download ("*"). */
  columns?: string;
  filters: Filter[];
};

/** Parse the subset of PostgREST's `.or()` filter grammar sync.ts uses:
 *  `col.eq.value` and `col.in.(v1,v2)` joined by top-level commas. */
function parseOrFilters(spec: string): Filter[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of spec) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts.map((part) => {
    const m = /^([^.]+)\.(eq|neq|in|gte|is)\.(.*)$/.exec(part);
    if (!m) throw new Error(`supabase-mock: unsupported or() filter "${part}"`);
    const [, column, kind, raw] = m;
    if (kind === "in") {
      const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
      return { kind, column, value: inner ? inner.split(",") : [] };
    }
    if (kind === "is") return { kind, column, value: raw === "null" ? null : raw };
    return { kind: kind as "eq" | "neq" | "gte", column, value: raw };
  });
}

type MockConfig = {
  tables?: Record<string, Row[]>;
  session?: unknown;
  errors?: InjectedError[];
};

class QueryBuilder implements PromiseLike<{ data: Row[] | null; error: Row | null }> {
  private op: Op = "select";
  private rows: Row[] | undefined;
  private patch: Row | undefined;
  private returning = false;
  private singleMode: "maybe" | "strict" | undefined;
  private orderBy: string | undefined;
  private rangeArg: [number, number] | undefined;
  private limitArg: number | undefined;
  private readonly call: RecordedCall;

  constructor(
    private readonly mock: SupabaseMock,
    private readonly table: string,
  ) {
    this.call = { table, op: "select", filters: [] };
  }

  select(columns?: string) {
    // After upsert()/delete() this marks "returning" mode; standalone it's a read.
    if (this.op !== "select") this.returning = true;
    this.call.columns = columns;
    return this;
  }
  upsert(rows: Row[], _opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.rows = rows;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  /** Resolve to the first row (or null) instead of an array, like PostgREST. */
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "strict";
    return this;
  }
  is(column: string, value: null) {
    this.call.filters.push({ kind: "is", column, value });
    return this;
  }
  or(spec: string) {
    this.call.filters.push({ kind: "or", column: "", value: parseOrFilters(spec) });
    return this;
  }
  eq(column: string, value: unknown) {
    this.call.filters.push({ kind: "eq", column, value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.call.filters.push({ kind: "neq", column, value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.call.filters.push({ kind: "in", column, value });
    return this;
  }
  gte(column: string, value: unknown) {
    this.call.filters.push({ kind: "gte", column, value });
    return this;
  }
  order(column: string) {
    this.orderBy = column;
    return this;
  }
  range(from: number, to: number) {
    this.rangeArg = [from, to];
    return this;
  }
  limit(n: number) {
    this.limitArg = n;
    return this;
  }

  then<R1, R2>(
    onfulfilled?: (value: { data: Row[] | null; error: Row | null }) => R1 | PromiseLike<R1>,
    onrejected?: (reason: unknown) => R2 | PromiseLike<R2>,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private static matchOne(row: Row, f: Filter): boolean {
    if (f.kind === "or") return f.value.some((sub) => QueryBuilder.matchOne(row, sub));
    const v = row[f.column];
    if (f.kind === "eq") return v === f.value;
    if (f.kind === "neq") return v !== f.value;
    if (f.kind === "in") return (f.value as unknown[]).includes(v);
    if (f.kind === "is") return f.value === null ? v == null : v === f.value;
    return typeof v === "number" && v >= (f.value as number);
  }

  private matches(row: Row): boolean {
    return this.call.filters.every((f) => QueryBuilder.matchOne(row, f));
  }

  /** Apply single()/maybeSingle() to a resolved row list. */
  private finish(rows: Row[]): { data: Row[] | null; error: Row | null } {
    if (this.singleMode === "maybe") {
      return { data: (rows[0] ?? null) as unknown as Row[] | null, error: null };
    }
    if (this.singleMode === "strict") {
      if (rows.length !== 1) {
        return { data: null, error: { code: "PGRST116", message: "expected exactly one row" } };
      }
      return { data: rows[0] as unknown as Row[], error: null };
    }
    return { data: rows, error: null };
  }

  private execute(): { data: Row[] | null; error: Row | null } {
    this.call.op = this.op;
    this.call.rows = this.rows;
    this.call.patch = this.patch;
    this.mock.calls.push(this.call);

    const injected = this.mock.takeError(this.table, this.op);
    if (injected) return { data: null, error: injected };

    const table = (this.mock.tables[this.table] ??= []);

    if (this.op === "upsert") {
      for (const row of this.rows ?? []) {
        const i = table.findIndex((r) => r.id === row.id);
        if (i >= 0) table[i] = { ...table[i], ...row };
        else table.push({ ...row });
      }
      return this.returning ? this.finish([...(this.rows ?? [])]) : { data: null, error: null };
    }

    if (this.op === "update") {
      const hit: Row[] = [];
      this.mock.tables[this.table] = table.map((r) => {
        if (!this.matches(r)) return r;
        const next = { ...r, ...(this.patch ?? {}) };
        hit.push({ ...next });
        return next;
      });
      return this.returning ? this.finish(hit) : { data: null, error: null };
    }

    if (this.op === "delete") {
      this.mock.tables[this.table] = table.filter((r) => !this.matches(r));
      return { data: null, error: null };
    }

    let rows = table.filter((r) => this.matches(r));
    if (this.orderBy) {
      const col = this.orderBy;
      rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])));
    }
    if (this.rangeArg) rows = rows.slice(this.rangeArg[0], this.rangeArg[1] + 1);
    if (this.limitArg !== undefined) rows = rows.slice(0, this.limitArg);
    return this.finish(rows.map((r) => ({ ...r })));
  }
}

class SupabaseMock {
  tables: Record<string, Row[]> = {};
  calls: RecordedCall[] = [];
  private session: unknown = null;
  private errors: InjectedError[] = [];

  readonly client = {
    from: (table: string) => new QueryBuilder(this, table),
    auth: {
      getSession: async () => ({ data: { session: this.session } }),
    },
  };

  configure({ tables = {}, session = null, errors = [] }: MockConfig = {}) {
    // Deep-copy fixtures so a test's table snapshot can't leak into the next.
    this.tables = JSON.parse(JSON.stringify(tables)) as Record<string, Row[]>;
    this.session = session;
    this.errors = errors.map((e) => ({ times: 1, ...e }));
    this.calls = [];
  }

  takeError(table: string, op: Op): Row | null {
    const spec = this.errors.find((e) => e.table === table && e.op === op && (e.times ?? 1) > 0);
    if (!spec) return null;
    spec.times = (spec.times ?? 1) - 1;
    return { ...spec.error };
  }

  /** Calls of one op against one table, in order. */
  callsFor(table: string, op: Op): RecordedCall[] {
    return this.calls.filter((c) => c.table === table && c.op === op);
  }
}

export const supabaseMock = new SupabaseMock();
