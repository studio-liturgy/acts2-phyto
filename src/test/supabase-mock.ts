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
type Op = "select" | "upsert" | "delete";

export type InjectedError = {
  table: string;
  op: Op;
  error: { code?: string; message?: string };
  /** How many matching calls fail before the spec is exhausted. Default 1. */
  times?: number;
};

export type RecordedCall = {
  table: string;
  op: Op;
  rows?: Row[];
  filters: { kind: "eq" | "in" | "gte"; column: string; value: unknown }[];
};

type MockConfig = {
  tables?: Record<string, Row[]>;
  session?: unknown;
  errors?: InjectedError[];
};

class QueryBuilder implements PromiseLike<{ data: Row[] | null; error: Row | null }> {
  private op: Op = "select";
  private rows: Row[] | undefined;
  private returning = false;
  private orderBy: string | undefined;
  private rangeArg: [number, number] | undefined;
  private readonly call: RecordedCall;

  constructor(
    private readonly mock: SupabaseMock,
    private readonly table: string,
  ) {
    this.call = { table, op: "select", filters: [] };
  }

  select(_columns?: string) {
    // After upsert()/delete() this marks "returning" mode; standalone it's a read.
    if (this.op !== "select") this.returning = true;
    return this;
  }
  upsert(rows: Row[], _opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.rows = rows;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.call.filters.push({ kind: "eq", column, value });
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

  then<R1, R2>(
    onfulfilled?: (value: { data: Row[] | null; error: Row | null }) => R1 | PromiseLike<R1>,
    onrejected?: (reason: unknown) => R2 | PromiseLike<R2>,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.call.filters.every((f) => {
      const v = row[f.column];
      if (f.kind === "eq") return v === f.value;
      if (f.kind === "in") return (f.value as unknown[]).includes(v);
      return typeof v === "number" && v >= (f.value as number);
    });
  }

  private execute(): { data: Row[] | null; error: Row | null } {
    this.call.op = this.op;
    this.call.rows = this.rows;
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
      return { data: this.returning ? [...(this.rows ?? [])] : null, error: null };
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
    return { data: rows.map((r) => ({ ...r })), error: null };
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
