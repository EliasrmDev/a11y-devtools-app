import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * pg-boss-compatible job queue backed by Neon Postgres.
 *
 * Status flow:  pending → running → completed
 *                                 → failed  (retried up to max_attempts)
 *                                 → dead    (max_attempts exceeded)
 */
export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    /** Unique key for idempotency — duplicate enqueues with same key are ignored */
    uniqueKey: varchar("unique_key", { length: 255 }),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_bgj_pending_run_at").on(table.status, table.runAt),
    index("idx_bgj_name_status").on(table.name, table.status),
    index("idx_bgj_unique_key").on(table.uniqueKey),
  ],
);
