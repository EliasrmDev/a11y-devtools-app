import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { aiProviderConnections } from "./ai-provider-connections";

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(
      () => aiProviderConnections.id,
      { onDelete: "set null" },
    ),
    modelId: varchar("model_id", { length: 100 }),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    latencyMs: integer("latency_ms"),
    status: varchar("status", { length: 20 }).notNull(),
    errorCode: varchar("error_code", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_usage_user_id").on(table.userId),
    index("idx_usage_created_at").on(table.createdAt),
    index("idx_usage_user_created").on(table.userId, table.createdAt),
    index("idx_usage_connection_id").on(table.connectionId),
  ],
);
