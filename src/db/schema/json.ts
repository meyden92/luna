/**
 * The value type of a `jsonb` column.
 *
 * Drizzle types `jsonb()` as `unknown` by default, which TanStack Start refuses
 * to serialise across the server-function boundary — it cannot prove an unknown
 * is JSON. Prisma supplied `Prisma.JsonValue` for the same reason; this is the
 * replacement, applied with `.$type<JsonValue>()` on every jsonb column.
 *
 * `Json` maps to `jsonb` rather than `json` per issue #23. That is not a no-op:
 * jsonb normalises key order, whitespace and duplicate keys on write. Safe for
 * the 28 columns here, which hold structured payloads rather than raw text, but
 * any code comparing serialised JSON byte-for-byte would break.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
